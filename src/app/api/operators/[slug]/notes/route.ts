import { apiError } from "@/lib/errors";
import { updateOperatorNotes } from "@/lib/operator-knowledge/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { slug } = await params;
    return Response.json({
      operator: await updateOperatorNotes(slug, await request.json()),
    });
  } catch (error) {
    return apiError(error);
  }
}
