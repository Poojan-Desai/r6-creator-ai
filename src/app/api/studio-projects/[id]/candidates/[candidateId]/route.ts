import { apiError } from "@/lib/errors";
import { reviewStudioCandidate } from "@/lib/short-form-candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; candidateId: string }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id, candidateId } = await params;
    return Response.json({
      candidateState: await reviewStudioCandidate(
        id,
        candidateId,
        await request.json(),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
