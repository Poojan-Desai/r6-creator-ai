import { createFindingReviewClip } from "@/lib/coaching-reports";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; findingId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const { id, findingId } = await params;
    return Response.json(
      {
        coaching: await createFindingReviewClip(
          id,
          findingId,
          await request.json().catch(() => ({})),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
