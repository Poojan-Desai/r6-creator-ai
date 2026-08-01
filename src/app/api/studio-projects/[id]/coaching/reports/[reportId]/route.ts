import { deleteCoachingReport } from "@/lib/coaching-reports";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; reportId: string }>;
};

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id, reportId } = await params;
    return Response.json({
      coaching: await deleteCoachingReport(id, reportId),
    });
  } catch (error) {
    return apiError(error);
  }
}
