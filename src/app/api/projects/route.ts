import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { db } from "@/lib/db";
import {
  ensureDataDirectories,
  projectUploadDirectory,
  toDataRelativePath,
} from "@/lib/data-paths";
import { apiError } from "@/lib/errors";
import { serializeProjectSummary } from "@/lib/projects";
import { streamMultipartVideo } from "@/lib/upload";
import { probeVideo } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = await db.project.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { clips: true } } },
    });
    return Response.json({ projects: projects.map(serializeProjectSummary) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const projectId = crypto.randomUUID();
  const projectDirectory = projectUploadDirectory(projectId);
  const temporaryPath = path.join(projectDirectory, "source.uploading");
  const finalPath = path.join(projectDirectory, "source.mp4");

  try {
    await ensureDataDirectories();
    await mkdir(projectDirectory, { recursive: true });
    const upload = await streamMultipartVideo(request, temporaryPath);
    const metadata = await probeVideo(temporaryPath);
    await rename(temporaryPath, finalPath);

    const project = await db.project.create({
      data: {
        id: projectId,
        name: upload.projectName,
        originalFilename: upload.originalFilename,
        sourceRelativePath: toDataRelativePath(finalPath),
        mimeType: upload.mimeType,
        fileSizeBytes: BigInt(upload.sizeBytes),
        durationSeconds: metadata.durationSeconds,
        width: metadata.width,
        height: metadata.height,
        frameRate: metadata.frameRate,
        contentDraft: { create: {} },
      },
      include: { _count: { select: { clips: true } } },
    });

    return Response.json(
      { project: serializeProjectSummary(project) },
      { status: 201 },
    );
  } catch (error) {
    await rm(projectDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    );
    return apiError(error);
  }
}
