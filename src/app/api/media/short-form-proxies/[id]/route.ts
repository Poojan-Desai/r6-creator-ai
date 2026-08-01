import { db } from "@/lib/db";
import { resolveDataPath } from "@/lib/data-paths";
import { apiError, AppError } from "@/lib/errors";
import { streamLocalMp4 } from "@/lib/media-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const job = await db.shortFormProxyJob.findUnique({ where: { id } });
    if (!job || job.status !== "COMPLETED" || !job.relativePath) {
      throw new AppError("That preview is not ready.", 404, "PROXY_NOT_READY");
    }
    return streamLocalMp4(request, resolveDataPath(job.relativePath));
  } catch (error) {
    return apiError(error);
  }
}
