import { apiError } from "@/lib/errors";
import { exportGroundTruthLabels } from "@/lib/ground-truth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const document = await exportGroundTruthLabels(id);
    return new Response(`${JSON.stringify(document, null, 2)}\n`, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="r6-benchmark-labels-${id}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
