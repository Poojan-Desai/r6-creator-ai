import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import Busboy from "busboy";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { z } from "zod";

import { replayPackageDirectory, toDataRelativePath } from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const REPLAY_MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024;
export const REPLAY_MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
export const REPLAY_MAX_FILES = 20;
export const REPLAY_MAX_ARCHIVE_ENTRIES = 100;
export const REPLAY_MAX_EXPANDED_BYTES = 8 * 1024 * 1024 * 1024;
export const REPLAY_MAX_COMPRESSION_RATIO = 250;

const replayFieldsSchema = z.object({
  displayName: z.string().trim().min(1, "Give this replay a name.").max(120),
  permissionConfirmed: z.literal("true", {
    error:
      "Confirm that you created or lawfully possess this completed Match Replay.",
  }),
  privacyMode: z
    .enum(["PRESERVE_LOCAL", "ALIASES", "HASHED", "REDACTED"])
    .default("ALIASES"),
  retentionPreference: z
    .enum([
      "KEEP_EVERYTHING",
      "KEEP_PARSED_DELETE_RAW",
      "KEEP_FINAL_OUTPUTS",
      "DELETE_TEMPORARY",
      "CUSTOM",
    ])
    .default("KEEP_EVERYTHING"),
  notes: z.string().trim().max(2_000).optional().default(""),
  projectId: z.string().cuid().optional().or(z.literal("")),
});

type UploadedReplaySource = {
  originalFilename: string;
  mimeType: string;
  temporaryPath: string;
  extension: ".rec" | ".zip";
  sizeBytes: number;
};

export type StreamedReplayUpload = {
  fields: z.infer<typeof replayFieldsSchema>;
  sources: UploadedReplaySource[];
};

type PreparedReplayFile = {
  temporaryPath: string;
  sourceLabel: string;
  sizeBytes: number;
  fingerprintSha256: string;
  roundIndex: number;
};

const acceptedRecMimeTypes = new Set([
  "application/octet-stream",
  "application/x-binary",
  "application/vnd.ubisoft.replay",
  "",
]);
const acceptedZipMimeTypes = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "",
]);

export function validateReplayUploadIdentity(
  filename: string,
  mimeType: string,
) {
  const extension = path.extname(filename).toLowerCase();
  const normalizedMime = mimeType.toLowerCase();
  if (extension === ".rec" && acceptedRecMimeTypes.has(normalizedMime))
    return ".rec" as const;
  if (extension === ".zip" && acceptedZipMimeTypes.has(normalizedMime))
    return ".zip" as const;
  throw new AppError(
    "Choose completed Rainbow Six Match Replay .rec files or one ZIP containing them.",
    415,
    "REPLAY_FILE_TYPE",
  );
}

export function validateReplayZipEntry(entry: {
  fileName: string;
  compressedSize: number;
  uncompressedSize: number;
  externalFileAttributes?: number;
}) {
  const filename = entry.fileName;
  const normalized = path.posix.normalize(filename.replaceAll("\\", "/"));
  const isAbsolute = normalized.startsWith("/") || /^[a-zA-Z]:/.test(filename);
  const escapes = normalized === ".." || normalized.startsWith("../");
  const unixMode = (entry.externalFileAttributes ?? 0) >>> 16;
  const isSymlink = (unixMode & 0o170000) === 0o120000;
  if (
    !filename ||
    filename.includes("\0") ||
    isAbsolute ||
    escapes ||
    isSymlink
  ) {
    throw new AppError(
      "The replay ZIP contains an unsafe path or symbolic link.",
      400,
      "REPLAY_UNSAFE_ARCHIVE",
    );
  }
  if (
    entry.uncompressedSize > REPLAY_MAX_FILE_BYTES ||
    (entry.compressedSize > 0 &&
      entry.uncompressedSize / entry.compressedSize >
        REPLAY_MAX_COMPRESSION_RATIO)
  ) {
    throw new AppError(
      "The replay ZIP contains an unexpectedly large compressed entry.",
      413,
      "REPLAY_ARCHIVE_LIMIT",
    );
  }
  return normalized;
}

