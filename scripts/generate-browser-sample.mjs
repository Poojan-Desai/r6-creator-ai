import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";

// Original shapes and a synthesized tone only: no images, fonts or recordings.
const width = 640;
const height = 360;
const fps = 24;
const duration = 12;
const directory = fileURLToPath(
  new URL("../browser-lab/studio/sample/", import.meta.url),
);
const temporary = `${directory}clip.pending.mp4`;
const destination = `${directory}clip.mp4`;

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = [];
    const errors = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(Buffer.concat(output).toString());
      else reject(new Error(Buffer.concat(errors).toString()));
    });
  });
}

function frameAt(frameNumber) {
  const frame = Buffer.alloc(width * height * 3);
  const seconds = frameNumber / fps;
  const rectangle = (x, y, w, h, color) => {
    const left = Math.max(0, Math.round(x));
    const right = Math.min(width, Math.round(x + w));
    const top = Math.max(0, Math.round(y));
    const bottom = Math.min(height, Math.round(y + h));
    for (let py = top; py < bottom; py++)
      for (let px = left; px < right; px++) {
        const offset = (py * width + px) * 3;
        frame[offset] = color[0];
        frame[offset + 1] = color[1];
        frame[offset + 2] = color[2];
      }
  };
  const circle = (cx, cy, radius, color, inner = 0) => {
    const limit = radius ** 2;
    for (
      let y = Math.max(0, Math.floor(cy - radius));
      y < Math.min(height, cy + radius);
      y++
    )
      for (
        let x = Math.max(0, Math.floor(cx - radius));
        x < Math.min(width, cx + radius);
        x++
      ) {
        const distance = (x - cx) ** 2 + (y - cy) ** 2;
        if (distance > limit || distance < inner ** 2) continue;
        const offset = (y * width + x) * 3;
        frame[offset] = color[0];
        frame[offset + 1] = color[1];
        frame[offset + 2] = color[2];
      }
  };
  const phase = seconds < 6 ? 0 : 1;
  rectangle(0, 0, width, height, phase ? [21, 26, 44] : [14, 29, 38]);
  for (let x = 0; x < width; x += 40) rectangle(x, 0, 1, height, [29, 45, 57]);
  for (let y = 0; y < height; y += 40) rectangle(0, y, width, 1, [29, 45, 57]);
  rectangle(32, 32, 576, 5, [65, 96, 117]);
  rectangle(32, 323, 576, 5, [65, 96, 117]);
  rectangle(32, 323, (576 * seconds) / duration, 5, [81, 224, 191]);
  const progress = seconds / duration;
  const cx = 84 + progress * 472;
  const cy = 169 + Math.sin(progress * Math.PI * 4) * 66;
  circle(cx, cy, 43, [30, 80, 85]);
  circle(cx, cy, 31, [81, 224, 191]);
  circle(cx - 9, cy - 10, 7, [184, 250, 231]);
  circle(
    320,
    180,
    91 + Math.sin(progress * Math.PI * 8) * 8,
    [64, 98, 121],
    88 + Math.sin(progress * Math.PI * 8) * 8,
  );
  const squareX = 524 - progress * 472;
  const squareY = 163 - Math.cos(progress * Math.PI * 4) * 60;
  rectangle(squareX, squareY, 37, 37, [245, 164, 95]);
  rectangle(squareX + 7, squareY + 7, 23, 23, [53, 49, 55]);
  for (let i = 0; i < 12; i++)
    rectangle(
      45 + i * 46,
      293,
      25,
      7,
      seconds >= i ? [81, 224, 191] : [45, 64, 78],
    );
  return frame;
}

await mkdir(directory, { recursive: true });
if (!ffmpegPath)
  throw new Error("The bundled FFmpeg executable is unavailable.");
const args = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-f",
  "rawvideo",
  "-pixel_format",
  "rgb24",
  "-video_size",
  `${width}x${height}`,
  "-framerate",
  String(fps),
  "-i",
  "pipe:0",
  "-f",
  "lavfi",
  "-i",
  `sine=frequency=220:sample_rate=48000:duration=${duration}`,
  "-map",
  "0:v:0",
  "-map",
  "1:a:0",
  "-t",
  String(duration),
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "26",
  "-pix_fmt",
  "yuv420p",
  "-threads",
  "1",
  "-c:a",
  "aac",
  "-b:a",
  "48k",
  "-af",
  "volume=0.12,afade=t=in:st=0:d=0.25,afade=t=out:st=11.5:d=0.5",
  "-map_metadata",
  "-1",
  "-metadata",
  "title=Original synthetic motion sample",
  "-metadata:s:a:0",
  "title=Synthetic quiet tone",
  "-metadata:s:a:0",
  "handler_name=Synthetic quiet tone",
  "-movflags",
  "+faststart",
  temporary,
];
const encoder = spawn(ffmpegPath, args, { stdio: ["pipe", "ignore", "pipe"] });
let errors = "";
encoder.stderr.on("data", (chunk) => {
  errors += chunk.toString();
});
// Observe process failure immediately, including while a frame awaits backpressure.
const completed = new Promise((resolve, reject) => {
  encoder.once("error", reject);
  encoder.once("close", (code) =>
    code === 0 ? resolve() : reject(new Error(errors)),
  );
  encoder.stdin.once("error", reject);
});
completed.catch(() => {});
try {
  for (let frame = 0; frame < duration * fps; frame++)
    if (!encoder.stdin.write(frameAt(frame)))
      await Promise.race([once(encoder.stdin, "drain"), completed]);
  encoder.stdin.end();
  await completed;
  const details = JSON.parse(
    await run(ffprobe.path, [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate",
      "-of",
      "json",
      temporary,
    ]),
  );
  const video = details.streams.find((stream) => stream.codec_type === "video");
  const audio = details.streams.find((stream) => stream.codec_type === "audio");
  if (
    video?.codec_name !== "h264" ||
    audio?.codec_name !== "aac" ||
    video.width !== width ||
    video.height !== height ||
    Math.abs(Number(details.format.duration) - duration) > 0.05
  )
    throw new Error("The generated sample failed its media inspection.");
  // This is known generated content, not an uploaded recording.
  const bytes = await readFile(temporary);
  if (bytes.length > 2 * 1024 ** 2)
    throw new Error("The sample exceeds its 2 MB budget.");
  const edgeBytes = Buffer.concat([
    bytes.subarray(0, 65536),
    bytes.subarray(Math.max(0, bytes.length - 65536)),
    Buffer.from(String(bytes.length)),
  ]);
  const manifest = {
    schema: "r6-browser-sample/v1",
    name: "synthetic-motion-sample.mp4",
    path: "sample/clip.mp4",
    title: "Synthetic motion study",
    description:
      "Original geometric animation and a quiet synthesized 220 Hz tone. No gameplay, voice, footage or external assets.",
    license: "CC0-1.0",
    duration: Number(details.format.duration),
    width,
    height,
    fps,
    videoCodec: video.codec_name,
    audioCodec: audio.codec_name,
    size: bytes.length,
    fingerprint: createHash("sha256").update(edgeBytes).digest("hex"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    generator: "scripts/generate-browser-sample.mjs",
    encoderPackage: "ffmpeg-static@5.3.0",
  };
  await rename(temporary, destination);
  await writeFile(
    `${directory}manifest.json`,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `Generated and inspected ${bytes.length} bytes: ${duration}s H.264/AAC, ${width}×${height}.`,
  );
} catch (error) {
  encoder.kill("SIGTERM");
  await rm(temporary, { force: true });
  throw error;
}
