import type {
  LongFormTimelineRevision,
  StudioMediaAsset,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { longFormPlanSchema } from "@/lib/long-form-productions";
import {
  createLongFormTimelineFromPlan,
  longFormTimelineDocumentSchema,
  normalizeLongFormTimeline,
  rebalanceLongFormTimeline,
  type LongFormTimelineDocument,
} from "@/lib/long-form-timeline-document";

const saveTimelineSchema = z
  .object({
    document: longFormTimelineDocumentSchema,
    reason: z.string().trim().min(1).max(500).default("Timeline autosave"),
  })
  .strict();

const rebalanceSchema = z
  .object({
    targetDurationSeconds: z.number().finite().min(300).max(14_400),
  })
  .strict();

export type LongFormTimelineRevisionDto = {
  id: string;
  version: number;
  reason: string;
  document: LongFormTimelineDocument;
  createdAt: string;
};

export type LongFormMediaAssetDto = {
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

export type LongFormTimelineState = {
  available: boolean;
  message: string;
  currentPlanVersion: number;
  timelineId: string | null;
  currentVersion: number;
  currentRevision: LongFormTimelineRevisionDto | null;
  revisions: LongFormTimelineRevisionDto[];
  mediaAssets: LongFormMediaAssetDto[];
};

function parseDocument(value: string) {
  try {
    return longFormTimelineDocumentSchema.parse(JSON.parse(value) as unknown);
  } catch {
    throw new AppError(
      "A saved long-form timeline revision is invalid. Source recordings remain safe.",
      500,
      "LONG_FORM_TIMELINE_REVISION_INVALID",
    );
  }
}

function serializeRevision(
  revision: LongFormTimelineRevision,
): LongFormTimelineRevisionDto {
  return {
    id: revision.id,
    version: revision.version,
    reason: revision.reason,
    document: parseDocument(revision.documentJson),
    createdAt: revision.createdAt.toISOString(),
  };
}

function serializeMediaAsset(asset: StudioMediaAsset): LongFormMediaAssetDto {
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

export async function getLongFormTimelineState(
  studioProjectId: string,
): Promise<LongFormTimelineState> {
  const project = await db.studioProject.findUnique({
    where: { id: studioProjectId },
    include: {
      longFormProduction: {
        include: {
          timeline: {
            include: {
              revisions: { orderBy: { version: "desc" }, take: 100 },
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
  const production = project.longFormProduction;
  const timeline = production?.timeline;
  const revisions = timeline?.revisions.map(serializeRevision) ?? [];
  return {
    available: Boolean(production?.currentVersion),
    message: production?.currentVersion
      ? timeline
        ? "The non-destructive long-form timeline is saved locally."
        : "Create the first timeline from the current long-form plan."
      : "Generate a long-form plan before opening the editor.",
    currentPlanVersion: production?.currentVersion ?? 0,
    timelineId: timeline?.id ?? null,
    currentVersion: timeline?.currentVersion ?? 0,
    currentRevision: revisions[0] ?? null,
    revisions,
    mediaAssets: project.mediaAssets.map(serializeMediaAsset),
  };
}

export async function initializeLongFormTimeline(studioProjectId: string) {
  const production = await db.longFormProduction.findUnique({
    where: { studioProjectId },
    include: {
      timeline: {
        include: {
          revisions: { orderBy: { version: "desc" }, take: 1 },
        },
      },
      revisions: { orderBy: { version: "desc" }, take: 1 },
      studioProject: {
        include: {
          inputs: {
            where: {
              kind: { in: ["PRIMARY_RECORDING", "ADDITIONAL_RECORDING"] },
            },
            orderBy: { sortOrder: "asc" },
            include: { videoProject: true },
          },
        },
      },
    },
  });
  if (!production?.revisions[0]) {
    throw new AppError(
      "Generate a long-form plan before creating an edit.",
      409,
      "LONG_FORM_PRODUCTION_REQUIRED",
    );
  }
  if (production.timeline) return getLongFormTimelineState(studioProjectId);
  const plan = longFormPlanSchema.parse(
    JSON.parse(production.revisions[0].planJson) as unknown,
  );
  const sources = production.studioProject.inputs.flatMap((input) =>
    input.videoProject
      ? [
          {
            projectId: input.videoProject.id,
            name: input.videoProject.name,
            durationSeconds: input.videoProject.durationSeconds,
          },
        ]
      : [],
  );
  if (sources.length === 0) {
    throw new AppError(
      "A real screen recording is required for a long-form timeline.",
      409,
      "LONG_FORM_TIMELINE_SOURCE_REQUIRED",
    );
  }
  const document = createLongFormTimelineFromPlan({
    plan,
    sources,
    sourcePlanRevisionId: production.revisions[0].id,
    sourcePlanVersion: production.revisions[0].version,
  });
  await validateLongFormTimelineOwnership(studioProjectId, document);
  await db.longFormTimeline.create({
    data: {
      productionId: production.id,
      currentVersion: 1,
      revisions: {
        create: {
          version: 1,
          reason: "Initial timeline from long-form plan",
          documentJson: JSON.stringify(document),
          renderSpecJson: "{}",
        },
      },
    },
  });
  return getLongFormTimelineState(studioProjectId);
}

async function validateLongFormTimelineOwnership(
  studioProjectId: string,
  document: LongFormTimelineDocument,
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
  if (
    document.sources.length !== sources.size ||
    document.sources.some((source) => {
      const owned = sources.get(source.projectId);
      return (
        !owned ||
        Math.abs(owned.durationSeconds - source.durationSeconds) > 0.01
      );
    })
  ) {
    throw new AppError(
      "The timeline source list does not match this unified project.",
      400,
      "LONG_FORM_TIMELINE_SOURCE_NOT_OWNED",
    );
  }
  for (const item of document.items) {
    if (item.kind === "SOURCE_VIDEO") {
      const source = item.sourceProjectId
        ? sources.get(item.sourceProjectId)
        : null;
      if (!source) {
        throw new AppError(
          "A timeline item refers to a recording outside this unified project.",
          400,
          "LONG_FORM_TIMELINE_SOURCE_NOT_OWNED",
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
          "LONG_FORM_TIMELINE_SOURCE_RANGE_INVALID",
        );
      }
    }
    if (item.kind === "VOICEOVER" || item.kind === "MUSIC") {
      const asset = item.mediaAssetId ? assets.get(item.mediaAssetId) : null;
      const expectedKind = item.kind === "VOICEOVER" ? "VOICEOVER" : "MUSIC";
      if (!asset || asset.kind !== expectedKind || !asset.permissionConfirmed) {
        throw new AppError(
          "An audio item must use a permission-confirmed local asset from this project.",
          400,
          "LONG_FORM_TIMELINE_MEDIA_NOT_OWNED",
        );
      }
      if (item.durationSeconds > asset.durationSeconds + 0.001) {
        throw new AppError(
          `An audio item extends beyond “${asset.name}”.`,
          400,
          "LONG_FORM_TIMELINE_MEDIA_RANGE_INVALID",
        );
      }
    }
  }
}

async function saveValidatedTimeline(input: {
  studioProjectId: string;
  document: LongFormTimelineDocument;
  reason: string;
}) {
  const document = normalizeLongFormTimeline(input.document);
  await validateLongFormTimelineOwnership(input.studioProjectId, document);
  const production = await db.longFormProduction.findUnique({
    where: { studioProjectId: input.studioProjectId },
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
      "Create the first long-form timeline before saving edits.",
      409,
      "LONG_FORM_TIMELINE_REQUIRED",
    );
  }
  const serialized = JSON.stringify(document);
  if (production.timeline.revisions[0]?.documentJson === serialized) {
    return getLongFormTimelineState(input.studioProjectId);
  }
  await db.$transaction(async (transaction) => {
    const timeline = await transaction.longFormTimeline.findUniqueOrThrow({
      where: { id: production.timeline!.id },
    });
    const nextVersion = timeline.currentVersion + 1;
    await transaction.longFormTimelineRevision.create({
      data: {
        timelineId: timeline.id,
        version: nextVersion,
        reason: input.reason,
        documentJson: serialized,
        renderSpecJson: "{}",
      },
    });
    await transaction.longFormTimeline.update({
      where: { id: timeline.id },
      data: {
        currentVersion: nextVersion,
        status: "READY_FOR_PREVIEW",
      },
    });
    await transaction.longFormProduction.update({
      where: { id: production.id },
      data: { status: "READY_TO_EDIT" },
    });
  });
  return getLongFormTimelineState(input.studioProjectId);
}

export async function saveLongFormTimeline(
  studioProjectId: string,
  input: unknown,
) {
  const payload = saveTimelineSchema.parse(input);
  return saveValidatedTimeline({
    studioProjectId,
    document: payload.document,
    reason: payload.reason,
  });
}

export async function rebalanceSavedLongFormTimeline(
  studioProjectId: string,
  input: unknown,
) {
  const payload = rebalanceSchema.parse(input);
  const production = await db.longFormProduction.findUnique({
    where: { studioProjectId },
    include: {
      timeline: {
        include: {
          revisions: { orderBy: { version: "desc" }, take: 1 },
        },
      },
    },
  });
  const revision = production?.timeline?.revisions[0];
  if (!revision) {
    throw new AppError(
      "Create the first long-form timeline before fitting its duration.",
      409,
      "LONG_FORM_TIMELINE_REQUIRED",
    );
  }
  const balanced = rebalanceLongFormTimeline(
    parseDocument(revision.documentJson),
    payload.targetDurationSeconds,
  );
  const state = await saveValidatedTimeline({
    studioProjectId,
    document: balanced.document,
    reason: balanced.fitted
      ? "Automatic duration fit"
      : "Partial automatic duration fit",
  });
  return { ...balanced, state };
}
