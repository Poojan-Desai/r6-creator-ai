import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, type ReadStream } from "node:fs";
import { copyFile, mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import type { BlueprintAsset } from "@prisma/client";
import Busboy from "busboy";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { z } from "zod";

import { appConfig } from "@/lib/config";
import {
  mapBlueprintImportDirectory,
  mapVersionAssetDirectory,
  resolveDataPath,
  toDataRelativePath,
} from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const BLUEPRINT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const BLUEPRINT_MAX_EXTRACTED_BYTES = 200 * 1024 * 1024;
const BLUEPRINT_MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const BLUEPRINT_MAX_ENTRIES = 150;

const blueprintFieldsSchema = z.object({
  sourceUrl: z.string().trim().url().max(2_000).optional().or(z.literal("")),
  sourceTitle: z.string().trim().max(240).optional().default(""),
  floorId: z.string().trim().cuid().optional().or(z.literal("")),
  notes: z.string().trim().max(2_000).optional().default(""),
});

const blueprintUpdateSchema = z.object({
  floorId: z.string().cuid().nullable(),
  notes: z.string().trim().max(2_000).optional().default(""),
});

export type BlueprintUpload = {
  fields: Record<string, string>;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  temporaryPath: string;
};

function safeExtension(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  if ([".zip", ".png", ".jpg", ".jpeg", ".webp"].includes(extension))
    return extension;
  throw new AppError(
    "Choose an official blueprint ZIP, PNG, JPG, or WebP image.",
    415,
    "BLUEPRINT_FILE_TYPE",
  );
}

export async function streamMultipartBlueprint(
  request: Request,
  temporaryDirectory: string,
): Promise<BlueprintUpload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new AppError(
      "Blueprint upload must use the file form.",
      415,
      "BLUEPRINT_MULTIPART_REQUIRED",
    );
  }
  const body = request.body;
  if (!body) {
    throw new AppError(
      "Choose a blueprint file before importing.",
      400,
      "BLUEPRINT_FILE_REQUIRED",
    );
  }
  await mkdir(temporaryDirectory, { recursive: true });
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: { "content-type": contentType },
      limits: {
        files: 1,
        fileSize: BLUEPRINT_MAX_UPLOAD_BYTES,
        fields: 12,
        fieldSize: 16_000,
      },
    });
    const fields: Record<string, string> = {};
    let upload:
      | {
          originalFilename: string;
          mimeType: string;
          temporaryPath: string;
          extension: string;
          sizeBytes: number;
          stream: ReadStream | null;
        }
      | undefined;
    let pending: Promise<void> | undefined;
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });
    busboy.on("file", (_name, file, info) => {
      try {
        const extension = safeExtension(info.filename);
        const temporaryPath = path.join(
          temporaryDirectory,
          `upload${extension === ".jpeg" ? ".jpg" : extension}`,
        );
        let sizeBytes = 0;
        const output = createWriteStream(temporaryPath, { flags: "wx" });
        file.on("data", (chunk: Buffer) => {
          sizeBytes += chunk.length;
        });
        file.on("limit", () => {
          fail(
            new AppError(
              "That blueprint package is larger than the 100 MB safety limit.",
              413,
              "BLUEPRINT_TOO_LARGE",
            ),
          );
          output.destroy();
        });
        pending = pipeline(file, output);
        upload = {
          originalFilename: path.basename(info.filename),
          mimeType: info.mimeType,
          temporaryPath,
          extension,
          sizeBytes,
          stream: null,
        };
        pending.then(() => {
          if (upload) upload.sizeBytes = sizeBytes;
        }, fail);
      } catch (error) {
        file.resume();
        fail(error);
      }
    });
    busboy.on("filesLimit", () =>
      fail(
        new AppError(
          "Import one blueprint ZIP or image at a time.",
          400,
          "BLUEPRINT_FILE_LIMIT",
        ),
      ),
    );
    busboy.on("error", fail);
    busboy.on("finish", async () => {
      if (settled) return;
      try {
        await pending;
        if (!upload || upload.sizeBytes === 0) {
          throw new AppError(
            "Choose a non-empty blueprint file before importing.",
            400,
            "BLUEPRINT_FILE_REQUIRED",
          );
        }
        settled = true;
        resolve({
          fields,
          originalFilename: upload.originalFilename,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
          temporaryPath: upload.temporaryPath,
        });
      } catch (error) {
        fail(error);
      }
    });

    const reader = body.getReader();
    const pump = async (): Promise<void> => {
      const { done, value } = await reader.read();
      if (done) {
        busboy.end();
        return;
      }
      if (!busboy.write(Buffer.from(value))) {
        await new Promise<void>((resume) => busboy.once("drain", resume));
      }
      return pump();
    };
    void pump().catch(fail);
  });
}

