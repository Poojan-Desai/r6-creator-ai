import { apiError } from "@/lib/errors";
import {
  deleteGroundTruthLabel,
  updateGroundTruthLabel,
} from "@/lib/ground-truth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      label: await updateGroundTruthLabel(id, await request.json()),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await deleteGroundTruthLabel(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
