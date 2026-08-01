import { apiError } from "@/lib/errors";
import { deleteProgressSnapshot } from "@/lib/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ profileId: string; snapshotId: string }>;
};

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { profileId, snapshotId } = await params;
    return Response.json({
      progress: await deleteProgressSnapshot(profileId, snapshotId),
    });
  } catch (error) {
    return apiError(error);
  }
}
