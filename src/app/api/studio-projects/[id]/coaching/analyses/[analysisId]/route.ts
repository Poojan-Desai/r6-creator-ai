import { getCoachingState } from "@/lib/coaching";
import { deleteCoachingAnalysis } from "@/lib/coaching-analysis";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; analysisId: string }>;
};

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id, analysisId } = await params;
    await deleteCoachingAnalysis(id, analysisId);
    return Response.json({ coaching: await getCoachingState(id) });
  } catch (error) {
    return apiError(error);
  }
}
