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
    const reference = await db.referenceVideo.findUnique({
      where: { id },
      select: { sourceRelativePath: true },
    });
    if (!reference?.sourceRelativePath) {
      throw new AppError(
        "That local reference video is unavailable.",
        404,
        "REFERENCE_MEDIA_NOT_FOUND",
      );
    }
    return await streamLocalMp4(
      request,
      resolveDataPath(reference.sourceRelativePath),
    );
  } catch (error) {
    return apiError(error);
  }
}
