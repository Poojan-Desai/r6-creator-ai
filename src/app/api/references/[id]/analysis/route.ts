import { z } from "zod";

import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import {
  reconcileInterruptedReferenceAnalyses,
  scheduleReferenceAnalysis,
} from "@/lib/reference-analysis";
import { serializeReferenceAnalysis } from "@/lib/reference-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startSchema = z.object({
  audioTrackId: z.string().min(1).nullable().optional(),
});

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    await reconcileInterruptedReferenceAnalyses();
    const { id: referenceId } = await params;
    const input = startSchema.parse(await request.json());
    const reference = await db.referenceVideo.findUnique({
      where: { id: referenceId },
      include: { audioTracks: { orderBy: { streamIndex: "asc" } } },
    });
    if (!reference) {
      throw new AppError(
        "That reference no longer exists.",
        404,
        "REFERENCE_NOT_FOUND",
      );
    }
    if (
      reference.referenceType !== "LOCAL_VIDEO" ||
      !reference.sourceRelativePath
    ) {
      throw new AppError(
        "Complete analysis requires a local video file you own or have permission to use.",
        422,
        "LOCAL_REFERENCE_REQUIRED",
      );
    }
    if (!reference.permissionConfirmed) {
      throw new AppError(
        "Permission must be confirmed before this reference can be analyzed.",
        403,
        "REFERENCE_PERMISSION_REQUIRED",
      );
    }
    const existing = await db.referenceStyleAnalysis.findFirst({
      where: {
        referenceId,
        status: {
          in: ["QUEUED", "EXTRACTING", "TRANSCRIBING", "MEASURING", "SAVING"],
        },
      },
    });
    if (existing) {
      throw new AppError(
        "This reference already has an analysis in progress.",
        409,
        "ANALYSIS_ALREADY_RUNNING",
      );
    }

    let audioTrackId: string | null = null;
    if (reference.audioTracks.length === 1) {
      audioTrackId = reference.audioTracks[0]?.id ?? null;
      if (input.audioTrackId && input.audioTrackId !== audioTrackId) {
        throw new AppError(
          "Choose an audio track from this reference.",
          400,
          "INVALID_AUDIO_TRACK",
        );
      }
    } else if (reference.audioTracks.length > 1) {
      const selected = reference.audioTracks.find(
        (track) => track.id === input.audioTrackId,
      );
      if (!selected) {
        throw new AppError(
          "Choose the creator microphone track before starting analysis.",
          400,
          "AUDIO_TRACK_REQUIRED",
        );
      }
      audioTrackId = selected.id;
    }

    const analysis = await db.referenceStyleAnalysis.create({
      data: {
        referenceId,
        audioTrackId,
        analyzerVersion: "reference-style-v1",
      },
    });
    scheduleReferenceAnalysis(analysis.id);
    return Response.json(
      { analysis: serializeReferenceAnalysis(analysis) },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
