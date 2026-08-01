import { apiError } from "@/lib/errors";
import { exportUnifiedReviewLabels } from "@/lib/unified-benchmark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return new Response(
      JSON.stringify(await exportUnifiedReviewLabels(), null, 2),
      {
        headers: {
          "cache-control": "no-store",
          "content-disposition":
            'attachment; filename="r6-creator-unified-review-labels.json"',
          "content-type": "application/json; charset=utf-8",
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
