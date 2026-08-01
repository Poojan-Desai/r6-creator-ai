import { apiError } from "@/lib/errors";
import {
  createUnifiedReviewLabel,
  getUnifiedBenchmarkState,
} from "@/lib/unified-benchmark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({
      benchmark: await getUnifiedBenchmarkState(),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    return Response.json(
      {
        benchmark: await createUnifiedReviewLabel(await request.json()),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
