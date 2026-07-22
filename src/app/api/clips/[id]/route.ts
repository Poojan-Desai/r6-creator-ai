import { unlink } from "node:fs/promises";

import { db } from "@/lib/db";
import { resolveDataPath } from "@/lib/data-paths";
import { apiError, AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const clip = await db.clip.findUnique({
      where: { id },
      select: { relativePath: true },
    });
    if (!clip)
      throw new AppError("That clip does not exist.", 404, "CLIP_NOT_FOUND");

    await db.clip.delete({ where: { id } });
    if (clip.relativePath)
      await unlink(resolveDataPath(clip.relativePath)).catch(() => undefined);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
