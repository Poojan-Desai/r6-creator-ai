import { apiError } from "@/lib/errors";
import { readBlueprintAsset } from "@/lib/map-knowledge/blueprints";
import { streamLocalFile } from "@/lib/media-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const { asset, absolutePath } = await readBlueprintAsset(id);
    return streamLocalFile(request, absolutePath, {
      contentType: asset.mimeType,
      downloadName:
        new URL(request.url).searchParams.get("download") === "1"
          ? asset.originalFileName
          : undefined,
    });
  } catch (error) {
    return apiError(error);
  }
}
