import { mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";

import {
  ensureDataDirectories,
  studioMediaDirectory,
  toDataRelativePath,
} from "@/lib/data-paths";
import { db } from "@/lib/db";
import { apiError } from "@/lib/errors";
import {
  probeStudioAudio,
  streamMultipartStudioAudio,
} from "@/lib/studio-audio";
import {
  createVoiceoverTake,
  getOrCreateVoiceoverProduction,
} from "@/lib/voiceover";

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
    await getOrCreateVoiceoverProduction(studioProjectId);
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
        kind: "VOICEOVER",
        name: upload.name,
        originalFilename: upload.originalFilename,
        mimeType: upload.mimeType,
        relativePath: toDataRelativePath(finalPath),
        fileSizeBytes: BigInt(upload.sizeBytes),
        durationSeconds: metadata.durationSeconds,
        permissionConfirmed: upload.permissionConfirmed,
      },
    });
    return Response.json(
      {
        voiceover: await createVoiceoverTake({
          studioProjectId,
          sourceAssetId: assetId,
          name: upload.name,
          scriptSectionKey: upload.scriptSectionKey,
        }),
      },
      { status: 201 },
    );
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
