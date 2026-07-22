import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import busboy from "busboy";

import { appConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

const acceptedMimeTypes = new Set(["video/mp4", "application/mp4"]);

export type UploadedVideo = {
  originalFilename: string;
  mimeType: string;
  projectName: string;
  sizeBytes: number;
};

export function validateUploadIdentity(filename: string, mimeType: string) {
  if (!filename.toLowerCase().endsWith(".mp4")) {
    throw new AppError(
      "Choose a file ending in .mp4.",
      415,
      "INVALID_FILE_EXTENSION",
    );
  }
  if (!acceptedMimeTypes.has(mimeType.toLowerCase())) {
    throw new AppError("Choose an MP4 video file.", 415, "INVALID_FILE_TYPE");
  }
}

export async function streamMultipartVideo(
  request: Request,
  temporaryPath: string,
): Promise<UploadedVideo> {
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data")) {
    throw new AppError(
      "The upload request must contain an MP4 file.",
      415,
      "INVALID_UPLOAD",
    );
  }
  if (!request.body) {
    throw new AppError("No video data was received.", 400, "EMPTY_UPLOAD");
  }

  await mkdir(path.dirname(temporaryPath), { recursive: true });

  return new Promise((resolve, reject) => {
    let originalFilename = "";
    let mimeType = "";
    let projectName = "";
    let sizeBytes = 0;
    let fileSeen = false;
    let writePromise: Promise<void> | null = null;
    let failure: Error | null = null;

    const fail = (error: Error) => {
      if (!failure) failure = error;
    };

    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: { "content-type": contentType },
        limits: {
          files: 1,
          fields: 4,
          fileSize: appConfig.maxUploadBytes,
        },
      });
    } catch {
      reject(
        new AppError(
          "The upload request is malformed. Please choose the file again.",
        ),
      );
      return;
    }

    parser.on("field", (fieldName, value) => {
      if (fieldName === "name") projectName = value.trim().slice(0, 100);
    });

    parser.on("file", (fieldName, stream, info) => {
      if (fieldName !== "video" || fileSeen) {
        stream.resume();
        fail(
          new AppError(
            "Upload one MP4 recording at a time.",
            400,
            "TOO_MANY_FILES",
          ),
        );
        return;
      }

      fileSeen = true;
      originalFilename = info.filename;
      mimeType = info.mimeType;
      try {
        validateUploadIdentity(originalFilename, mimeType);
      } catch (error) {
        stream.resume();
        fail(error instanceof Error ? error : new Error("Invalid upload"));
        return;
      }

      stream.on("data", (chunk: Buffer) => {
        sizeBytes += chunk.length;
      });
      stream.on("limit", () => {
        fail(
          new AppError(
            `This file is larger than the ${Math.round(appConfig.maxUploadBytes / 1024 ** 3)} GB local limit.`,
            413,
            "FILE_TOO_LARGE",
          ),
        );
      });

      writePromise = pipeline(
        stream,
        createWriteStream(temporaryPath, { flags: "wx" }),
      ).catch((error: unknown) => {
        fail(error instanceof Error ? error : new Error("Upload write failed"));
      });
    });

    parser.on("filesLimit", () => {
      fail(
        new AppError(
          "Upload one MP4 recording at a time.",
          400,
          "TOO_MANY_FILES",
        ),
      );
    });
    parser.on("error", (error: Error) => fail(error));
    parser.on("close", () => {
      void (async () => {
        try {
          if (writePromise) await writePromise;
          if (failure) throw failure;
          if (!fileSeen || !originalFilename || sizeBytes === 0) {
            throw new AppError(
              "Choose a non-empty MP4 recording.",
              400,
              "EMPTY_UPLOAD",
            );
          }
          const fallbackName =
            originalFilename.replace(/\.mp4$/i, "").trim() ||
            "Untitled recording";
          resolve({
            originalFilename,
            mimeType,
            projectName: projectName || fallbackName,
            sizeBytes,
          });
        } catch (error) {
          reject(error);
        }
      })();
    });

    const body = Readable.fromWeb(
      request.body as import("node:stream/web").ReadableStream,
    );
    body.on("error", (error) => fail(error));
    body.pipe(parser);
  });
}
