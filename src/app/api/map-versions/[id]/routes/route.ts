import { apiError, AppError } from "@/lib/errors";
import { findMapRoutes } from "@/lib/map-knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!from || !to) {
      throw new AppError(
        "Choose a starting element and destination.",
        400,
        "MAP_ROUTE_ELEMENTS_REQUIRED",
      );
    }
    return Response.json({ routes: await findMapRoutes(id, from, to) });
  } catch (error) {
    return apiError(error);
  }
}
