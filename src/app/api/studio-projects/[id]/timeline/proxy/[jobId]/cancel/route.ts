import { apiError } from "@/lib/errors";
import { cancelShortFormProxyJob } from "@/lib/short-form-proxy";
import { getShortFormTimelineState } from "@/lib/short-form-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; jobId: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id, jobId } = await params;
    await cancelShortFormProxyJob(jobId, id);
    return Response.json(
      { timeline: await getShortFormTimelineState(id) },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
