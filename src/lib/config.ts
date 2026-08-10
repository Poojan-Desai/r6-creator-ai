import path from "node:path";

import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { z } from "zod";

const bytesSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
  .default(20 * 1024 * 1024 * 1024);

const audioBytesSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
  .default(1024 * 1024 * 1024);

function optionalExecutable(
  value: string | undefined,
  fallback: string | null,
) {
  const configured = value?.trim();
  return configured || fallback;
}

const dataRoot = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  process.env.R6_DATA_DIR?.trim() || "data",
);

export const appConfig = {
  dataRoot,
  maxUploadBytes: bytesSchema.parse(process.env.R6_MAX_UPLOAD_BYTES),
  maxStudioAudioBytes: audioBytesSchema.parse(
    process.env.R6_MAX_STUDIO_AUDIO_BYTES,
  ),
  ffmpegPath: optionalExecutable(process.env.FFMPEG_PATH, ffmpegStatic),
  ffprobePath: optionalExecutable(process.env.FFPROBE_PATH, ffprobeStatic.path),
  fontPath:
    process.env.R6_FONT_PATH?.trim() ||
    (process.platform === "darwin"
      ? "/System/Library/Fonts/SFNS.ttf"
      : "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
  whisperCliPath:
    process.env.WHISPER_CLI_PATH?.trim() ||
    (process.arch === "arm64"
      ? "/opt/homebrew/bin/whisper-cli"
      : "/usr/local/bin/whisper-cli"),
  whisperModelPath: path.resolve(
    /* turbopackIgnore: true */ process.env.WHISPER_MODEL_PATH?.trim() ||
      path.join(dataRoot, "models", "whisper", "ggml-base.en.bin"),
  ),
  whisperModelName: process.env.WHISPER_MODEL_NAME?.trim() || "base.en",
  youtubeDataApiKey: process.env.YOUTUBE_DATA_API_KEY?.trim() || null,
  r6DissectPath:
    process.env.R6_DISSECT_PATH?.trim() ||
    path.join(dataRoot, "tools", "replay-parsers", "r6-dissect"),
};
