import { apiError } from "@/lib/errors";
import { createOperatorUpdateReview } from "@/lib/operator-knowledge/service";

export const runtime = "nodejs";

export async function POST() {
  try {
    return Response.json(
      { review: await createOperatorUpdateReview() },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
