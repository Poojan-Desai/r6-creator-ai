import { createProjectClip } from "@/lib/clips";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return Response.json(
      { clip: await createProjectClip(id, await request.json()) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
