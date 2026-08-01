import { apiError } from "@/lib/errors";
import { cancelVoiceoverJob } from "@/lib/voiceover-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; jobId: string }>;
};

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id, jobId } = await params;
    const job = await cancelVoiceoverJob(id, jobId);
    return Response.json({
      job: {
        id: job.id,
        status: job.status,
        stage: job.stage,
        cancelRequestedAt: job.cancelRequestedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