export async function streamMultipartReplayUpload(
  request: Request,
  temporaryDirectory: string,
): Promise<StreamedReplayUpload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new AppError(
      "Replay import must use the local file form.",
      415,
      "REPLAY_MULTIPART_REQUIRED",
    );
  }
  const requestBody = request.body;
  if (!requestBody) {
    throw new AppError(
      "Choose a Match Replay before importing.",
      400,
      "REPLAY_FILE_REQUIRED",
    );
  }
  await mkdir(temporaryDirectory, { recursive: true });
  const reader = requestBody.getReader();

  return new Promise((resolve, reject) => {
    const parser = Busboy({
      headers: { "content-type": contentType },
      limits: {
        files: REPLAY_MAX_FILES,
        fields: 12,
        fieldSize: 16_000,
        fileSize: REPLAY_MAX_FILE_BYTES,
      },
    });
    const rawFields: Record<string, string> = {};
    const uploads: UploadedReplaySource[] = [];
    const pending: Promise<void>[] = [];
    let uploadBytes = 0;
    let fileIndex = 0;
    let settled = false;
    let failure: unknown;

    const fail = (error: unknown) => {
      if (failure === undefined) failure = error;
    };
    const rejectImmediately = (error: unknown) => {
      if (settled) return;
      settled = true;
      void reader.cancel().catch(() => undefined);
      reject(error);
    };

    parser.on("field", (name, value) => {
      rawFields[name] = value;
    });
    parser.on("file", (fieldName, file, info) => {
      if (fieldName !== "replay") {
        file.resume();
        fail(
          new AppError(
            "Replay files must use the replay upload field.",
            400,
            "REPLAY_FILE_FIELD",
          ),
        );
        return;
      }
      try {
        const extension = validateReplayUploadIdentity(
          info.filename,
          info.mimeType,
        );
        const index = fileIndex++;
        const temporaryPath = path.join(
          temporaryDirectory,
          `incoming-${String(index + 1).padStart(3, "0")}${extension}`,
        );
        const output = createWriteStream(temporaryPath, { flags: "wx" });
        let sizeBytes = 0;
        file.on("data", (chunk: Buffer) => {
          sizeBytes += chunk.length;
          uploadBytes += chunk.length;
          if (uploadBytes > REPLAY_MAX_UPLOAD_BYTES) {
            fail(
              new AppError(
                "The combined replay upload exceeds the 8 GB safety limit.",
                413,
                "REPLAY_UPLOAD_LIMIT",
              ),
            );
            output.destroy();
          }
        });
        file.on("limit", () => {
          fail(
            new AppError(
              "One replay file exceeds the 2 GB per-file safety limit.",
              413,
              "REPLAY_FILE_LIMIT",
            ),
          );
          output.destroy();
        });
        const upload: UploadedReplaySource = {
          originalFilename: path.basename(info.filename),
          mimeType: info.mimeType,
          temporaryPath,
          extension,
          sizeBytes: 0,
        };
        uploads.push(upload);
        pending.push(
          pipeline(file, output)
            .then(() => {
              upload.sizeBytes = sizeBytes;
            })
            .catch(fail),
        );
      } catch (error) {
        file.resume();
        fail(error);
      }
    });
    parser.on("filesLimit", () =>
      fail(
        new AppError(
          `Import no more than ${REPLAY_MAX_FILES} replay files at once.`,
          413,
          "REPLAY_FILE_COUNT_LIMIT",
        ),
      ),
    );
    parser.on("error", rejectImmediately);
    parser.on("finish", () => {
      void (async () => {
        if (settled) return;
        try {
          await Promise.all(pending);
          if (failure !== undefined) throw failure;
          if (uploads.length === 0 || uploads.some((item) => !item.sizeBytes)) {
            throw new AppError(
              "Choose at least one non-empty .rec file or replay ZIP.",
              400,
              "REPLAY_FILE_REQUIRED",
            );
          }
          const zipCount = uploads.filter(
            (item) => item.extension === ".zip",
          ).length;
          if (zipCount > 0 && (zipCount !== 1 || uploads.length !== 1)) {
            throw new AppError(
              "Import one replay ZIP by itself, or select multiple .rec files without a ZIP.",
              400,
              "REPLAY_SOURCE_MIX",
            );
          }
          const fields = replayFieldsSchema.parse(rawFields);
          settled = true;
          resolve({ fields, sources: uploads });
        } catch (error) {
          settled = true;
          reject(error);
        }
      })();
    });

    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) {
        parser.end();
        return;
      }
      if (!parser.write(Buffer.from(value))) {
        await new Promise<void>((resume) => parser.once("drain", resume));
      }
      return pump();
    };
    void pump().catch((error) => {
      rejectImmediately(error);
      parser.destroy(error instanceof Error ? error : undefined);
    });
  });
}

function openZip(filePath: string) {
  return new Promise<ZipFile>((resolve, reject) => {
    yauzl.open(
      filePath,
      { lazyEntries: true, autoClose: false, decodeStrings: true },
      (error, zipFile) => {
        if (error || !zipFile) reject(error ?? new Error("ZIP did not open."));
        else resolve(zipFile);
      },
    );
  });
}

