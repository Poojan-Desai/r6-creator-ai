import { mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";

import {
  ensureDataDirectories,
  studioMediaDirectory,
  toDataRelativePath,
} from "@/lib/data-paths";
import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import { getLongFormTimelineState } from "@/lib/long-form-timeline";
import { getShortFormTimelineState } from "@/lib/short-form-timeline";
import {
  probeStudioAudio,
  streamMultipartStudioAudio,
} from "@/lib/studio-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const { id: studioProjectId } = await params;
  const assetId = crypto.randomUUID();
  const directory = studioMediaDirectory(studioProjectId);
  const temporaryPath = path.join(directory, `${assetId}.uploading`);
  let finalPath: string | null = null;
  try {
    const exists = await db.studioProject.findUnique({
      where: { id: studioProjectId },
      select: { id: true },
    });
    if (!exists) {
      throw new AppError(
        "That Creator Studio project does not exist.",
        404,
        "STUDIO_PROJECT_NOT_FOUND",
      );
    }
    await ensureDataDirectories();
    await mkdir(directory, { recursive: true });
    const upload = await streamMultipartStudioAudio(request, temporaryPath);
    const metadata = await probeStudioAudio(temporaryPath);
    const extension = path.extname(upload.originalFilename).toLowerCase();
    finalPath = path.join(directory, `${assetId}${extension}`);
    await rename(temporaryPath, finalPath);
    await db.studioMediaAsset.create({
      data: {
        id: assetId,
        studioProjectId,
        kind: upload.kind,
        name: upload.name,
        originalFilename: upload.originalFilename,
        mimeType: upload.mimeType,
        relativePath: toDataRelativePath(finalPath),
        fileSizeBytes: BigInt(upload.sizeBytes),
        durationSeconds: metadata.durationSeconds,
        permissionConfirmed: upload.permissionConfirmed,
      },
    });
    const [timeline, longFormTimeline] = await Promise.all([
      getShortFormTimelineState(studioProjectId),
      getLongFormTimelineState(studioProjectId),
    ]);
    return Response.json({ timeline, longFormTimeline }, { status: 201 });
  } catch (error) {
    await Promise.all([
      unlink(temporaryPath).catch(() => undefined),
      finalPath ? unlink(finalPath).catch(() => undefined) : Promise.resolve(),
    ]);
    await db.studioMediaAsset
      .delete({ where: { id: assetId } })
      .catch(() => undefined);
    return apiError(error);
  }
}
