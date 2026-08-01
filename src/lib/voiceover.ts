import type {
  StudioMediaAsset,
  VoiceoverFact,
  VoiceoverJob,
  VoiceoverScriptRevision,
  VoiceoverTake,
  VoiceoverCaptionSegment,
  VoiceoverTargetType,
  VoiceoverTone,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { resolveDataPath } from "@/lib/data-paths";
import { AppError } from "@/lib/errors";
import { type CandidateEvidenceItem } from "@/lib/short-form-candidates";
import { getVoiceoverScriptProvider } from "@/lib/voiceover/index";
import {
  type VoiceoverFactInput,
  type VoiceoverPackage,
  type VoiceoverTarget,
  type VoiceoverToneValue,
  voiceoverGenerateSchema,
  voiceoverPackageSchema,
  voiceoverRevisionSchema,
} from "@/lib/voiceover/types";
import { longFormTimelineDocumentSchema } from "@/lib/long-form-timeline-document";
import { timelineDocumentSchema } from "@/lib/timeline-document";
import { unlink } from "node:fs/promises";

const factUpdateSchema = z
  .object({
    correction: z.string().trim().min(1).max(2_000).nullable(),
    userConfirmed: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.userConfirmed && !value.correction) {
      context.addIssue({
        code: "custom",
        path: ["correction"],
        message: "Enter the fact you are confirming or correcting.",
      });
    }
  });

type VoiceoverFactDto = {
  id: string;
  category: VoiceoverFact["category"];
  summary: string;
  effectiveSummary: string;
  timestampSeconds: number | null;
  confidence: number | null;
  correction: string | null;
  userConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
};

type VoiceoverScriptRevisionDto = {
  id: string;
  version: number;
  reason: string;
  providerId: string;
  providerVersion: string;
  targetRevisionId: string | null;
  package: VoiceoverPackage;
  createdAt: string;
};

export type VoiceoverTakeDto = {
  id: string;
  name: string;
  scriptSectionKey: string | null;
  status: VoiceoverTake["status"];
  isActive: boolean;
  trimStartSeconds: number;
  trimEndSeconds: number | null;
  normalize: boolean;
  noiseReduction: boolean;
  gainDb: number;
  alignmentStartSeconds: number;
  errorMessage: string | null;
  sourceAsset: VoiceoverAssetDto;
  processedAsset: VoiceoverAssetDto | null;
  jobs: VoiceoverJobDto[];
  captions: VoiceoverCaptionDto[];
  createdAt: string;
  updatedAt: string;
};

type VoiceoverAssetDto = {
  id: string;
  name: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
};

type VoiceoverJobDto = {
  id: string;
  kind: VoiceoverJob["kind"];
  status: VoiceoverJob["status"];
  progress: number;
  stage: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type VoiceoverCaptionDto = {
  id: string;
  segmentOrder: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
  originalText: string;
};

export type VoiceoverState = {
  available: boolean;
  message: string;
  production: {
    id: string;
    targetType: VoiceoverTargetType;
    tone: VoiceoverTone;
    currentScriptVersion: number;
  } | null;
  facts: VoiceoverFactDto[];
  currentRevision: VoiceoverScriptRevisionDto | null;
  revisions: VoiceoverScriptRevisionDto[];
  takes: VoiceoverTakeDto[];
};

const takeUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    scriptSectionKey: z.string().trim().max(120).nullable().optional(),
    isActive: z.boolean().optional(),
    alignmentStartSeconds: z.number().finite().min(0).max(14_400).optional(),
  })
  .strict();

