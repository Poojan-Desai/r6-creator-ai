import { startSingleDetectorJob } from "@/lib/detector-framework";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; definitionId: string }>;
};

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id, definitionId } = await params;
    const job = await startSingleDetectorJob(id, definitionId);
    return Response.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
