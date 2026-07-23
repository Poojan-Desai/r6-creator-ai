import { apiError } from "@/lib/errors";
import { exportOperator } from "@/lib/operator-knowledge/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { slug } = await params;
    return new Response(JSON.stringify(await exportOperator(slug), null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="r6-operator-${slug}.json"`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
