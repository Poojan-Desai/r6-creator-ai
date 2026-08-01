import { getCoachingState } from "@/lib/coaching";
import {
  reconcileCoachingAnalyses,
  startCoachingAnalysis,
} from "@/lib/coaching-analysis";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await reconcileCoachingAnalyses();
    return Response.json({ coaching: await getCoachingState(id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const analysisId = await startCoachingAnalysis(
      id,
      await request.json().catch(() => ({})),
    );
    return Response.json(
      { analysisId, coaching: await getCoachingState(id) },
      { status: 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
