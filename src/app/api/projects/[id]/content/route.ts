import { z } from "zod";

import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import { serializeContentDraft } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const contentSchema = z.object({
  voiceoverScript: z.string().max(20_000, "The voiceover script is too long."),
  openingHook: z.string().max(2_000, "The opening hook is too long."),
  youtubeTitle: z.string().max(500, "The YouTube title is too long."),
  shortFormCaption: z
    .string()
    .max(5_000, "The short-form caption is too long."),
  thumbnailText: z.string().max(500, "The thumbnail text is too long."),
  editingInstructions: z
    .string()
    .max(20_000, "The editing instructions are too long."),
});

export async function PATCH(request: Request, context: Context) {
  try {
    const { id: projectId } = await context.params;
    const payload = contentSchema.parse(await request.json());
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project)
      throw new AppError(
        "That project does not exist.",
        404,
        "PROJECT_NOT_FOUND",
      );

    const content = await db.contentDraft.upsert({
      where: { projectId },
      create: { projectId, ...payload },
      update: payload,
    });
    return Response.json({ content: serializeContentDraft(content) });
  } catch (error) {
    return apiError(error);
  }
}