function openZipEntry(zipFile: ZipFile, entry: Entry) {
  return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream)
        reject(error ?? new Error("ZIP entry did not open."));
      else resolve(stream);
    });
  });
}

function isIgnorableArchiveMetadata(entryPath: string) {
  return (
    entryPath.startsWith("__MACOSX/") ||
    path.posix.basename(entryPath) === ".DS_Store"
  );
}

async function extractReplayZip(zipPath: string, outputDirectory: string) {
  const zipFile = await openZip(zipPath);
  const extracted: Array<{ path: string; sourceLabel: string }> = [];
  let entryCount = 0;
  let totalExpandedBytes = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      zipFile.on("error", reject);
      zipFile.on("end", resolve);
      zipFile.on("entry", (entry: Entry) => {
        void (async () => {
          try {
            entryCount += 1;
            if (entryCount > REPLAY_MAX_ARCHIVE_ENTRIES) {
              throw new AppError(
                "The replay ZIP contains too many entries.",
                413,
                "REPLAY_ARCHIVE_LIMIT",
              );
            }
            const entryPath = validateReplayZipEntry(entry);
            totalExpandedBytes += entry.uncompressedSize;
            if (totalExpandedBytes > REPLAY_MAX_EXPANDED_BYTES) {
              throw new AppError(
                "The expanded replay ZIP exceeds the 8 GB safety limit.",
                413,
                "REPLAY_ARCHIVE_LIMIT",
              );
            }
            if (
              entryPath.endsWith("/") ||
              isIgnorableArchiveMetadata(entryPath)
            ) {
              zipFile.readEntry();
              return;
            }
            if (path.posix.extname(entryPath).toLowerCase() !== ".rec") {
              throw new AppError(
                "The replay ZIP contains a file other than an allowed .rec replay.",
                415,
                "REPLAY_ARCHIVE_FILE_TYPE",
              );
            }
            if (extracted.length >= REPLAY_MAX_FILES) {
              throw new AppError(
                `The replay ZIP contains more than ${REPLAY_MAX_FILES} round files.`,
                413,
                "REPLAY_FILE_COUNT_LIMIT",
              );
            }
            const outputPath = path.join(
              outputDirectory,
              `extracted-${String(extracted.length + 1).padStart(3, "0")}.rec`,
            );
            const input = await openZipEntry(zipFile, entry);
            await pipeline(
              input,
              createWriteStream(outputPath, { flags: "wx" }),
            );
            extracted.push({
              path: outputPath,
              sourceLabel: path.posix.basename(entryPath),
            });
            zipFile.readEntry();
          } catch (error) {
            reject(error);
          }
        })();
      });
      zipFile.readEntry();
    });
  } finally {
    zipFile.close();
  }
  if (extracted.length === 0) {
    throw new AppError(
      "The replay ZIP did not contain any .rec round files.",
      400,
      "REPLAY_ARCHIVE_EMPTY",
    );
  }
  return extracted;
}

async function fingerprintFile(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function assertReplayMagic(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(8);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (
      bytesRead !== 8 ||
      !header.equals(Buffer.from([100, 105, 115, 115, 101, 99, 116, 0]))
    ) {
      throw new AppError(
        "A selected .rec file is not a recognized Rainbow Six Match Replay container.",
        415,
        "REPLAY_MAGIC_INVALID",
      );
    }
  } finally {
    await handle.close();
  }
}

export function buildReplayPackageFingerprint(fileFingerprints: string[]) {
  return createHash("sha256")
    .update([...fileFingerprints].sort().join("\n"))
    .digest("hex");
}

function roundIndexFromName(filename: string, fallbackIndex: number) {
  const match = /(?:^|[-_])R(\d{1,3})(?:[._-]|$)/i.exec(filename);
  return match?.[1] ? Number(match[1]) : fallbackIndex;
}

