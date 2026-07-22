import { apiError } from "@/lib/errors";
import { queryMapGraph } from "@/lib/map-knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({ graph: await queryMapGraph(id) });
  } catch (error) {
    return apiError(error);
  }
}
