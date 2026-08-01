import type {
  ShortFormProxyJob,
  ShortFormTimelineRevision,
  StudioMediaAsset,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { reconcileShortFormProxyJobs } from "@/lib/short-form-proxy";
import {
  createDefaultTimelineDocument,
  normalizeTimelineDocument,
  timelineDocumentSchema,
  type TimelineDocument,
} from "@/lib/timeline-document";

const saveTimelineSchema = z
  .object({
    document: timelineDocumentSchema,
    reason: z.string().trim().min(1).max(500).default("Timeline autosave"),
  })
  .strict();

export type ShortFormTimelineRevisionDto = {
  id: string;
  version: number;
  reason: string;
  document: TimelineDocument;
  createdAt: string;
};

export type StudioMediaAssetDto = {
  id: string;
  kind: StudioMediaAsset["kind"];
  name: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
  permissionConfirmed: boolean;
  createdAt: string;
};

export type ShortFormProxyJobDto = {
  id: string;
  timelineRevisionId: string;
  status: ShortFormProxyJob["status"];
  progress: number;
  stage: string;
  pipelineVersion: string;
  relativePath: string | null;
  fileSizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  errorMessage: string | null;
  cancelRequestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ShortFormTimelineState = {
  available: boolean;
  message: string;
  timelineId: string | null;
  currentVersion: number;
  currentRevision: ShortFormTimelineRevisionDto | null;
  revisions: ShortFormTimelineRevisionDto[];
  mediaAssets: StudioMediaAssetDto[];
  proxyJobs: ShortFormProxyJobDto[];
};

function parseDocument(value: string) {
  try {
    return timelineDocumentSchema.parse(JSON.parse(value) as unknown);
  } catch {
    throw new AppError(
      "A saved timeline revision is invalid. Earlier source files are safe.",
      500,
      "TIMELINE_REVISION_INVALID",
    );
  }
}

function serializeRevision(
  revision: ShortFormTimelineRevision,
): ShortFormTimelineRevisionDto {
  return {
    id: revision.id,
    version: revision.version,
    reason: revision.reason,
    document: parseDocument(revision.documentJson),
    createdAt: revision.createdAt.toISOString(),
  };
}

function serializeMediaAsset(asset: StudioMediaAsset): StudioMediaAssetDto {
  return {
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    fileSizeBytes: Number(asset.fileSizeBytes),
    durationSeconds: asset.durationSeconds,
    permissionConfirmed: asset.permissionConfirmed,
    createdAt: asset.createdAt.toISOString(),
  };
}

function serializeProxyJob(job: ShortFormProxyJob): ShortFormProxyJobDto {
  return {
    id: job.id,
    timelineRevisionId: job.timelineRevisionId,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    pipelineVersion: job.pipelineVersion,
    relativePath: job.relativePath,
    fileSizeBytes:
      job.fileSizeBytes === null ? null : Number(job.fileSizeBytes),
    width: job.width,
    height: job.height,
    durationSeconds: job.durationSeconds,
    errorMessage: job.errorMessage,
    cancelRequestedAt: job.cancelRequestedAt?.toISOString() ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export async function getShortFormTimelineState(
  studioProjectId: string,
): Promise<ShortFormTimelineState> {
  await reconcileShortFormProxyJobs();
  const project = await db.studioProject.findUnique({
    where: { id: studioProjectId },
    include: {
      shortFormProduction: {
        include: {
          timeline: {
            include: {
              revisions: { orderBy: { version: "desc" }, take: 50 },
              proxyJobs: { orderBy: { createdAt: "desc" }, take: 20 },
            },
          },
        },
      },
      mediaAssets: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) {
    throw new AppError(
      "That Creator Studio project does not exist.",
      404,
      "STUDIO_PROJECT_NOT_FOUND",
    );
  }
  const timeline = project.shortFormProduction?.timeline;
  const revisions = timeline?.revisions.map(serializeRevision) ?? [];
  return {
    available: Boolean(project.shortFormProduction),
    message: project.shortFormProduction
      ? timeline
        ? "The non-destructive timeline is saved locally."
        : "Create the first timeline from the reviewed short-form plan."
      : "Generate a short-form story and writing package before opening the editor.",
    timelineId: timeline?.id ?? null,
    currentVersion: timeline?.currentVersion ?? 0,
    currentRevision: revisions[0] ?? null,
    revisions,
    mediaAssets: project.mediaAssets.map(serializeMediaAsset),
    proxyJobs: timeline?.proxyJobs.map(serializeProxyJob) ?? [],
  };
}

export async function initializeShortFormTimeline(studioProjectId: string) {
  const production = await db.shortFormProduction.findUnique({
    where: { studioProjectId },
    include: {
      timeline: {
        include: {
          revisions: { orderBy: { version: "desc" }, take: 1 },
        },
      },
      selectedCandidate: {
        include: {
          reviews: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
      studioProject: {
        include: {
          inputs: {
            where: { kind: "PRIMARY_RECORDING" },
            include: { videoProject: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!production) {
    throw new AppError(
      "Generate a short-form story and writing package before creating an edit.",
      409,
      "SHORT_FORM_PRODUCTION_REQUIRED",
    );
  }
  if (production.timeline) return getShortFormTimelineState(studioProjectId);
  const candidate = production.selectedCandidate;
  const source = production.studioProject.inputs[0]?.videoProject;
  if (!candidate || !source) {
    throw new AppError(
      "Choose a reviewed candidate with a real source recording first.",
      409,
      "TIMELINE_SOURCE_REQUIRED",
    );
  }
  const review = candidate.reviews[0];
  const startSeconds = review?.correctedStartSeconds ?? candidate.startSeconds;
  const endSeconds = review?.correctedEndSeconds ?? candidate.endSeconds;
  if (
    startSeconds < 0 ||
    endSeconds <= startSeconds ||
    endSeconds > source.durationSeconds + 0.001
  ) {
    throw new AppError(
      "The reviewed candidate range is outside its source recording.",
      409,
      "TIMELINE_SOURCE_RANGE_INVALID",
    );
  }
  const document = createDefaultTimelineDocument({
    sourceProjectId: source.id,
    sourceStartSeconds: startSeconds,
    sourceEndSeconds: endSeconds,
    aspectRatio: production.aspectRatio,
    targetDurationSeconds: production.targetDurationSeconds,
  });
  await db.shortFormTimeline.create({
    data: {
      productionId: production.id,
      currentVersion: 1,
      revisions: {
        create: {
          version: 1,
          reason: "Initial timeline from reviewed candidate",
          documentJson: JSON.stringify(document),
          renderSpecJson: "{}",
        },
      },
    },
  });
  return getShortFormTimelineState(studioProjectId);
}

async function validateTimelineOwnership(
  studioProjectId: string,
  document: TimelineDocument,
) {
  const project = await db.studioProject.findUnique({
    where: { id: studioProjectId },
    include: {
      inputs: {
        where: {
          kind: { in: ["PRIMARY_RECORDING", "ADDITIONAL_RECORDING"] },
          videoProjectId: { not: null },
        },
        include: { videoProject: true },
      },
      mediaAssets: true,
    },
  });
  if (!project) {
    throw new AppError(
      "That Creator Studio project does not exist.",
      404,
      "STUDIO_PROJECT_NOT_FOUND",
    );
  }
  const sources = new Map(
    project.inputs
      .filter((input) => input.videoProject)
      .map((input) => [input.videoProject!.id, input.videoProject!]),
  );
  const assets = new Map(project.mediaAssets.map((asset) => [asset.id, asset]));
  for (const item of document.items) {
    if (item.kind === "SOURCE_VIDEO") {
      const source = item.sourceProjectId
        ? sources.get(item.sourceProjectId)
        : null;
      if (!source) {
        throw new AppError(
          "A timeline item refers to a recording outside this unified project.",
          400,
          "TIMELINE_SOURCE_NOT_OWNED",
        );
      }
      if (
        item.sourceStartSeconds === null ||
        item.sourceEndSeconds === null ||
        item.sourceEndSeconds > source.durationSeconds + 0.001
      ) {
        throw new AppError(
          `A source range extends beyond “${source.name}”.`,
          400,
          "TIMELINE_SOURCE_RANGE_INVALID",
        );
      }
    }
    if (item.kind === "VOICEOVER" || item.kind === "MUSIC") {
      const asset = item.mediaAssetId ? assets.get(item.mediaAssetId) : null;
      const expectedKind = item.kind === "VOICEOVER" ? "VOICEOVER" : "MUSIC";
      if (!asset || asset.kind !== expectedKind || !asset.permissionConfirmed) {
        throw new AppError(
          "An audio item must use a confirmed local asset from this project.",
          400,
          "TIMELINE_MEDIA_NOT_OWNED",
        );
      }
      if (item.durationSeconds > asset.durationSeconds + 0.001) {
        throw new AppError(
          `An audio item extends beyond “${asset.name}”.`,
          400,
          "TIMELINE_MEDIA_RANGE_INVALID",
        );
      }
    }
  }
}

export async function saveShortFormTimeline(
  studioProjectId: string,
  input: unknown,
) {
  const payload = saveTimelineSchema.parse(input);
  const document = normalizeTimelineDocument(payload.document);
  await validateTimelineOwnership(studioProjectId, document);
  const production = await db.shortFormProduction.findUnique({
    where: { studioProjectId },
    include: {
      timeline: {
        include: {
          revisions: { orderBy: { version: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!production?.timeline) {
    throw new AppError(
      "Create the first timeline before saving edits.",
      409,
      "TIMELINE_REQUIRED",
    );
  }
  const serialized = JSON.stringify(document);
  const latest = production.timeline.revisions[0];
  if (latest?.documentJson === serialized) {
    return getShortFormTimelineState(studioProjectId);
  }
  await db.$transaction(async (transaction) => {
    const timeline = await transaction.shortFormTimeline.findUniqueOrThrow({
      where: { id: production.timeline!.id },
    });
    const nextVersion = timeline.currentVersion + 1;
    await transaction.shortFormTimelineRevision.create({
      data: {
        timelineId: timeline.id,
        version: nextVersion,
        reason: payload.reason,
        documentJson: serialized,
        renderSpecJson: "{}",
      },
    });
    await transaction.shortFormTimeline.update({
      where: { id: timeline.id },
      data: {
        currentVersion: nextVersion,
        status: "READY_FOR_PREVIEW",
      },
    });
  });
  return getShortFormTimelineState(studioProjectId);
}
