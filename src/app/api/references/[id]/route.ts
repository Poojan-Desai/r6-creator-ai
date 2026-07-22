import { rm } from "node:fs/promises";

import { db } from "@/lib/db";
import {
  referenceAnalysisDirectory,
  referenceVideoDirectory,
} from "@/lib/data-paths";
import { apiError, AppError } from "@/lib/errors";
import {
  getRecommendedReferenceTrackId,
  parseJson,
  serializeReferenceAnalysis,
  serializeReferenceAudioTrack,
  serializeReferenceSummary,
} from "@/lib/reference-library";
import { isYouTubeMetadataConfigured, parseYouTubeUrl } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const reference = await db.referenceVideo.findUnique({
      where: { id },
      include: {
        audioTracks: { orderBy: { streamIndex: "asc" } },
        styleAnalyses: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            features: { orderBy: { label: "asc" } },
            transcriptSegments: { orderBy: { segmentOrder: "asc" } },
          },
        },
      },
    });
    if (!reference) {
      throw new AppError(
        "That reference no longer exists.",
        404,
        "REFERENCE_NOT_FOUND",
      );
    }
    const audioTracks = reference.audioTracks.map(serializeReferenceAudioTrack);
    const latestAnalysis = reference.styleAnalyses[0];
    const publicMetadata = reference.publicMetadataJson
      ? parseJson(reference.publicMetadataJson)
      : null;
    const embedUrl =
      reference.referenceType === "YOUTUBE_LINK" && reference.sourceUrl
        ? parseYouTubeUrl(reference.sourceUrl).embedUrl
        : null;

    return Response.json({
      reference: {
        ...serializeReferenceSummary(reference),
        notes: reference.notes,
        originalFilename: reference.originalFilename,
        mimeType: reference.mimeType,
        frameRate: reference.frameRate,
        thumbnailText: reference.thumbnailText,
        permissionConfirmedAt:
          reference.permissionConfirmedAt?.toISOString() ?? null,
        publicMetadata,
        embedUrl,
        audioTracks,
        recommendedTrackId: getRecommendedReferenceTrackId(
          reference.audioTracks,
        ),
        analysis: latestAnalysis
          ? serializeReferenceAnalysis(latestAnalysis)
          : null,
        fullAnalysisAvailable: reference.referenceType === "LOCAL_VIDEO",
        youtubeMetadataConfigured: isYouTubeMetadataConfigured(),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const reference = await db.referenceVideo.findUnique({
      where: { id },
      select: {
        id: true,
        referenceType: true,
        styleAnalyses: { select: { id: true } },
      },
    });
    if (!reference) {
      throw new AppError(
        "That reference no longer exists.",
        404,
        "REFERENCE_NOT_FOUND",
      );
    }

    await db.referenceVideo.delete({ where: { id } });
    await Promise.all([
      rm(referenceVideoDirectory(id), { recursive: true, force: true }).catch(
        () => undefined,
      ),
      ...reference.styleAnalyses.map((analysis) =>
        rm(referenceAnalysisDirectory(analysis.id), {
          recursive: true,
          force: true,
        }).catch(() => undefined),
      ),
    ]);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
