import { getProjectEvidenceInspector } from "@/lib/evidence-inspector";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      evidence: await getProjectEvidenceInspector(id),
    });
  } catch (error) {
    return apiError(error);
  }
}
