import { apiError } from "@/lib/errors";
import { cancelShortFormExportJob } from "@/lib/short-form-exports";
import { getShortFormTimelineState } from "@/lib/short-form-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; jobId: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id, jobId } = await params;
    await cancelShortFormExportJob(jobId, id);
    return Response.json(
      { timeline: await getShortFormTimelineState(id) },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
