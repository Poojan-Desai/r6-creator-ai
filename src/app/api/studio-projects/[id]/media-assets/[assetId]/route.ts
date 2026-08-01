import { unlink } from "node:fs/promises";

import { db } from "@/lib/db";
import { resolveDataPath } from "@/lib/data-paths";
import { apiError, AppError } from "@/lib/errors";
import { longFormTimelineDocumentSchema } from "@/lib/long-form-timeline-document";
import { timelineDocumentSchema } from "@/lib/timeline-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; assetId: string }>;
};

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id: studioProjectId, assetId } = await params;
    const asset = await db.studioMediaAsset.findFirst({
      where: { id: assetId, studioProjectId },
      include: {
        studioProject: {
          include: {
            shortFormProduction: {
              include: {
                timeline: {
                  include: {
                    revisions: { orderBy: { version: "desc" }, take: 1 },
                  },
                },
              },
            },
            longFormProduction: {
              include: {
                timeline: {
                  include: {
                    revisions: { orderBy: { version: "desc" }, take: 1 },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!asset) {
      throw new AppError(
        "That local audio asset does not exist.",
        404,
        "STUDIO_MEDIA_NOT_FOUND",
      );
    }
    const documentJson =
      asset.studioProject.shortFormProduction?.timeline?.revisions[0]
        ?.documentJson;
    if (documentJson) {
      const document = timelineDocumentSchema.parse(
        JSON.parse(documentJson) as unknown,
      );
      if (document.items.some((item) => item.mediaAssetId === asset.id)) {
        throw new AppError(
          "Remove this audio from the current timeline before deleting it.",
          409,
          "STUDIO_MEDIA_IN_USE",
        );
      }
    }
    const longFormDocumentJson =
      asset.studioProject.longFormProduction?.timeline?.revisions[0]
        ?.documentJson;
    if (longFormDocumentJson) {
      const document = longFormTimelineDocumentSchema.parse(
        JSON.parse(longFormDocumentJson) as unknown,
      );
      if (document.items.some((item) => item.mediaAssetId === asset.id)) {
        throw new AppError(
          "Remove this audio from the current long-form timeline before deleting it.",
          409,
          "STUDIO_MEDIA_IN_USE",
        );
      }
    }
    await db.studioMediaAsset.delete({ where: { id: asset.id } });
    await unlink(resolveDataPath(asset.relativePath)).catch(() => undefined);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
