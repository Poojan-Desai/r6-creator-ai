import { deleteAnalysisJob } from "@/lib/detector-framework";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await deleteAnalysisJob(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
