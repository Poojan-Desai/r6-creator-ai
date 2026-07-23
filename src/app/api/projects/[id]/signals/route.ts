import { apiError } from "@/lib/errors";
import {
  getSignalExplorerState,
  updateSignalExplorerPreferences,
} from "@/lib/signal-explorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({ signals: await getSignalExplorerState(id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      signals: await updateSignalExplorerPreferences(id, await request.json()),
    });
  } catch (error) {
    return apiError(error);
  }
}
