import { rm } from "node:fs/promises";

import { db } from "@/lib/db";
import { projectClipDirectory, projectUploadDirectory } from "@/lib/data-paths";
import { apiError, AppError } from "@/lib/errors";
import { findProjectDetail } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const project = await findProjectDetail(id);
    if (!project)
      throw new AppError(
        "That project does not exist.",
        404,
        "PROJECT_NOT_FOUND",
      );
    return Response.json({ project });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const project = await db.project.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!project)
      throw new AppError(
        "That project does not exist.",
        404,
        "PROJECT_NOT_FOUND",
      );

    await db.project.delete({ where: { id } });
    await Promise.all([
      rm(projectUploadDirectory(id), { recursive: true, force: true }).catch(
        () => undefined,
      ),
      rm(projectClipDirectory(id), { recursive: true, force: true }).catch(
        () => undefined,
      ),
    ]);

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
