import { apiError } from "@/lib/errors";
import {
  getProjectOperatorContext,
  updateProjectOperatorContext,
} from "@/lib/operator-knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      operatorContext: await getProjectOperatorContext(id),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      operatorContext: await updateProjectOperatorContext(
        id,
        await request.json(),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
