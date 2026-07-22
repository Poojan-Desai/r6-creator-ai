import { cancelAnalysisJob } from "@/lib/detector-framework";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await cancelAnalysisJob(id);
    return Response.json({ accepted: true }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
