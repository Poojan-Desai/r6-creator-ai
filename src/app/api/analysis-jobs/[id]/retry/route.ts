import { apiError } from "@/lib/errors";
import { retryAnalysisJob } from "@/lib/detector-framework";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const job = await retryAnalysisJob(id);
    return Response.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
