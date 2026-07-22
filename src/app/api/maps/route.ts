import { apiError } from "@/lib/errors";
import { createManualMap, listMapKnowledge } from "@/lib/map-knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return Response.json({
      maps: await listMapKnowledge({
        search: url.searchParams.get("search") ?? "",
        playlist: url.searchParams.get("playlist") ?? "ALL",
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const map = await createManualMap(await request.json());
    return Response.json({ map }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
