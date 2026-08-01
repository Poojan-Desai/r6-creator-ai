import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import busboy from "busboy";
import { z } from "zod";

import { appConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

const acceptedExtensions = new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".wav",
  ".webm",
]);
const acceptedMimeTypes = new Set([
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
  "audio/x-wav",
  "audio/webm",
  "application/ogg",
]);

const fieldsSchema = z
  .object({
    kind: z.enum(["VOICEOVER", "MUSIC"]),
    name: z.string().trim().min(1).max(100),
    permissionConfirmed: z.literal("true", {
      error: "Confirm that you recorded, own, or may use this audio.",
    }),
    scriptSectionKey: z.string().trim().max(120).optional(),
  })
  .passthrough();

export type StudioAudioUpload = {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  kind: "VOICEOVER" | "MUSIC";
  name: string;
  permissionConfirmed: true;
  scriptSectionKey: string | null;
};

export function validateStudioAudioIdentity(
  filename: string,
  mimeType: string,
) {
  const extension = path.extname(filename).toLowerCase();
  if (!acceptedExtensions.has(extension)) {
    throw new AppError(
      "Choose a WAV, MP3, M4A, AAC, FLAC, OGG, or WebM audio file.",
      415,
      "INVALID_AUDIO_EXTENSION",
    );
  }
  if (!acceptedMimeTypes.has(mimeType.toLowerCase())) {
    throw new AppError(
      "That file does not have a supported audio type.",
      415,
      "INVALID_AUDIO_TYPE",
    );
  }
}

export async function streamMultipartStudioAudio(
  request: Request,
  temporaryPath: string,
): Promise<StudioAudioUpload> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data")) {
    throw new AppError(
      "The upload request must contain one audio file.",
      415,
      "INVALID_AUDIO_UPLOAD",
    );
  }
  if (!request.body) {
    throw new AppError("No audio data was received.", 400, "EMPTY_AUDIO");
  }
  await mkdir(path.dirname(temporaryPath), { recursive: true });

  return new Promise((resolve, reject) => {
    let originalFilename = "";
    let mimeType = "";
    let sizeBytes = 0;
    let fileSeen = false;
    let writePromise: Promise<void> | null = null;
    let failure: Error | null = null;
    const fields: Record<string, string> = {};
    const fail = (error: Error) => {
      if (!failure) failure = error;
    };
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: { "content-type": contentType },
        limits: {
          files: 1,
          fields: 5,
          fileSize: appConfig.maxStudioAudioBytes,
        },
      });
    } catch {
      reject(
        new AppError(
          "The audio upload request is malformed. Choose the file again.",
          400,
          "INVALID_AUDIO_UPLOAD",
        ),
      );
      return;
    }

    parser.on("field", (name, value) => {
      fields[name] = value.trim().slice(0, 2_000);
    });
    parser.on("file", (fieldName, stream, info) => {
      if (fieldName !== "audio" || fileSeen) {
        stream.resume();
        fail(
          new AppError(
            "Upload one audio file at a time.",
            400,
            "TOO_MANY_AUDIO_FILES",
          ),
        );
        return;
      }
      fileSeen = true;
      originalFilename = info.filename;
      mimeType = info.mimeType;
      try {
        validateStudioAudioIdentity(originalFilename, mimeType);
      } catch (error) {
        stream.resume();
        fail(error instanceof Error ? error : new Error("Invalid audio"));
        return;
      }
      stream.on("data", (chunk: Buffer) => {
        sizeBytes += chunk.length;
      });
      stream.on("limit", () =>
        fail(
          new AppError(
            `This audio file is larger than the ${Math.round(appConfig.maxStudioAudioBytes / 1024 ** 2)} MB local limit.`,
            413,
            "AUDIO_FILE_TOO_LARGE",
          ),
        ),
      );
      writePromise = pipeline(
        stream,
        createWriteStream(temporaryPath, { flags: "wx" }),
      ).catch((error: unknown) => {
        fail(error instanceof Error ? error : new Error("Audio write failed"));
      });
    });
    parser.on("error", fail);
    parser.on("close", () => {
      void (async () => {
        try {
          if (writePromise) await writePromise;
          if (failure) throw failure;
          if (!fileSeen || !originalFilename || sizeBytes === 0) {
            throw new AppError(
              "Choose a non-empty audio file.",
              400,
              "EMPTY_AUDIO",
            );
          }
          const parsed = fieldsSchema.parse(fields);
          resolve({
            originalFilename,
            mimeType,
            sizeBytes,
            kind: parsed.kind,
            name: parsed.name,
            permissionConfirmed: true,
            scriptSectionKey: parsed.scriptSectionKey || null,
          });
        } catch (error) {
          reject(error);
        }
      })();
    });
    const body = Readable.fromWeb(
      request.body as import("node:stream/web").ReadableStream,
    );
    body.on("error", fail);
    body.pipe(parser);
  });
}

type AudioProbeOutput = {
  format?: { duration?: string };
  streams?: Array<{ codec_type?: string; codec_name?: string }>;
};

export async function probeStudioAudio(filePath: string) {
  if (!appConfig.ffprobePath) {
    throw new AppError(
      "FFprobe is unavailable. Reinstall dependencies and try again.",
      503,
      "FFPROBE_UNAVAILABLE",
    );
  }
  const result = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      appConfig.ffprobePath!,
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath,
      ],
      { shell: false, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 30_000);
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < 1_000_000) stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 100_000) stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || "FFprobe could not read audio."));
    });
  }).catch(() => {
    throw new AppError(
      "That file could not be read as supported audio.",
      415,
      "AUDIO_PROBE_FAILED",
    );
  });
  const parsed = JSON.parse(result) as AudioProbeOutput;
  const durationSeconds = Number(parsed.format?.duration);
  const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
  if (!audio || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new AppError(
      "That file does not contain a readable audio track.",
      415,
      "NO_AUDIO_STREAM",
    );
  }
  return {
    durationSeconds,
    codecName: audio.codec_name?.trim() || "unknown",
  };
}
