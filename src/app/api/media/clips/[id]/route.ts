import { db } from "@/lib/db";
import { resolveDataPath } from "@/lib/data-paths";
import { apiError, AppError } from "@/lib/errors";
import { safeDownloadName } from "@/lib/format";
import { streamLocalMp4 } from "@/lib/media-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const clip = await db.clip.findUnique({
      where: { id },
      select: { name: true, status: true, relativePath: true },
    });
    if (!clip)
      throw new AppError("That clip does not exist.", 404, "CLIP_NOT_FOUND");
    if (clip.status !== "READY" || !clip.relativePath) {
      throw new AppError(
        "This clip is not ready to play yet.",
        409,
        "CLIP_NOT_READY",
      );
    }

    const download = new URL(request.url).searchParams.get("download") === "1";
    return await streamLocalMp4(request, resolveDataPath(clip.relativePath), {
      downloadName: download ? safeDownloadName(clip.name) : undefined,
    });
  } catch (error) {
    return apiError(error);
  }
}
