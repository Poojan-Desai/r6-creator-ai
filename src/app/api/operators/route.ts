import { apiError } from "@/lib/errors";
import { listOperators } from "@/lib/operator-knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return Response.json({
      operators: await listOperators({
        search: params.get("search") ?? "",
        side: params.get("side") || undefined,
        specialty: params.get("specialty") || undefined,
        role: params.get("role") || undefined,
        squad: params.get("squad") || undefined,
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}
