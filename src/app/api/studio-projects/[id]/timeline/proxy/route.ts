import { apiError } from "@/lib/errors";
import { startShortFormProxyJob } from "@/lib/short-form-proxy";
import { getShortFormTimelineState } from "@/lib/short-form-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const job = await startShortFormProxyJob(id);
    return Response.json(
      {
        jobId: job.id,
        timeline: await getShortFormTimelineState(id),
      },
      { status: job.status === "COMPLETED" ? 200 : 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
