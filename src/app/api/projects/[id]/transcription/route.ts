import { z } from "zod";

import { db } from "@/lib/db";
import { apiError } from "@/lib/errors";
import {
  getTranscriptionHealth,
  getTranscriptionState,
  reconcileInterruptedTranscriptions,
  scheduleTranscriptionJob,
  serializeTranscriptionJob,
} from "@/lib/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startSchema = z.object({
  audioTrackId: z.string().min(1),
});

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({ transcription: await getTranscriptionState(id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    await reconcileInterruptedTranscriptions();
    const { id: projectId } = await params;
    const body = startSchema.parse(await request.json());
    const health = getTranscriptionHealth();
    if (!health.ready) {
      return Response.json(
        {
          error: {
            code: "TRANSCRIPTION_NOT_READY",
            message: health.message,
          },
        },
        { status: 503 },
      );
    }

    const track = await db.audioTrack.findFirst({
      where: { id: body.audioTrackId, projectId },
    });
    if (!track) {
      return Response.json(
        {
          error: {
            code: "INVALID_AUDIO_TRACK",
            message: "Choose an audio track from this recording.",
          },
        },
        { status: 400 },
      );
    }
    const existing = await db.transcriptionJob.findFirst({
      where: {
        projectId,
        status: { in: ["QUEUED", "EXTRACTING", "TRANSCRIBING", "SAVING"] },
      },
    });
    if (existing) {
      return Response.json(
        {
          error: {
            code: "TRANSCRIPTION_ALREADY_RUNNING",
            message: "This project already has a transcription in progress.",
          },
        },
        { status: 409 },
      );
    }

    const job = await db.transcriptionJob.create({
      data: {
        projectId,
        audioTrackId: track.id,
        provider: "whisper.cpp",
        modelName: health.modelName,
      },
    });
    scheduleTranscriptionJob(job.id);
    return Response.json(
      { job: serializeTranscriptionJob(job) },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
