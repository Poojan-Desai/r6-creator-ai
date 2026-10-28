import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
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

export type UploadedReferenceVideo = {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  fields: Record<string, string>;
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
  const upload = await streamMultipartMp4(request, temporaryPath, 4);
  const fallbackName =
    upload.originalFilename.replace(/\.mp4$/i, "").trim() ||
    "Untitled recording";
  return {
    originalFilename: upload.originalFilename,
    mimeType: upload.mimeType,
    projectName: upload.fields.name?.trim().slice(0, 100) || fallbackName,
    sizeBytes: upload.sizeBytes,
  };
}

export async function streamMultipartReferenceVideo(
  request: Request,
  temporaryPath: string,
): Promise<UploadedReferenceVideo> {
  return streamMultipartMp4(request, temporaryPath, 16);
}

async function streamMultipartMp4(
  request: Request,
  temporaryPath: string,
  fieldLimit: number,
): Promise<UploadedReferenceVideo> {
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

  let originalFilename = "";
  let mimeType = "";
  const fields: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  let sizeBytes = 0;
  let fileSeen = false;
  let ownsTemporaryFile = false;
  let writePromise: Promise<void> | null = null;
  let failure: Error | null = null;

  let parser: ReturnType<typeof busboy>;
  try {
    parser = busboy({
      headers: { "content-type": contentType },
      limits: {
        files: 1,
        fields: fieldLimit,
        fieldSize: 8_000,
        parts: fieldLimit + 2,
        fileSize: appConfig.maxUploadBytes,
      },
    });
  } catch {
    throw new AppError(
      "The upload request is malformed. Please choose the file again.",
    );
  }
  const fail = (error: Error) => {
    failure ??= error;
    // Destroying the parser also stops the request pipeline and open file stream.
    // Merely recording a body error leaves Busboy waiting forever for a boundary.
    // Busboy finishes updating its active file after emitting limit/field
    // callbacks. Destroying synchronously inside one can null that file before
    // the parser marks it truncated. Tear down once this callback unwinds.
    queueMicrotask(() => {
      if (!parser.destroyed) parser.destroy(error);
    });
  };
  parser.on("field", (fieldName, value, info) => {
    if (info.nameTruncated || info.valueTruncated) {
      fail(
        new AppError(
          "An upload field is too long.",
          400,
          "UPLOAD_FIELD_TOO_LARGE",
        ),
      );
      return;
    }
    fields[fieldName] = value.trim().slice(0, 2_000);
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
    const destination = createWriteStream(temporaryPath, {
      flags: "wx",
      mode: 0o600,
    });
    destination.once("open", () => {
      ownsTemporaryFile = true;
    });
    // Attach the rejection handler immediately, including early filesystem errors.
    writePromise = pipeline(stream, destination).catch((error: unknown) => {
      fail(error instanceof Error ? error : new Error("Upload write failed"));
    });
  });
  parser.on("filesLimit", () =>
    fail(
      new AppError(
        "Upload one MP4 recording at a time.",
        400,
        "TOO_MANY_FILES",
      ),
    ),
  );
  parser.on("fieldsLimit", () =>
    fail(
      new AppError(
        "This upload contains too many fields.",
        400,
        "TOO_MANY_FIELDS",
      ),
    ),
  );
  parser.on("partsLimit", () =>
    fail(
      new AppError(
        "This upload contains too many parts.",
        400,
        "TOO_MANY_PARTS",
      ),
    ),
  );
  const body = Readable.fromWeb(
    request.body as import("node:stream/web").ReadableStream,
  );
  try {
    await pipeline(body, parser, { signal: request.signal });
  } catch (error) {
    failure ??=
      error instanceof Error ? error : new Error("Upload interrupted");
  }
  // The disk pipeline must settle before cleanup, otherwise a late open/write can
  // recreate a partial file after the caller thinks the failed import is gone.
  if (writePromise) await writePromise;
  if (!failure && (!fileSeen || !originalFilename || sizeBytes === 0)) {
    failure = new AppError(
      "Choose a non-empty MP4 recording.",
      400,
      "EMPTY_UPLOAD",
    );
  }
  if (failure) {
    if (ownsTemporaryFile) await unlink(temporaryPath).catch(() => undefined);
    if (failure instanceof AppError) throw failure;
    throw new AppError(
      "The upload was interrupted or incomplete. Choose the file again.",
      400,
      "UPLOAD_INTERRUPTED",
    );
  }
  return { originalFilename, mimeType, sizeBytes, fields };
}
