import { resolveDataPath } from "@/lib/data-paths";
import { getCoachingReportExportFile } from "@/lib/coaching-reports";
import { apiError } from "@/lib/errors";
import { streamLocalFile } from "@/lib/media-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; reportId: string; exportId: string }>;
};

export async function GET(request: Request, { params }: Context) {
  try {
    const { id, reportId, exportId } = await params;
    const file = await getCoachingReportExportFile(id, reportId, exportId);
    return streamLocalFile(request, resolveDataPath(file.relativePath), {
      contentType: file.contentType,
      downloadName: file.downloadName,
    });
  } catch (error) {
    return apiError(error);
  }
}
