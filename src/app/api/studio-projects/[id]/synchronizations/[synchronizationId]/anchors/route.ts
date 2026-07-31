import { apiError } from "@/lib/errors";
import { addSynchronizationAnchor } from "@/lib/replay-video-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; synchronizationId: string }>;
};

export async function POST(request: Request, context: Context) {
  try {
    const { id, synchronizationId } = await context.params;
    const synchronization = await addSynchronizationAnchor(
      id,
      synchronizationId,
      await request.json(),
    );
    return Response.json({ synchronization }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