function parseEvidence(value: string): CandidateEvidenceItem[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CandidateEvidenceItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as CandidateEvidenceItem).summary === "string" &&
        typeof (item as CandidateEvidenceItem).timestampSeconds === "number" &&
        typeof (item as CandidateEvidenceItem).confidence === "number",
    );
  } catch {
    return [];
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function serializeFact(fact: VoiceoverFact): VoiceoverFactDto {
  return {
    id: fact.id,
    category: fact.category,
    summary: fact.summary,
    effectiveSummary:
      fact.userConfirmed && fact.correction ? fact.correction : fact.summary,
    timestampSeconds: fact.timestampSeconds,
    confidence: fact.confidence,
    correction: fact.correction,
    userConfirmed: fact.userConfirmed,
    createdAt: fact.createdAt.toISOString(),
    updatedAt: fact.updatedAt.toISOString(),
  };
}

function serializeRevision(
  revision: VoiceoverScriptRevision,
): VoiceoverScriptRevisionDto {
  return {
    id: revision.id,
    version: revision.version,
    reason: revision.reason,
    providerId: revision.providerId,
    providerVersion: revision.providerVersion,
    targetRevisionId: revision.targetRevisionId,
    package: voiceoverPackageSchema.parse(
      JSON.parse(revision.packageJson) as unknown,
    ),
    createdAt: revision.createdAt.toISOString(),
  };
}

function serializeAsset(asset: StudioMediaAsset): VoiceoverAssetDto {
  return {
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    fileSizeBytes: Number(asset.fileSizeBytes),
    durationSeconds: asset.durationSeconds,
  };
}

function serializeJob(job: VoiceoverJob): VoiceoverJobDto {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

function serializeCaption(
  caption: VoiceoverCaptionSegment,
): VoiceoverCaptionDto {
  return {
    id: caption.id,
    segmentOrder: caption.segmentOrder,
    startSeconds: caption.startSeconds,
    endSeconds: caption.endSeconds,
    text: caption.text,
    originalText: caption.originalText,
  };
}

function serializeTake(
  take: VoiceoverTake & {
    sourceAsset: StudioMediaAsset;
    processedAsset: StudioMediaAsset | null;
    jobs: VoiceoverJob[];
    captions: VoiceoverCaptionSegment[];
  },
): VoiceoverTakeDto {
  return {
    id: take.id,
    name: take.name,
    scriptSectionKey: take.scriptSectionKey,
    status: take.status,
    isActive: take.isActive,
    trimStartSeconds: take.trimStartSeconds,
    trimEndSeconds: take.trimEndSeconds,
    normalize: take.normalize,
    noiseReduction: take.noiseReduction,
    gainDb: take.gainDb,
    alignmentStartSeconds: take.alignmentStartSeconds,
    errorMessage: take.errorMessage,
    sourceAsset: serializeAsset(take.sourceAsset),
    processedAsset: take.processedAsset
      ? serializeAsset(take.processedAsset)
      : null,
    jobs: take.jobs.map(serializeJob),
    captions: take.captions.map(serializeCaption),
    createdAt: take.createdAt.toISOString(),
    updatedAt: take.updatedAt.toISOString(),
  };
}

async function findStudioContext(studioProjectId: string) {
  const project = await db.studioProject.findUnique({
    where: { id: studioProjectId },
    include: {
      map: true,
      mapVersion: true,
      bombSite: true,
      operator: true,
      operatorVersion: true,
      inputs: {
        where: { kind: "PRIMARY_RECORDING" },
        include: { videoProject: true },
        take: 1,
      },
      shortFormProduction: {
        include: {
          selectedCandidate: true,
          revisions: { orderBy: { version: "desc" }, take: 1 },
        },
      },
      longFormProduction: {
        include: {
          revisions: { orderBy: { version: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!project) {
    throw new AppError(
      "That Creator Studio project does not exist.",
      404,
      "STUDIO_PROJECT_NOT_FOUND",
    );
  }
  return project;
}

async function buildBaseFacts(
  project: Awaited<ReturnType<typeof findStudioContext>>,
): Promise<VoiceoverFactInput[]> {
  const facts: VoiceoverFactInput[] = [];
  if (project.contextUserConfirmed) {
    const confirmed = [
      project.map?.name ? `Map: ${project.map.name}` : null,
      project.mapVersion?.versionName
        ? `Map version: ${project.mapVersion.versionName}`
        : null,
      project.bombSite?.displayName
        ? `Bomb site: ${project.bombSite.displayName}`
        : null,
      project.side !== "UNKNOWN" ? `Side: ${project.side.toLowerCase()}` : null,
      project.operator?.displayName
        ? `Operator: ${project.operator.displayName}`
        : null,
      project.operatorVersion?.versionName
        ? `Operator version: ${project.operatorVersion.versionName}`
        : null,
      project.roundResult ? `Round result: ${project.roundResult}` : null,
    ].filter((value): value is string => Boolean(value));
    facts.push(
      ...confirmed.map((summary) => ({
        category: "USER_CONFIRMED_CONTEXT" as const,
        summary,
        timestampSeconds: null,
        confidence: 1,
        userConfirmed: true,
      })),
    );
  }
  const candidate = project.shortFormProduction?.selectedCandidate;
  if (candidate) {
    facts.push(
      ...parseEvidence(candidate.videoEvidenceJson)
        .slice(0, 20)
        .map((item) => ({
          category: "VIDEO_OBSERVATION" as const,
          summary: item.summary,
          timestampSeconds: item.timestampSeconds,
          confidence: item.confidence,
          userConfirmed: false,
        })),
      ...parseEvidence(candidate.replayEvidenceJson)
        .slice(0, 20)
        .map((item) => ({
          category: "VERIFIED_REPLAY_FACT" as const,
          summary: item.summary,
          timestampSeconds: item.timestampSeconds,
          confidence: item.confidence,
          userConfirmed: false,
        })),
      ...parseEvidence(candidate.transcriptEvidenceJson)
        .slice(0, 20)
        .map((item) => ({
          category: "TRANSCRIPT_STATEMENT" as const,
          summary: item.summary,
          timestampSeconds: item.timestampSeconds,
          confidence: item.confidence,
          userConfirmed: false,
        })),
      {
        category: "INFERENCE",
        summary: candidate.explanation,
        timestampSeconds: candidate.peakSeconds,
        confidence: candidate.eventConfidence,
        userConfirmed: false,
      },
      ...parseStringArray(candidate.missingEvidenceJson).map((summary) => ({
        category: "UNKNOWN" as const,
        summary,
        timestampSeconds: null,
        confidence: null,
        userConfirmed: false,
      })),
    );
  }
  const recordingId = project.inputs[0]?.videoProjectId;
  if (recordingId) {
    const transcript = await db.transcriptionJob.findFirst({
      where: { projectId: recordingId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      include: {
        segments: { orderBy: { segmentOrder: "asc" }, take: 30 },
      },
    });
    if (transcript) {
      facts.push(
        ...transcript.segments
          .filter((segment) => segment.text.trim())
          .map((segment) => ({
            category: "TRANSCRIPT_STATEMENT" as const,
            summary: `Creator transcript: “${segment.text.trim()}”`,
            timestampSeconds: segment.startSeconds,
            confidence: null,
            userConfirmed: false,
          })),
      );
    }
  }
  const longFacts = project.longFormProduction?.revisions[0]?.factsSnapshotJson;
  if (longFacts) {
    const snapshot = parseObject(longFacts);
    const unknowns = Array.isArray(snapshot.unknowns)
      ? snapshot.unknowns.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    facts.push(
      ...unknowns.map((summary) => ({
        category: "UNKNOWN" as const,
        summary,
        timestampSeconds: null,
        confidence: null,
        userConfirmed: false,
      })),
    );
  }
  if (!facts.some((fact) => fact.category === "UNKNOWN")) {
    facts.push({
      category: "UNKNOWN",
      summary:
        "Enemy count, health, weapon, rank, stakes, intention, position, communication, and outcome remain unknown unless separately confirmed.",
      timestampSeconds: null,
      confidence: null,
      userConfirmed: false,
    });
  }
  const seen = new Set<string>();
  return facts
    .filter((fact) => {
      const key = `${fact.category}:${fact.summary}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 200);
}

async function refreshBaseFacts(
  productionId: string,
  project: Awaited<ReturnType<typeof findStudioContext>>,
) {
  const facts = await buildBaseFacts(project);
  await db.$transaction([
    db.voiceoverFact.deleteMany({
      where: { productionId, sourceId: "AUTO_BASE" },
    }),
    ...facts.map((fact) =>
      db.voiceoverFact.create({
        data: {
          productionId,
          category: fact.category,
          summary: fact.summary,
          timestampSeconds: fact.timestampSeconds,
          confidence: fact.confidence,
          userConfirmed: fact.userConfirmed,
          correction: fact.userConfirmed ? fact.summary : null,
          sourceId: "AUTO_BASE",
        },
      }),
    ),
  ]);
}

async function ensureProduction(studioProjectId: string) {
  return db.voiceoverProduction.upsert({
    where: { studioProjectId },
    create: { studioProjectId },
    update: {},
  });
}

async function structureForTarget(
  project: Awaited<ReturnType<typeof findStudioContext>>,
  targetType: VoiceoverTarget,
) {
  if (targetType === "SHORT_FORM") {
    const revision = project.shortFormProduction?.revisions[0];
    if (revision) {
      const plan = parseObject(revision.storyPlanJson);
      const sections = Array.isArray(plan.sections) ? plan.sections : [];
      return {
        targetRevisionId: revision.id,
        sections: sections
          .map((item, index) => {
            const section = item as Record<string, unknown>;
            return {
              key:
                typeof section.id === "string"
                  ? section.id
                  : `section-${index + 1}`,
              title:
                typeof section.title === "string"
                  ? section.title
                  : `Section ${index + 1}`,
              direction:
                typeof section.narration === "string"
                  ? section.narration
                  : "Describe only supported evidence.",
            };
          })
          .slice(0, 100),
      };
    }
  }
  const revision = project.longFormProduction?.revisions[0];
  if (revision) {
    const plan = parseObject(revision.planJson);
    const sections = Array.isArray(plan.sections) ? plan.sections : [];
    return {
      targetRevisionId: revision.id,
      sections: sections
        .map((item, index) => {
          const section = item as Record<string, unknown>;
          return {
            key:
              typeof section.id === "string"
                ? section.id
                : `section-${index + 1}`,
            title:
              typeof section.title === "string"
                ? section.title
                : `Section ${index + 1}`,
            direction:
              typeof section.voiceoverDirection === "string"
                ? section.voiceoverDirection
                : "Describe only supported evidence.",
          };
        })
        .slice(0, 200),
    };
  }
  return {
    targetRevisionId: null,
    sections: [
      {
        key: "overview",
        title: "Overview",
        direction:
          "Review the linked source before describing a specific gameplay outcome.",
      },
    ],
  };
}

export async function getVoiceoverState(
  studioProjectId: string,
): Promise<VoiceoverState> {
  const project = await findStudioContext(studioProjectId);
  const initialProduction = await ensureProduction(studioProjectId);
  const factCount = await db.voiceoverFact.count({
    where: { productionId: initialProduction.id },
  });
  if (factCount === 0) {
    await refreshBaseFacts(initialProduction.id, project);
  }
  const production = await db.voiceoverProduction.findUnique({
    where: { studioProjectId },
    include: {
      facts: { orderBy: [{ category: "asc" }, { createdAt: "asc" }] },
      scriptRevisions: { orderBy: { version: "desc" }, take: 50 },
      takes: {
        orderBy: { createdAt: "desc" },
        include: {
          sourceAsset: true,
          processedAsset: true,
          jobs: { orderBy: { createdAt: "desc" }, take: 20 },
          captions: { orderBy: { segmentOrder: "asc" } },
        },
      },
    },
  });
  if (!production)
    throw new AppError(
      "The Voiceover Studio could not be initialized.",
      500,
      "VOICEOVER_INITIALIZATION_FAILED",
    );
  const revisions = production.scriptRevisions.map(serializeRevision);
  return {
    available: true,
    message: revisions.length
      ? "Voiceover scripts and facts are saved locally."
      : "Review the facts, then generate the first local voiceover script.",
    production: {
      id: production.id,
      targetType: production.targetType,
      tone: production.tone,
      currentScriptVersion: production.currentScriptVersion,
    },
    facts: production.facts.map(serializeFact),
    currentRevision: revisions[0] ?? null,
    revisions,
    takes: production.takes.map(serializeTake),
  };
}

export async function generateVoiceoverScript(
  studioProjectId: string,
  input: unknown,
) {
  const settings = voiceoverGenerateSchema.parse(input);
  const project = await findStudioContext(studioProjectId);
  const production = await ensureProduction(studioProjectId);
  await refreshBaseFacts(production.id, project);
  const facts = await db.voiceoverFact.findMany({
    where: { productionId: production.id },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });
  const structure = await structureForTarget(project, settings.targetType);
  const provider = getVoiceoverScriptProvider();
  const packageValue = await provider.generate({
    projectName: project.name,
    targetType: settings.targetType,
    tone: settings.tone,
    facts: facts.map((fact) => ({
      category: fact.category,
      summary:
        fact.userConfirmed && fact.correction ? fact.correction : fact.summary,
      timestampSeconds: fact.timestampSeconds,
      confidence: fact.confidence,
      userConfirmed: fact.userConfirmed,
    })),
    structure: structure.sections,
  });
  await db.$transaction(async (transaction) => {
    const current = await transaction.voiceoverProduction.findUniqueOrThrow({
      where: { id: production.id },
    });
    const version = current.currentScriptVersion + 1;
    await transaction.voiceoverScriptRevision.create({
      data: {
        productionId: production.id,
        version,
        reason:
          version === 1 ? "Initial local script" : "Regenerated local script",
        providerId: provider.id,
        providerVersion: provider.version,
        targetRevisionId: structure.targetRevisionId,
        packageJson: JSON.stringify(packageValue),
        factsSnapshotJson: JSON.stringify(facts.map(serializeFact)),
      },
    });
    await transaction.voiceoverProduction.update({
      where: { id: production.id },
      data: {
        targetType: settings.targetType,
        tone: settings.tone,
        currentScriptVersion: version,
      },
    });
  });
  return getVoiceoverState(studioProjectId);
}

export async function saveVoiceoverRevision(
  studioProjectId: string,
  input: unknown,
) {
  const parsed = voiceoverRevisionSchema.parse(input);
  const production = await db.voiceoverProduction.findUnique({
    where: { studioProjectId },
    include: { facts: true, scriptRevisions: { orderBy: { version: "desc" } } },
  });
  if (!production || production.scriptRevisions.length === 0) {
    throw new AppError(
      "Generate a local script before saving an edit.",
      409,
      "VOICEOVER_SCRIPT_REQUIRED",
    );
  }
  const latest = production.scriptRevisions[0]!;
  await db.$transaction([
    db.voiceoverScriptRevision.create({
      data: {
        productionId: production.id,
        version: production.currentScriptVersion + 1,
        reason: parsed.reason,
        providerId: latest.providerId,
        providerVersion: latest.providerVersion,
        targetRevisionId: latest.targetRevisionId,
        packageJson: JSON.stringify(parsed.package),
        factsSnapshotJson: JSON.stringify(production.facts.map(serializeFact)),
      },
    }),
    db.voiceoverProduction.update({
      where: { id: production.id },
      data: { currentScriptVersion: { increment: 1 } },
    }),
  ]);
  return getVoiceoverState(studioProjectId);
}

export async function updateVoiceoverFact(
  studioProjectId: string,
  factId: string,
  input: unknown,
) {
  const parsed = factUpdateSchema.parse(input);
  const fact = await db.voiceoverFact.findFirst({
    where: { id: factId, production: { studioProjectId } },
  });
  if (!fact) {
    throw new AppError(
      "That Facts Review item does not exist.",
      404,
      "VOICEOVER_FACT_NOT_FOUND",
    );
  }
  await db.voiceoverFact.update({
    where: { id: fact.id },
    data: {
      ...parsed,
      category: parsed.userConfirmed ? "USER_CONFIRMED_CONTEXT" : fact.category,
      sourceId: parsed.userConfirmed ? "USER_CORRECTION" : fact.sourceId,
    },
  });
  return getVoiceoverState(studioProjectId);
}

export async function getOrCreateVoiceoverProduction(studioProjectId: string) {
  await findStudioContext(studioProjectId);
  return ensureProduction(studioProjectId);
}

export async function createVoiceoverTake(input: {
  studioProjectId: string;
  sourceAssetId: string;
  name: string;
  scriptSectionKey: string | null;
}) {
  const production = await getOrCreateVoiceoverProduction(
    input.studioProjectId,
  );
  const asset = await db.studioMediaAsset.findFirst({
    where: {
      id: input.sourceAssetId,
      studioProjectId: input.studioProjectId,
      kind: "VOICEOVER",
      permissionConfirmed: true,
    },
  });
  if (!asset) {
    throw new AppError(
      "That narration audio is not available to this project.",
      404,
      "VOICEOVER_ASSET_NOT_FOUND",
    );
  }
  await db.voiceoverTake.create({
    data: {
      productionId: production.id,
      sourceAssetId: asset.id,
      name: input.name,
      scriptSectionKey: input.scriptSectionKey,
      trimEndSeconds: asset.durationSeconds,
    },
  });
  return getVoiceoverState(input.studioProjectId);
}

export async function updateVoiceoverTake(
  studioProjectId: string,
  takeId: string,
  input: unknown,
) {
  const parsed = takeUpdateSchema.parse(input);
  const take = await db.voiceoverTake.findFirst({
    where: { id: takeId, production: { studioProjectId } },
  });
  if (!take) {
    throw new AppError(
      "That narration take does not exist.",
      404,
      "VOICEOVER_TAKE_NOT_FOUND",
    );
  }
  await db.$transaction(async (transaction) => {
    if (
      parsed.isActive ||
      (take.isActive &&
        parsed.scriptSectionKey !== undefined &&
        parsed.scriptSectionKey !== take.scriptSectionKey)
    ) {
      await transaction.voiceoverTake.updateMany({
        where: {
          productionId: take.productionId,
          scriptSectionKey:
            parsed.scriptSectionKey === undefined
              ? take.scriptSectionKey
              : parsed.scriptSectionKey,
          isActive: true,
        },
        data: { isActive: false },
      });
    }
    await transaction.voiceoverTake.update({
      where: { id: take.id },
      data: parsed,
    });
  });
  return getVoiceoverState(studioProjectId);
}

function currentTimelineUsesAsset(
  documentJson: string | undefined,
  assetIds: Set<string>,
  kind: "short" | "long",
) {
  if (!documentJson) return false;
  const document =
    kind === "short"
      ? timelineDocumentSchema.parse(JSON.parse(documentJson) as unknown)
      : longFormTimelineDocumentSchema.parse(
          JSON.parse(documentJson) as unknown,
        );
  return document.items.some(
    (item) => item.mediaAssetId && assetIds.has(item.mediaAssetId),
  );
}

export async function deleteVoiceoverTake(
  studioProjectId: string,
  takeId: string,
) {
  const take = await db.voiceoverTake.findFirst({
    where: { id: takeId, production: { studioProjectId } },
    include: {
      sourceAsset: true,
      processedAsset: true,
      production: {
        include: {
          studioProject: {
            include: {
              shortFormProduction: {
                include: {
                  timeline: {
                    include: {
                      revisions: { orderBy: { version: "desc" }, take: 1 },
                    },
                  },
                },
              },
              longFormProduction: {
                include: {
                  timeline: {
                    include: {
                      revisions: { orderBy: { version: "desc" }, take: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!take) {
    throw new AppError(
      "That narration take does not exist.",
      404,
      "VOICEOVER_TAKE_NOT_FOUND",
    );
  }
  const assetIds = new Set(
    [take.sourceAssetId, take.processedAssetId].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const studio = take.production.studioProject;
  if (
    currentTimelineUsesAsset(
      studio.shortFormProduction?.timeline?.revisions[0]?.documentJson,
      assetIds,
      "short",
    ) ||
    currentTimelineUsesAsset(
      studio.longFormProduction?.timeline?.revisions[0]?.documentJson,
      assetIds,
      "long",
    )
  ) {
    throw new AppError(
      "Remove this narration take from the current timeline before deleting it.",
      409,
      "VOICEOVER_TAKE_IN_USE",
    );
  }
  const assets = [take.sourceAsset, take.processedAsset].filter(
    (asset): asset is StudioMediaAsset => Boolean(asset),
  );
  await db.$transaction(async (transaction) => {
    await transaction.voiceoverTake.delete({ where: { id: take.id } });
    await transaction.studioMediaAsset.deleteMany({
      where: { id: { in: assets.map((asset) => asset.id) } },
    });
  });
  await Promise.all(
    assets.map((asset) =>
      unlink(resolveDataPath(asset.relativePath)).catch(() => undefined),
    ),
  );
  return getVoiceoverState(studioProjectId);
}

export function parseVoiceoverGenerateInput(input: unknown) {
  return voiceoverGenerateSchema.parse(input);
}

export type { VoiceoverPackage, VoiceoverTarget, VoiceoverToneValue };
