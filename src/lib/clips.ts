import { randomUUID } from "node:crypto";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  projectClipDirectory,
  resolveDataPath,
  toDataRelativePath,
} from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { serializeClip } from "@/lib/projects";
import { validateClipRange } from "@/lib/time";
import { createVideoClip } from "@/lib/video";

export const clipRequestSchema = z
  .object({
    name: z
      .string()
      .trim()
      .max(100, "Keep the clip name under 100 characters.")
      .optional(),
    startTime: z.union([z.string(), z.number()]),
    endTime: z.union([z.string(), z.number()]),
  })
  .strict();

export async function createProjectClip(projectId: string, input: unknown) {
  const clipId = randomUUID();
  const clipDirectory = projectClipDirectory(projectId);
  const temporaryPath = path.join(clipDirectory, `${clipId}.processing.mp4`);
  const finalPath = path.join(clipDirectory, `${clipId}.mp4`);
  let clipCreated = false;

  try {
    const payload = clipRequestSchema.parse(input);
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        durationSeconds: true,
        sourceRelativePath: true,
        _count: { select: { clips: true } },
      },
    });
    if (!project) {
      throw new AppError(
        "That project does not exist.",
        404,
        "PROJECT_NOT_FOUND",
      );
    }

    const range = validateClipRange(
      payload.startTime,
      payload.endTime,
      project.durationSeconds,
    );
    const name =
      payload.name?.trim() ||
      `Clip ${String(project._count.clips + 1).padStart(2, "0")}`;

    await db.clip.create({
      data: {
        id: clipId,
        projectId,
        name,
        status: "PROCESSING",
        startSeconds: range.startSeconds,
        endSeconds: range.endSeconds,
        durationSeconds: range.durationSeconds,
      },
    });
    clipCreated = true;

    await mkdir(clipDirectory, { recursive: true });
    await createVideoClip(
      resolveDataPath(project.sourceRelativePath),
      temporaryPath,
      range.startSeconds,
      range.durationSeconds,
    );
    const output = await stat(temporaryPath);
    if (!output.isFile() || output.size === 0) {
      throw new AppError(
        "FFmpeg created an empty clip. Please try a different range.",
        422,
        "EMPTY_CLIP",
      );
    }
    await rename(temporaryPath, finalPath);

    const clip = await db.clip.update({
      where: { id: clipId },
      data: {
        status: "READY",
        relativePath: toDataRelativePath(finalPath),
        fileSizeBytes: BigInt(output.size),
        errorMessage: null,
      },
    });
    return serializeClip(clip);
  } catch (error) {
    await Promise.all([
      unlink(temporaryPath).catch(() => undefined),
      unlink(finalPath).catch(() => undefined),
    ]);
    if (clipCreated) {
      const message =
        error instanceof Error
          ? error.message
          : "The clip could not be created.";
      await db.clip
        .update({
          where: { id: clipId },
          data: {
            status: "ERROR",
            errorMessage: message,
            relativePath: null,
            fileSizeBytes: null,
          },
        })
        .catch(() => undefined);
    }
    throw error;
  }
}
