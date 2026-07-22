import { apiError } from "@/lib/errors";
import { deleteManualMap, getMapDetail } from "@/lib/map-knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { slug } = await params;
    const map = await getMapDetail(slug);
    if (!map)
      return Response.json(
        { error: { message: "That map does not exist." } },
        { status: 404 },
      );
    return Response.json({ map });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { slug } = await params;
    await deleteManualMap(slug);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
