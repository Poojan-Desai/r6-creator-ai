import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { db } from "@/lib/db";
import {
  ensureDataDirectories,
  referenceVideoDirectory,
  toDataRelativePath,
} from "@/lib/data-paths";
import { apiError } from "@/lib/errors";
import {
  assertLocalReferencePermission,
  serializeReferenceSummary,
} from "@/lib/reference-library";
import { streamMultipartReferenceVideo } from "@/lib/upload";
import { probeVideo } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const references = await db.referenceVideo.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        styleAnalyses: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    return Response.json({
      references: references.map(serializeReferenceSummary),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const referenceId = crypto.randomUUID();
  const directory = referenceVideoDirectory(referenceId);
  const temporaryPath = path.join(directory, "source.uploading");
  const finalPath = path.join(directory, "source.mp4");

  try {
    await ensureDataDirectories();
    await mkdir(directory, { recursive: true });
    const upload = await streamMultipartReferenceVideo(request, temporaryPath);
    const fields = assertLocalReferencePermission(upload.fields);
    const metadata = await probeVideo(temporaryPath);
    await rename(temporaryPath, finalPath);

    const reference = await db.referenceVideo.create({
      data: {
        id: referenceId,
        referenceType: "LOCAL_VIDEO",
        title: fields.title,
        creatorName: fields.creatorName,
        game: fields.game,
        platform: fields.platform,
        sourceType: fields.sourceType,
        sourceUrl: fields.sourceUrl || null,
        contentCategory: fields.contentCategory,
        notes: fields.notes || null,
        thumbnailText: fields.thumbnailText || null,
        permissionConfirmed: true,
        permissionConfirmedAt: new Date(),
        originalFilename: upload.originalFilename,
        sourceRelativePath: toDataRelativePath(finalPath),
        mimeType: upload.mimeType,
        fileSizeBytes: BigInt(upload.sizeBytes),
        durationSeconds: metadata.durationSeconds,
        width: metadata.width,
        height: metadata.height,
        frameRate: metadata.frameRate,
        metadataSource: "LOCAL_FFPROBE",
        audioTracks: {
          create: metadata.audioTracks.map((track) => ({
            streamIndex: track.streamIndex,
            codecName: track.codecName,
            channels: track.channels,
            channelLayout: track.channelLayout,
            language: track.language,
            title: track.title,
            isDefault: track.isDefault,
            preferenceScore: track.preferenceScore,
            preferenceReason: track.preferenceReason,
          })),
        },
      },
      include: {
        styleAnalyses: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return Response.json(
      { reference: serializeReferenceSummary(reference) },
      { status: 201 },
    );
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(
      () => undefined,
    );
    return apiError(error);
  }
}
