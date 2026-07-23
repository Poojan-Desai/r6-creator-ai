import { apiError } from "@/lib/errors";
import {
  getProjectBenchmarkState,
  runProjectBenchmark,
  updateBenchmarkReviewScope,
} from "@/lib/phase3b2-benchmark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({ benchmark: await getProjectBenchmarkState(id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      benchmark: await updateBenchmarkReviewScope(id, await request.json()),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json(await runProjectBenchmark(id), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
