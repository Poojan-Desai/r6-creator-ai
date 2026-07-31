import { apiError } from "@/lib/errors";
import {
  deleteSynchronizationAnchor,
  updateSynchronizationAnchor,
} from "@/lib/replay-video-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{
    id: string;
    synchronizationId: string;
    anchorId: string;
  }>;
};

export async function PUT(request: Request, context: Context) {
  try {
    const { id, synchronizationId, anchorId } = await context.params;
    const synchronization = await updateSynchronizationAnchor(
      id,
      synchronizationId,
      anchorId,
      await request.json(),
    );
    return Response.json({ synchronization });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id, synchronizationId, anchorId } = await context.params;
    const synchronization = await deleteSynchronizationAnchor(
      id,
      synchronizationId,
      anchorId,
    );
    return Response.json({ synchronization });
  } catch (error) {
    return apiError(error);
  }
}
