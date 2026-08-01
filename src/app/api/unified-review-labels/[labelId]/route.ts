import { apiError } from "@/lib/errors";
import {
  deleteUnifiedReviewLabel,
  updateUnifiedReviewLabel,
} from "@/lib/unified-benchmark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ labelId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { labelId } = await params;
    return Response.json({
      benchmark: await updateUnifiedReviewLabel(labelId, await request.json()),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { labelId } = await params;
    return Response.json({
      benchmark: await deleteUnifiedReviewLabel(labelId),
    });
  } catch (error) {
    return apiError(error);
  }
}
