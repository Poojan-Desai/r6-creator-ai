import { apiError } from "@/lib/errors";
import { searchMapKnowledge } from "@/lib/map-knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json({ results: await searchMapKnowledge(query) });
  } catch (error) {
    return apiError(error);
  }
}
