import { apiError } from "@/lib/errors";
import { compareOperators } from "@/lib/operator-knowledge/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const slugs = (new URL(request.url).searchParams.get("slugs") ?? "")
      .split(",")
      .filter(Boolean);
    return Response.json({ comparison: await compareOperators(slugs) });
  } catch (error) {
    return apiError(error);
  }
}
