import { apiError } from "@/lib/errors";
import { getOperatorDetail } from "@/lib/operator-knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { slug } = await params;
    return Response.json({ operator: await getOperatorDetail(slug) });
  } catch (error) {
    return apiError(error);
  }
}
