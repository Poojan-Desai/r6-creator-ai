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

const nonNegativeInteger = (fallback: number, maximum: number) =>
  z.coerce.number().int().min(0).max(maximum).default(fallback);

const positiveInteger = (fallback: number, maximum: number) =>
  z.coerce.number().int().positive().max(maximum).default(fallback);

const positiveNumber = (fallback: number, maximum: number) =>
  z.coerce.number().positive().max(maximum).default(fallback);

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
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || null,
  openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna",
  openaiTimeoutMs: positiveInteger(30_000, 120_000).parse(
    process.env.OPENAI_TIMEOUT_MS,
  ),
  openaiMaxRetries: nonNegativeInteger(2, 5).parse(
    process.env.OPENAI_MAX_RETRIES,
  ),
  openaiMaxOutputTokens: positiveInteger(2_000, 8_000).parse(
    process.env.OPENAI_MAX_OUTPUT_TOKENS,
  ),
  openaiMonthlyBudgetCents: nonNegativeInteger(0, 100_000).parse(
    process.env.OPENAI_MONTHLY_BUDGET_CENTS,
  ),
  openaiProjectMonthlyRequestLimit: positiveInteger(10, 1_000).parse(
    process.env.OPENAI_PROJECT_MONTHLY_REQUEST_LIMIT,
  ),
  openaiInputUsdPerMillionTokens: positiveNumber(0.2, 1_000).parse(
    process.env.OPENAI_INPUT_USD_PER_MILLION_TOKENS,
  ),
  openaiOutputUsdPerMillionTokens: positiveNumber(1.2, 1_000).parse(
    process.env.OPENAI_OUTPUT_USD_PER_MILLION_TOKENS,
  ),
  r6DissectPath:
    process.env.R6_DISSECT_PATH?.trim() ||
    path.join(dataRoot, "tools", "replay-parsers", "r6-dissect"),
};
