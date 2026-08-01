import { apiError } from "@/lib/errors";
import { startVoiceoverProcessingJob } from "@/lib/voiceover-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; takeId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const { id, takeId } = await params;
    const job = await startVoiceoverProcessingJob(
      id,
      takeId,
      await request.json().catch(() => ({})),
    );
    return Response.json(
      {
        job: {
          id: job.id,
          kind: job.kind,
          status: job.status,
          progress: job.progress,
          stage: job.stage,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
