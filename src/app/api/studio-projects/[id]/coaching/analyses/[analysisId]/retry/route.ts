import { getCoachingState } from "@/lib/coaching";
import { retryCoachingAnalysis } from "@/lib/coaching-analysis";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; analysisId: string }>;
};

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id, analysisId } = await params;
    const newAnalysisId = await retryCoachingAnalysis(id, analysisId);
    return Response.json(
      { analysisId: newAnalysisId, coaching: await getCoachingState(id) },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
