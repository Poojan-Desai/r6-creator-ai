import { apiError } from "@/lib/errors";
import { deleteManualMapVersion } from "@/lib/map-knowledge/service";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await deleteManualMapVersion(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
