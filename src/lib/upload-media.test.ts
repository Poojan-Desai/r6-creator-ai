import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { appConfig } from "@/lib/config";
import { streamMultipartVideo } from "@/lib/upload";
import { createVideoClip, probeVideo } from "@/lib/video";

describe.skipIf(!appConfig.ffmpegPath || !appConfig.ffprobePath)(
  "real streamed MP4 import and clip export",
  () => {
    it("imports, probes, trims and decodes synthetic video/audio with verified output metadata", async () => {
      const directory = await mkdtemp(
        path.join(tmpdir(), "r6-ingestion-media-"),
      );
      const source = path.join(directory, "synthetic-source.mp4");
      const uploaded = path.join(directory, "upload.processing.mp4");
      const exported = path.join(directory, "verified-export.mp4");
      const started = performance.now();
      try {
        execFileSync(appConfig.ffmpegPath!, [
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=640x360:rate=30:duration=4",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:sample_rate=48000:duration=4",
          "-shortest",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-y",
          source,
        ]);
        const boundary = "real-media-fixture";
        const chunks = Readable.from(
          (async function* () {
            yield Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="synthetic.mp4"\r\nContent-Type: video/mp4\r\n\r\n`,
            );
            yield* createReadStream(source);
            yield Buffer.from(`\r\n--${boundary}--\r\n`);
          })(),
        );
        const request = new Request("http://localhost/api/projects", {
          method: "POST",
          headers: {
            "content-type": `multipart/form-data; boundary=${boundary}`,
          },
          body: Readable.toWeb(chunks),
          duplex: "half",
        } as RequestInit & { duplex: string });
        const imported = await streamMultipartVideo(request, uploaded);
        const sourceMetadata = await probeVideo(uploaded);
        expect(imported.sizeBytes).toBe((await stat(source)).size);
        expect(sourceMetadata).toMatchObject({ width: 640, height: 360 });
        expect(sourceMetadata.audioTracks).toHaveLength(1);
        await createVideoClip(uploaded, exported, 1, 2);
        const outputMetadata = await probeVideo(exported);
        expect(outputMetadata.width).toBe(640);
        expect(outputMetadata.height).toBe(360);
        expect(Math.abs(outputMetadata.durationSeconds - 2)).toBeLessThan(0.2);
        expect(outputMetadata.audioTracks[0]?.codecName).toBe("aac");
        execFileSync(appConfig.ffmpegPath!, [
          "-v",
          "error",
          "-i",
          exported,
          "-f",
          "null",
          "-",
        ]);
        const streams = JSON.parse(
          execFileSync(
            appConfig.ffprobePath!,
            [
              "-v",
              "error",
              "-show_entries",
              "stream=codec_type,codec_name",
              "-of",
              "json",
              exported,
            ],
            { encoding: "utf8" },
          ),
        ) as { streams: { codec_type: string; codec_name: string }[] };
        expect(streams.streams).toContainEqual({
          codec_type: "video",
          codec_name: "h264",
        });
        expect(streams.streams).toContainEqual({
          codec_type: "audio",
          codec_name: "aac",
        });
        // Explicit test-only artifact destination; never changes application storage.
        const destination = process.env.R6_TEST_ARTIFACT_DIR;
        if (destination) {
          await mkdir(destination, { recursive: true });
          await copyFile(
            exported,
            path.join(destination, "verified-synthetic-export.mp4"),
          );
          await writeFile(
            path.join(destination, "media-verification.json"),
            JSON.stringify(
              {
                fixture: "Original FFmpeg testsrc2 and sine, synthetic only",
                importedBytes: imported.sizeBytes,
                outputBytes: (await stat(exported)).size,
                sourceMetadata,
                outputMetadata,
                decodedWithoutErrors: true,
                streams: streams.streams,
                elapsedMilliseconds: performance.now() - started,
              },
              null,
              2,
            ),
          );
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  },
);
