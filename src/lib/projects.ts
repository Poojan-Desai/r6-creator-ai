import type { Clip, ContentDraft, Project } from "@prisma/client";

import { db } from "@/lib/db";

export type ClipDto = {
  id: string;
  projectId: string;
  name: string;
  status: "PROCESSING" | "READY" | "ERROR";
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  fileSizeBytes: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentDraftDto = {
  voiceoverScript: string;
  openingHook: string;
  youtubeTitle: string;
  shortFormCaption: string;
  thumbnailText: string;
  editingInstructions: string;
  updatedAt: string;
};

export type ProjectSummaryDto = {
  id: string;
  name: string;
  status: "READY" | "ERROR";
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  frameRate: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  clipCount: number;
};

export type ProjectDetailDto = ProjectSummaryDto & {
  clips: ClipDto[];
  contentDraft: ContentDraftDto;
};

type ProjectWithCount = Project & { _count: { clips: number } };

export function serializeProjectSummary(
  project: ProjectWithCount,
): ProjectSummaryDto {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    originalFilename: project.originalFilename,
    mimeType: project.mimeType,
    fileSizeBytes: Number(project.fileSizeBytes),
    durationSeconds: project.durationSeconds,
    width: project.width,
    height: project.height,
    frameRate: project.frameRate,
    errorMessage: project.errorMessage,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    clipCount: project._count.clips,
  };
}

export function serializeClip(clip: Clip): ClipDto {
  return {
    id: clip.id,
    projectId: clip.projectId,
    name: clip.name,
    status: clip.status,
    startSeconds: clip.startSeconds,
    endSeconds: clip.endSeconds,
    durationSeconds: clip.durationSeconds,
    fileSizeBytes:
      clip.fileSizeBytes === null ? null : Number(clip.fileSizeBytes),
    errorMessage: clip.errorMessage,
    createdAt: clip.createdAt.toISOString(),
    updatedAt: clip.updatedAt.toISOString(),
  };
}

export function serializeContentDraft(content: ContentDraft): ContentDraftDto {
  return {
    voiceoverScript: content.voiceoverScript,
    openingHook: content.openingHook,
    youtubeTitle: content.youtubeTitle,
    shortFormCaption: content.shortFormCaption,
    thumbnailText: content.thumbnailText,
    editingInstructions: content.editingInstructions,
    updatedAt: content.updatedAt.toISOString(),
  };
}

export function serializeProjectDetail(
  project: Project & {
    clips: Clip[];
    contentDraft: ContentDraft;
    _count: { clips: number };
  },
): ProjectDetailDto {
  return {
    ...serializeProjectSummary(project),
    clips: project.clips.map(serializeClip),
    contentDraft: serializeContentDraft(project.contentDraft),
  };
}

export async function findProjectDetail(projectId: string) {
  let project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      clips: { orderBy: { createdAt: "desc" } },
      contentDraft: true,
      _count: { select: { clips: true } },
    },
  });

  if (!project) return null;
  if (!project.contentDraft) {
    await db.contentDraft.create({ data: { projectId } });
    project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        clips: { orderBy: { createdAt: "desc" } },
        contentDraft: true,
        _count: { select: { clips: true } },
      },
    });
  }

  if (!project?.contentDraft) return null;
  return serializeProjectDetail({
    ...project,
    contentDraft: project.contentDraft,
  });
}
