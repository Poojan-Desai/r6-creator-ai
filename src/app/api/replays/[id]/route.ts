import { apiError, AppError } from "@/lib/errors";
import { deleteReplayPackage, findReplayPackage } from "@/lib/replays/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const replay = await findReplayPackage(id);
    if (!replay) {
      throw new AppError(
        "That Match Replay no longer exists.",
        404,
        "REPLAY_NOT_FOUND",
      );
    }
    return Response.json({ replay });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await deleteReplayPackage(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
