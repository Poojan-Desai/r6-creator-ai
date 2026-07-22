import { db } from "@/lib/db";
import { resolveDataPath } from "@/lib/data-paths";
import { apiError, AppError } from "@/lib/errors";
import { streamLocalMp4 } from "@/lib/media-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const project = await db.project.findUnique({
      where: { id },
      select: { sourceRelativePath: true },
    });
    if (!project)
      throw new AppError(
        "That project does not exist.",
        404,
        "PROJECT_NOT_FOUND",
      );

    return await streamLocalMp4(
      request,
      resolveDataPath(project.sourceRelativePath),
    );
  } catch (error) {
    return apiError(error);
  }
}
