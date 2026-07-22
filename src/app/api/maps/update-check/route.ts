import { apiError } from "@/lib/errors";
import { createMapUpdateCheck } from "@/lib/map-knowledge/service";

export const runtime = "nodejs";

export async function POST() {
  try {
    return Response.json(
      { updateCheck: await createMapUpdateCheck() },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
