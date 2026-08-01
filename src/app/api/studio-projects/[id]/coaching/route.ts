import { apiError } from "@/lib/errors";
import { createHumanReviewedFinding, getCoachingState } from "@/lib/coaching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({ coaching: await getCoachingState(id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json(
      {
        coaching: await createHumanReviewedFinding(
          id,
          await request.json().catch(() => ({})),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
