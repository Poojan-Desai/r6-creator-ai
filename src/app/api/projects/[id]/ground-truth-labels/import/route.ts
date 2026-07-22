import { apiError } from "@/lib/errors";
import { importGroundTruthLabels } from "@/lib/ground-truth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      groundTruth: await importGroundTruthLabels(id, await request.json()),
    });
  } catch (error) {
    return apiError(error);
  }
}
