import { apiError, AppError } from "@/lib/errors";
import {
  deleteStudioProject,
  findStudioProject,
  replaceStudioProjectSettings,
} from "@/lib/studio-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const project = await findStudioProject(id);
    if (!project) {
      throw new AppError(
        "That unified project does not exist.",
        404,
        "STUDIO_PROJECT_NOT_FOUND",
      );
    }
    return Response.json({ project });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const project = await replaceStudioProjectSettings(
      id,
      await request.json(),
    );
    return Response.json({ project });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    await deleteStudioProject(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
