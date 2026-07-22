import { apiError } from "@/lib/errors";
import { importMapKnowledge } from "@/lib/map-knowledge/service";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { slug } = await params;
    return Response.json({
      document: await importMapKnowledge(slug, await request.json()),
    });
  } catch (error) {
    return apiError(error);
  }
}
