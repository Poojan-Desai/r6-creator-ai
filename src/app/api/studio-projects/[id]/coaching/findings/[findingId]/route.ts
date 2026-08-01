import { deleteCoachingFinding, updateCoachingFinding } from "@/lib/coaching";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; findingId: string }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id, findingId } = await params;
    return Response.json({
      coaching: await updateCoachingFinding(
        id,
        findingId,
        await request.json().catch(() => ({})),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id, findingId } = await params;
    return Response.json({
      coaching: await deleteCoachingFinding(id, findingId),
    });
  } catch (error) {
    return apiError(error);
  }
}
