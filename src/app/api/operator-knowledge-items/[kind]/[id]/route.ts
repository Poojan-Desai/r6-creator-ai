import { apiError, AppError } from "@/lib/errors";
import { deleteOperatorKnowledgeItem } from "@/lib/operator-knowledge/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ kind: string; id: string }> };

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { kind, id } = await params;
    if (
      kind !== "alias" &&
      kind !== "role" &&
      kind !== "interaction" &&
      kind !== "map-link"
    ) {
      throw new AppError(
        "That operator knowledge item type cannot be deleted.",
        400,
        "OPERATOR_ITEM_KIND_INVALID",
      );
    }
    await deleteOperatorKnowledgeItem(kind, id);
    return Response.json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
