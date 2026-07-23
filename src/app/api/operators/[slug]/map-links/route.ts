import { apiError } from "@/lib/errors";
import { addOperatorMapLink } from "@/lib/operator-knowledge/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { slug } = await params;
    return Response.json(
      { operator: await addOperatorMapLink(slug, await request.json()) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
