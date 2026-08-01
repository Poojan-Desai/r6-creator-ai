import { apiError } from "@/lib/errors";
import {
  deletePlayerPracticeGoal,
  updatePlayerPracticeGoal,
} from "@/lib/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ profileId: string; goalId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { profileId, goalId } = await params;
    return Response.json({
      progress: await updatePlayerPracticeGoal(
        profileId,
        goalId,
        await request.json(),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { profileId, goalId } = await params;
    return Response.json({
      progress: await deletePlayerPracticeGoal(profileId, goalId),
    });
  } catch (error) {
    return apiError(error);
  }
}
