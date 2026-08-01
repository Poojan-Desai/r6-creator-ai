import { apiError } from "@/lib/errors";
import { deleteShortFormExportJob } from "@/lib/short-form-exports";
import { getShortFormTimelineState } from "@/lib/short-form-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; jobId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id, jobId } = await params;
    await deleteShortFormExportJob(jobId, id);
    return Response.json({
      timeline: await getShortFormTimelineState(id),
    });
  } catch (error) {
    return apiError(error);
  }
}
