import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import {
  serializeReferenceSummary,
  youtubeReferenceInputSchema,
} from "@/lib/reference-library";
import {
  fetchYouTubePublicMetadata,
  isYouTubeMetadataConfigured,
  parseYouTubeUrl,
} from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = youtubeReferenceInputSchema.parse(await request.json());
    const normalized = parseYouTubeUrl(input.url);
    const duplicate = await db.referenceVideo.findUnique({
      where: { youtubeVideoId: normalized.videoId },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppError(
        "That YouTube video is already in the Reference Library.",
        409,
        "REFERENCE_ALREADY_EXISTS",
      );
    }

    let publicMetadata = null;
    let metadataWarning: string | null = null;
    if (isYouTubeMetadataConfigured()) {
      try {
        publicMetadata = await fetchYouTubePublicMetadata(normalized.videoId);
      } catch (error) {
        metadataWarning =
          error instanceof Error
            ? error.message
            : "Public YouTube metadata was unavailable.";
      }
    }

    const title = publicMetadata?.title || input.title;
    const creatorName = publicMetadata?.creatorName || input.creatorName;
    if (!title || !creatorName) {
      throw new AppError(
        "Enter the video title and creator/channel name when YouTube metadata is unavailable.",
        400,
        "MANUAL_METADATA_REQUIRED",
      );
    }

    const reference = await db.referenceVideo.create({
      data: {
        referenceType: "YOUTUBE_LINK",
        title,
        creatorName,
        game: input.game || "Rainbow Six Siege",
        platform: input.platform || "YouTube",
        sourceType: input.sourceType || "REFERENCE_LINK",
        sourceUrl: normalized.canonicalUrl,
        youtubeVideoId: normalized.videoId,
        contentCategory: input.contentCategory,
        notes: input.notes || null,
        thumbnailText: input.thumbnailText || null,
        durationSeconds: publicMetadata?.durationSeconds ?? null,
        metadataSource: publicMetadata ? "YOUTUBE_DATA_API" : "MANUAL",
        publicMetadataJson: publicMetadata
          ? JSON.stringify(publicMetadata)
          : null,
      },
      include: { styleAnalyses: true },
    });

    return Response.json(
      {
        reference: serializeReferenceSummary(reference),
        metadataWarning,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
