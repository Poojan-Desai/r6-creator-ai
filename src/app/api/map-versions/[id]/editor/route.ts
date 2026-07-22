import { apiError } from "@/lib/errors";
import { saveMapEditorDocument } from "@/lib/map-knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      document: await saveMapEditorDocument(id, await request.json()),
    });
  } catch (error) {
    return apiError(error);
  }
}
