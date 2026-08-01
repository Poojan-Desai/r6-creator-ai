import { createPracticeDrill } from "@/lib/coaching-reports";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json(
      {
        coaching: await createPracticeDrill(
          id,
          await request.json().catch(() => ({})),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