export async function persistReplayPackage(
  replayPackageId: string,
  upload: StreamedReplayUpload,
) {
  const temporaryDirectory = path.dirname(upload.sources[0]!.temporaryPath);
  const zip =
    upload.sources[0]?.extension === ".zip" ? upload.sources[0] : null;
  const extractedDirectory = path.join(temporaryDirectory, "extracted");
  await mkdir(extractedDirectory, { recursive: true });
  const candidates = zip
    ? await extractReplayZip(zip.temporaryPath, extractedDirectory)
    : upload.sources.map((source) => ({
        path: source.temporaryPath,
        sourceLabel: source.originalFilename,
      }));
  const prepared: PreparedReplayFile[] = [];
  for (const [index, candidate] of candidates.entries()) {
    await assertReplayMagic(candidate.path);
    const fileInfo = await stat(candidate.path);
    prepared.push({
      temporaryPath: candidate.path,
      sourceLabel: candidate.sourceLabel,
      sizeBytes: fileInfo.size,
      fingerprintSha256: await fingerprintFile(candidate.path),
      roundIndex: roundIndexFromName(candidate.sourceLabel, index + 1),
    });
  }
  const duplicateFingerprints = new Set(
    prepared.map((item) => item.fingerprintSha256),
  );
  if (duplicateFingerprints.size !== prepared.length) {
    throw new AppError(
      "The selected replay package contains duplicate round files.",
      409,
      "REPLAY_DUPLICATE_ROUND",
    );
  }
  const packageFingerprintSha256 = buildReplayPackageFingerprint([
    ...duplicateFingerprints,
  ]);
  const existing = await db.replayPackage.findUnique({
    where: { packageFingerprintSha256 },
    select: { id: true, displayName: true },
  });
  if (existing) {
    throw new AppError(
      `This replay is already saved as “${existing.displayName}”.`,
      409,
      "REPLAY_DUPLICATE_PACKAGE",
    );
  }

  if (upload.fields.projectId) {
    const project = await db.project.findUnique({
      where: { id: upload.fields.projectId },
      select: { id: true },
    });
    if (!project) {
      throw new AppError(
        "The optional gameplay project no longer exists.",
        404,
        "PROJECT_NOT_FOUND",
      );
    }
  }

  const finalDirectory = replayPackageDirectory(replayPackageId);
  const roundsDirectory = path.join(finalDirectory, "rounds");
  const sourceDirectory = path.join(finalDirectory, "source");
  await mkdir(roundsDirectory, { recursive: true });
  if (zip) await mkdir(sourceDirectory, { recursive: true });
  const moved: Array<{
    id: string;
    stableFileId: string;
    safeDisplayName: string;
    relativePath: string;
    fileSizeBytes: bigint;
    fingerprintSha256: string;
    roundIndex: number;
  }> = [];
  try {
    for (const [index, replay] of prepared.entries()) {
      const finalPath = path.join(
        roundsDirectory,
        `round-${String(index + 1).padStart(3, "0")}.rec`,
      );
      await rename(replay.temporaryPath, finalPath);
      moved.push({
        id: randomUUID(),
        stableFileId: `replay-file:${packageFingerprintSha256.slice(0, 16)}:${String(index + 1).padStart(3, "0")}`,
        safeDisplayName: `Round ${replay.roundIndex}.rec`,
        relativePath: toDataRelativePath(finalPath),
        fileSizeBytes: BigInt(replay.sizeBytes),
        fingerprintSha256: replay.fingerprintSha256,
        roundIndex: replay.roundIndex,
      });
    }
    let sourceArchiveRelativePath: string | null = null;
    if (zip) {
      const archivePath = path.join(sourceDirectory, "source-package.zip");
      await copyFile(zip.temporaryPath, archivePath);
      sourceArchiveRelativePath = toDataRelativePath(archivePath);
    }
    const totalSizeBytes = moved.reduce(
      (total, file) => total + file.fileSizeBytes,
      0n,
    );
    return await db.replayPackage.create({
      data: {
        id: replayPackageId,
        projectId: upload.fields.projectId || null,
        displayName: upload.fields.displayName,
        status: "READY",
        permissionConfirmed: true,
        permissionConfirmedAt: new Date(),
        privacyMode: upload.fields.privacyMode,
        retentionPreference: upload.fields.retentionPreference,
        notes: upload.fields.notes || null,
        sourceKind: zip ? "ZIP" : "REC_FILES",
        sourceArchiveRelativePath,
        fileCount: moved.length,
        roundFileCount: moved.length,
        totalSizeBytes,
        packageFingerprintSha256,
        files: { create: moved },
      },
      include: {
        files: { orderBy: { roundIndex: "asc" } },
        providerRuns: { orderBy: { createdAt: "desc" }, take: 1 },
        capabilities: { orderBy: { displayName: "asc" } },
        canonicalMatch: {
          include: {
            rounds: { orderBy: { roundIndex: "asc" } },
            players: {
              orderBy: [{ teamIndex: "asc" }, { privacyAlias: "asc" }],
            },
            events: { orderBy: { timestampSeconds: "desc" } },
          },
        },
      },
    });
  } catch (error) {
    await rm(finalDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    );
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}