export function validateZipEntry(entry: {
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
      "The ZIP contains an unsafe file path or link and was rejected.",
      400,
      "BLUEPRINT_UNSAFE_ARCHIVE",
    );
  }
  if (
    entry.uncompressedSize > BLUEPRINT_MAX_ENTRY_BYTES ||
    (entry.compressedSize > 0 &&
      entry.uncompressedSize / entry.compressedSize > 250)
  ) {
    throw new AppError(
      "The ZIP contains an unexpectedly large compressed entry.",
      413,
      "BLUEPRINT_ARCHIVE_LIMIT",
    );
  }
  return normalized;
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

async function inspectImageMime(filePath: string) {
  const file = await open(filePath, "r");
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    if (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      return "image/png";
    if (
      bytes.length >= 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    )
      return "image/jpeg";
    if (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    )
      return "image/webp";
    throw new AppError(
      "A blueprint image has an unsupported or misleading file type.",
      415,
      "BLUEPRINT_IMAGE_INVALID",
    );
  } finally {
    await file.close();
  }
}

async function sha256(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function runMediaTool(executable: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Blueprint preview generation timed out."));
    }, 60_000);
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < 100_000) stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 100_000) stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `Media tool exited ${code}.`));
    });
  });
}

async function optimizeBlueprintImage(inputPath: string, outputPath: string) {
  if (!appConfig.ffmpegPath || !appConfig.ffprobePath) {
    throw new AppError(
      "The local video tools are required to create blueprint previews.",
      503,
      "BLUEPRINT_MEDIA_TOOLS_UNAVAILABLE",
    );
  }
  await runMediaTool(appConfig.ffmpegPath, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-vf",
    "scale=2000:-2:force_original_aspect_ratio=decrease",
    "-frames:v",
    "1",
    "-q:v",
    "3",
    outputPath,
  ]);
  const probe = await runMediaTool(appConfig.ffprobePath, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    outputPath,
  ]);
  const parsed = JSON.parse(probe.stdout) as {
    streams?: Array<{ width?: number; height?: number }>;
  };
  const image = parsed.streams?.[0];
  return {
    width: Number.isInteger(image?.width) ? Number(image?.width) : null,
    height: Number.isInteger(image?.height) ? Number(image?.height) : null,
  };
}

type PreparedImage = {
  path: string;
  originalFileName: string;
  mimeType: string;
};

