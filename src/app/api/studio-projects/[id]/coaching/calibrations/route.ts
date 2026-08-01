import { getCoachingState } from "@/lib/coaching";
import { createCoachingCalibration } from "@/lib/coaching-measurements";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await createCoachingCalibration(id, await request.json().catch(() => ({})));
    return Response.json(
      { coaching: await getCoachingState(id) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
