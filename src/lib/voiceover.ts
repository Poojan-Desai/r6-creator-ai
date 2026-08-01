import type {
  VoiceoverFact,
  VoiceoverScriptRevision,
  VoiceoverTargetType,
  VoiceoverTone,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
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
  takes: [];
};

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
    takes: [],
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

export function parseVoiceoverGenerateInput(input: unknown) {
  return voiceoverGenerateSchema.parse(input);
}

export type { VoiceoverPackage, VoiceoverTarget, VoiceoverToneValue };
