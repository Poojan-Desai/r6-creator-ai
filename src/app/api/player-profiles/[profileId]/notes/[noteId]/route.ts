import { apiError } from "@/lib/errors";
import { deleteProgressNote } from "@/lib/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ profileId: string; noteId: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { profileId, noteId } = await params;
    return Response.json({
      progress: await deleteProgressNote(profileId, noteId),
    });
  } catch (error) {
    return apiError(error);
  }
}
