import { getCoachingState } from "@/lib/coaching";
import { deleteCoachingCalibration } from "@/lib/coaching-measurements";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; calibrationId: string }>;
};

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id, calibrationId } = await params;
    await deleteCoachingCalibration(id, calibrationId);
    return Response.json({ coaching: await getCoachingState(id) });
  } catch (error) {
    return apiError(error);
  }
}
