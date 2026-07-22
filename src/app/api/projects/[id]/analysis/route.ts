import { apiError } from "@/lib/errors";
import {
  getDetectorFrameworkState,
  startAnalysisJob,
} from "@/lib/detector-framework";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({ analysis: await getDetectorFrameworkState(id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const job = await startAnalysisJob(id);
    return Response.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
