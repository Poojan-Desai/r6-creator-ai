import { apiError } from "@/lib/errors";
import { deletePlayerProfile, updatePlayerProfile } from "@/lib/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ profileId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { profileId } = await params;
    return Response.json({
      progress: await updatePlayerProfile(profileId, await request.json()),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { profileId } = await params;
    return Response.json({
      progress: await deletePlayerProfile(profileId),
    });
  } catch (error) {
    return apiError(error);
  }
}