async function extractBlueprintImages(
  zipPath: string,
  outputDirectory: string,
) {
  const zipFile = await openZip(zipPath);
  const prepared: PreparedImage[] = [];
  let entryCount = 0;
  let totalBytes = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      zipFile.on("error", reject);
      zipFile.on("end", resolve);
      zipFile.on("entry", (entry: Entry) => {
        void (async () => {
          try {
            entryCount += 1;
            if (entryCount > BLUEPRINT_MAX_ENTRIES) {
              throw new AppError(
                "The ZIP contains too many entries.",
                413,
                "BLUEPRINT_ARCHIVE_LIMIT",
              );
            }
            const entryPath = validateZipEntry(entry);
            totalBytes += entry.uncompressedSize;
            if (totalBytes > BLUEPRINT_MAX_EXTRACTED_BYTES) {
              throw new AppError(
                "The expanded ZIP is larger than the 200 MB safety limit.",
                413,
                "BLUEPRINT_ARCHIVE_LIMIT",
              );
            }
            if (entryPath.endsWith("/")) {
              zipFile.readEntry();
              return;
            }
            const extension = path.extname(entryPath).toLowerCase();
            if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
              zipFile.readEntry();
              return;
            }
            const outputPath = path.join(
              outputDirectory,
              `extracted-${prepared.length + 1}${extension === ".jpeg" ? ".jpg" : extension}`,
            );
            const stream = await openZipEntry(zipFile, entry);
            await pipeline(
              stream,
              createWriteStream(outputPath, { flags: "wx" }),
            );
            const mimeType = await inspectImageMime(outputPath);
            prepared.push({
              path: outputPath,
              originalFileName: path.basename(entryPath),
              mimeType,
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
  if (prepared.length === 0) {
    throw new AppError(
      "The ZIP does not contain a supported blueprint image.",
      415,
      "BLUEPRINT_ARCHIVE_EMPTY",
    );
  }
  return prepared;
}

export async function importBlueprint(
  mapVersionId: string,
  upload: BlueprintUpload,
) {
  const fields = blueprintFieldsSchema.parse(upload.fields);
  const version = await db.mapVersion.findUnique({
    where: { id: mapVersionId },
    include: { map: true, floors: true },
  });
  if (!version) {
    throw new AppError(
      "That map version does not exist.",
      404,
      "MAP_VERSION_NOT_FOUND",
    );
  }
  if (
    fields.floorId &&
    !version.floors.some((floor) => floor.id === fields.floorId)
  ) {
    throw new AppError(
      "That floor does not belong to this map version.",
      400,
      "BLUEPRINT_FLOOR_MISMATCH",
    );
  }
  const extension = safeExtension(upload.originalFilename);
  const assetDirectory = mapVersionAssetDirectory(mapVersionId);
  const originalsDirectory = path.join(assetDirectory, "originals");
  const previewsDirectory = path.join(assetDirectory, "previews");
  await Promise.all([
    mkdir(originalsDirectory, { recursive: true }),
    mkdir(previewsDirectory, { recursive: true }),
  ]);
  const preparedImages: PreparedImage[] = [];
  const createdFiles: string[] = [];
  try {
    let zipRecord:
      | {
          stableId: string;
          relativePath: string;
          sha256: string;
          size: bigint;
        }
      | undefined;
    if (extension === ".zip") {
      const zipStableId = `blueprint:${version.stableId}:${randomUUID()}`;
      const finalZipPath = path.join(originalsDirectory, `${randomUUID()}.zip`);
      await rename(upload.temporaryPath, finalZipPath);
      createdFiles.push(finalZipPath);
      zipRecord = {
        stableId: zipStableId,
        relativePath: toDataRelativePath(finalZipPath),
        sha256: await sha256(finalZipPath),
        size: BigInt((await stat(finalZipPath)).size),
      };
      preparedImages.push(
        ...(await extractBlueprintImages(
          finalZipPath,
          path.dirname(upload.temporaryPath),
        )),
      );
    } else {
      const mimeType = await inspectImageMime(upload.temporaryPath);
      preparedImages.push({
        path: upload.temporaryPath,
        originalFileName: upload.originalFilename,
        mimeType,
      });
    }

    const imageRecords: Array<{
      original: Omit<BlueprintAsset, "id" | "importedAt">;
      preview: Omit<BlueprintAsset, "id" | "importedAt">;
    }> = [];
    for (const [index, image] of preparedImages.entries()) {
      const imageExtension =
        image.mimeType === "image/png"
          ? ".png"
          : image.mimeType === "image/webp"
            ? ".webp"
            : ".jpg";
      const originalPath = path.join(
        originalsDirectory,
        `${randomUUID()}${imageExtension}`,
      );
      if (path.resolve(image.path) !== path.resolve(originalPath))
        await copyFile(image.path, originalPath);
      createdFiles.push(originalPath);
      const previewPath = path.join(previewsDirectory, `${randomUUID()}.jpg`);
      const dimensions = await optimizeBlueprintImage(
        originalPath,
        previewPath,
      );
      createdFiles.push(previewPath);
      const originalStableId = `blueprint:${version.stableId}:image-${randomUUID()}`;
      const previewStableId = `${originalStableId}:preview`;
      const common = {
        mapVersionId,
        floorId: fields.floorId || null,
        sourceType: "IMPORTED" as const,
        sourceUrl: fields.sourceUrl || null,
        sourceTitle: fields.sourceTitle || null,
        notes: fields.notes || null,
        lastVerifiedAt: new Date(),
      };
      imageRecords.push({
        original: {
          stableId: originalStableId,
          ...common,
          parentAssetId: null,
          assetKind: "ORIGINAL_IMAGE",
          originalFileName: image.originalFileName,
          relativePath: toDataRelativePath(originalPath),
          mimeType: image.mimeType,
          fileSizeBytes: BigInt((await stat(originalPath)).size),
          sha256: await sha256(originalPath),
          width: null,
          height: null,
        },
        preview: {
          stableId: previewStableId,
          ...common,
          parentAssetId: null,
          assetKind: "PREVIEW_IMAGE",
          originalFileName: `${image.originalFileName}.preview.jpg`,
          relativePath: toDataRelativePath(previewPath),
          mimeType: "image/jpeg",
          fileSizeBytes: BigInt((await stat(previewPath)).size),
          sha256: await sha256(previewPath),
          width: dimensions.width,
          height: dimensions.height,
        },
      });
      if (index > BLUEPRINT_MAX_ENTRIES) break;
    }

    const saved = await db.$transaction(async (transaction) => {
      const zipAsset = zipRecord
        ? await transaction.blueprintAsset.create({
            data: {
              stableId: zipRecord.stableId,
              mapVersionId,
              floorId: fields.floorId || null,
              assetKind: "ORIGINAL_ZIP",
              originalFileName: upload.originalFilename,
              relativePath: zipRecord.relativePath,
              mimeType: "application/zip",
              fileSizeBytes: zipRecord.size,
              sha256: zipRecord.sha256,
              sourceType: "IMPORTED",
              sourceUrl: fields.sourceUrl || null,
              sourceTitle: fields.sourceTitle || null,
              notes: fields.notes || null,
              lastVerifiedAt: new Date(),
            },
          })
        : null;
      const assets: BlueprintAsset[] = zipAsset ? [zipAsset] : [];
      for (const record of imageRecords) {
        const original = await transaction.blueprintAsset.create({
          data: {
            ...record.original,
            parentAssetId: zipAsset?.id ?? null,
          },
        });
        const preview = await transaction.blueprintAsset.create({
          data: { ...record.preview, parentAssetId: original.id },
        });
        assets.push(original, preview);
      }
      return assets;
    });
    return saved;
  } catch (error) {
    await Promise.all(
      createdFiles.map((filePath) => rm(filePath, { force: true })),
    ).catch(() => undefined);
    throw error;
  }
}

export async function updateBlueprintAsset(assetId: string, input: unknown) {
  const fields = blueprintUpdateSchema.parse(input);
  const asset = await db.blueprintAsset.findUnique({
    where: { id: assetId },
    include: { mapVersion: { include: { floors: true } } },
  });
  if (!asset)
    throw new AppError(
      "That blueprint does not exist.",
      404,
      "BLUEPRINT_NOT_FOUND",
    );
  if (
    fields.floorId &&
    !asset.mapVersion.floors.some((floor) => floor.id === fields.floorId)
  ) {
    throw new AppError(
      "That floor does not belong to this map version.",
      400,
      "BLUEPRINT_FLOOR_MISMATCH",
    );
  }
  return db.blueprintAsset.update({
    where: { id: assetId },
    data: { floorId: fields.floorId, notes: fields.notes || null },
  });
}

export async function deleteBlueprintAsset(assetId: string) {
  const asset = await db.blueprintAsset.findUnique({
    where: { id: assetId },
    include: {
      derivedAssets: { include: { derivedAssets: true } },
    },
  });
  if (!asset)
    throw new AppError(
      "That blueprint does not exist.",
      404,
      "BLUEPRINT_NOT_FOUND",
    );
  const paths = [
    asset.relativePath,
    ...asset.derivedAssets.flatMap((child) => [
      child.relativePath,
      ...child.derivedAssets.map((grandchild) => grandchild.relativePath),
    ]),
  ];
  await db.blueprintAsset.delete({ where: { id: assetId } });
  await Promise.all(
    paths.map((relativePath) =>
      rm(resolveDataPath(relativePath), { force: true }),
    ),
  );
}

export async function cleanupBlueprintImport(importId: string) {
  await rm(mapBlueprintImportDirectory(importId), {
    recursive: true,
    force: true,
  });
}

export async function readBlueprintAsset(assetId: string) {
  const asset = await db.blueprintAsset.findUnique({ where: { id: assetId } });
  if (!asset)
    throw new AppError(
      "That blueprint does not exist.",
      404,
      "BLUEPRINT_NOT_FOUND",
    );
  return { asset, absolutePath: resolveDataPath(asset.relativePath) };
}

export async function verifyStoredBlueprint(assetId: string) {
  const { asset, absolutePath } = await readBlueprintAsset(assetId);
  const measurement = await stat(absolutePath);
  return {
    matchesHash: (await sha256(absolutePath)) === asset.sha256,
    sizeBytes: measurement.size,
  };
}
