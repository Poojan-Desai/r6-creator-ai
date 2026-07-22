import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const analysis = await db.referenceStyleAnalysis.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!analysis) {
      throw new AppError(
        "That analysis no longer exists.",
        404,
        "ANALYSIS_NOT_FOUND",
      );
    }
    await db.referenceTranscriptSegment.deleteMany({
      where: { analysisId: id },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
