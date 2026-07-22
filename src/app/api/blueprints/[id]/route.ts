import { apiError } from "@/lib/errors";
import {
  deleteBlueprintAsset,
  updateBlueprintAsset,
} from "@/lib/map-knowledge/blueprints";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      asset: await updateBlueprintAsset(id, await request.json()),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await deleteBlueprintAsset(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
