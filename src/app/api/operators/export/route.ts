import { apiError } from "@/lib/errors";
import { exportOperatorDatabase } from "@/lib/operator-knowledge/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const document = await exportOperatorDatabase();
    return new Response(JSON.stringify(document, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition":
          'attachment; filename="r6-operator-knowledge-database.json"',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
