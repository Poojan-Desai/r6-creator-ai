import { apiError } from "@/lib/errors";
import { addMapAlias } from "@/lib/map-knowledge/service";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { slug } = await params;
    return Response.json(
      { alias: await addMapAlias(slug, await request.json()) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
