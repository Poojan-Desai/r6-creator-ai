import { z } from "zod";

import {
  CONTENT_TONES,
  getContentSuggestionProvider,
} from "@/lib/content-writing";
import { db } from "@/lib/db";
import { apiError } from "@/lib/errors";
import { getVerifiedOperatorWritingContext } from "@/lib/operator-knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  tone: z.enum(CONTENT_TONES),
});

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const { tone } = requestSchema.parse(await request.json());
    const clip = await db.clip.findUnique({
      where: { id },
      include: { project: { select: { name: true } } },
    });
    if (!clip || clip.status !== "READY") {
      return Response.json(
        {
          error: {
            code: "CLIP_NOT_READY",
            message: "Choose a finished clip before generating suggestions.",
          },
        },
        { status: 404 },
      );
    }

    const [transcript, verifiedOperatorContext] = await Promise.all([
      db.transcriptionJob.findFirst({
        where: { projectId: clip.projectId, status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        include: {
          segments: {
            where: {
              startSeconds: { lt: clip.endSeconds },
              endSeconds: { gt: clip.startSeconds },
            },
            orderBy: { segmentOrder: "asc" },
          },
        },
      }),
      getVerifiedOperatorWritingContext(clip.projectId),
    ]);
    if (!transcript) {
      return Response.json(
        {
          error: {
            code: "TRANSCRIPT_REQUIRED",
            message:
              "Finish a transcript for this recording before generating clip suggestions.",
          },
        },
        { status: 409 },
      );
    }
    const transcriptText = transcript.segments
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join(" ");
    if (!transcriptText) {
      return Response.json(
        {
          error: {
            code: "CLIP_TRANSCRIPT_EMPTY",
            message:
              "No spoken transcript overlaps this clip. Adjust the clip timing or transcribe another audio track.",
          },
        },
        { status: 422 },
      );
    }

    const provider = getContentSuggestionProvider();
    const suggestion = await provider.generate(
      {
        projectName: clip.project.name,
        clipName: clip.name,
        startSeconds: clip.startSeconds,
        endSeconds: clip.endSeconds,
        durationSeconds: clip.durationSeconds,
        transcript: transcriptText,
        verifiedOperatorContext,
      },
      tone,
    );
    return Response.json({ suggestion, provider: provider.id, tone });
  } catch (error) {
    return apiError(error);
  }
}
