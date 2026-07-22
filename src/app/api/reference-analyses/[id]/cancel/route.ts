import { apiError } from "@/lib/errors";
import { cancelReferenceAnalysis } from "@/lib/reference-analysis";
import { serializeReferenceAnalysis } from "@/lib/reference-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const analysis = await cancelReferenceAnalysis(id);
    return Response.json({
      analysis: serializeReferenceAnalysis(analysis),
    });
  } catch (error) {
    return apiError(error);
  }
}
