import { resolveDataPath } from "@/lib/data-paths";
import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import { streamLocalMp4 } from "@/lib/media-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const job = await db.longFormRenderJob.findUnique({ where: { id } });
    if (!job || job.status !== "COMPLETED" || !job.relativePath) {
      throw new AppError(
        "That long-form render is not ready.",
        404,
        "LONG_FORM_RENDER_NOT_READY",
      );
    }
    const url = new URL(request.url);
    return streamLocalMp4(request, resolveDataPath(job.relativePath), {
      downloadName:
        url.searchParams.get("download") === "1"
          ? job.outputFilename
          : undefined,
    });
  } catch (error) {
    return apiError(error);
  }
}
