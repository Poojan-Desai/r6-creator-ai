import { getCoachingState } from "@/lib/coaching";
import { cancelCoachingAnalysis } from "@/lib/coaching-analysis";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; analysisId: string }>;
};

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id, analysisId } = await params;
    await cancelCoachingAnalysis(id, analysisId);
    return Response.json({ coaching: await getCoachingState(id) });
  } catch (error) {
    return apiError(error);
  }
}
