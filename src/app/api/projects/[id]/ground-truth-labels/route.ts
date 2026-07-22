import { apiError } from "@/lib/errors";
import {
  createGroundTruthLabel,
  getGroundTruthState,
} from "@/lib/ground-truth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({ groundTruth: await getGroundTruthState(id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const label = await createGroundTruthLabel(id, await request.json());
    return Response.json({ label }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
