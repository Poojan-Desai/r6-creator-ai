import { apiError } from "@/lib/errors";
import { importOperatorKnowledgeDocument } from "@/lib/operator-knowledge/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const result = await importOperatorKnowledgeDocument(await request.json());
    return Response.json(
      {
        ...result,
        operator: result.importedCount === 1 ? result.operators[0] : undefined,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
