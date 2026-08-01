import { db } from "@/lib/db";
import { resolveDataPath } from "@/lib/data-paths";
import { apiError, AppError } from "@/lib/errors";
import { streamLocalFile } from "@/lib/media-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const asset = await db.studioMediaAsset.findUnique({ where: { id } });
    if (!asset) {
      throw new AppError(
        "That local audio asset does not exist.",
        404,
        "STUDIO_MEDIA_NOT_FOUND",
      );
    }
    return streamLocalFile(request, resolveDataPath(asset.relativePath), {
      contentType: asset.mimeType,
    });
  } catch (error) {
    return apiError(error);
  }
}
