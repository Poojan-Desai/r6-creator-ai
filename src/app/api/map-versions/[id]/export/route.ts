import { apiError } from "@/lib/errors";
import { exportMapKnowledge } from "@/lib/map-knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "COMPLETE_MAP";
    const document = await exportMapKnowledge(
      id,
      scope as Parameters<typeof exportMapKnowledge>[1],
      url.searchParams.get("floor") ?? undefined,
    );
    return Response.json(document, {
      headers: {
        "Content-Disposition": `attachment; filename="r6-map-${document.map.stableId}-${document.map.versionStableId.replaceAll(":", "-")}.json"`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
