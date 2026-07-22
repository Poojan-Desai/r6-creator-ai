import { apiError } from "@/lib/errors";
import {
  getProjectMapContextState,
  saveProjectMapContext,
} from "@/lib/map-knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json(await getProjectMapContextState(id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json(await saveProjectMapContext(id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
