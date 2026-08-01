import { createCoachingReportExport } from "@/lib/coaching-reports";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; reportId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const { id, reportId } = await params;
    return Response.json(
      await createCoachingReportExport(
        id,
        reportId,
        await request.json().catch(() => ({})),
      ),
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
