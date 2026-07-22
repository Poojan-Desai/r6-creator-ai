import { apiError, AppError } from "@/lib/errors";
import { duplicateMapVersion } from "@/lib/map-knowledge/service";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { slug } = await params;
    const body = (await request.json()) as { sourceVersionId?: string };
    if (!body.sourceVersionId)
      throw new AppError(
        "Choose a version to duplicate.",
        400,
        "MAP_VERSION_REQUIRED",
      );
    const version = await duplicateMapVersion(body.sourceVersionId, body);
    return Response.json({ version, mapSlug: slug }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
