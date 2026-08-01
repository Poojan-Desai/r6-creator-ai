import {
  deletePracticeDrill,
  updatePracticeDrill,
} from "@/lib/coaching-reports";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; drillId: string }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id, drillId } = await params;
    return Response.json({
      coaching: await updatePracticeDrill(
        id,
        drillId,
        await request.json().catch(() => ({})),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id, drillId } = await params;
    return Response.json({
      coaching: await deletePracticeDrill(id, drillId),
    });
  } catch (error) {
    return apiError(error);
  }
}
