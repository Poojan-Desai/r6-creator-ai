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

function optionalExecutable(
  value: string | undefined,
  fallback: string | null,
) {
  const configured = value?.trim();
  return configured || fallback;
}

export const appConfig = {
  dataRoot: path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.R6_DATA_DIR?.trim() || "data",
  ),
  maxUploadBytes: bytesSchema.parse(process.env.R6_MAX_UPLOAD_BYTES),
  ffmpegPath: optionalExecutable(process.env.FFMPEG_PATH, ffmpegStatic),
  ffprobePath: optionalExecutable(process.env.FFPROBE_PATH, ffprobeStatic.path),
};
