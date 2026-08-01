import { apiError } from "@/lib/errors";
import { deleteLongFormRenderJob } from "@/lib/long-form-renders";
import { getLongFormTimelineState } from "@/lib/long-form-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; jobId: string }>;
};

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id, jobId } = await params;
    await deleteLongFormRenderJob(jobId, id);
    return Response.json({
      timeline: await getLongFormTimelineState(id),
    });
  } catch (error) {
    return apiError(error);
  }
}
