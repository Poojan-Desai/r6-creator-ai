import type {
  ShortFormAspectRatio,
  ShortFormPlatform,
  ShortFormTone,
} from "@prisma/client";
import { z } from "zod";

import {
  getContentSuggestionProvider,
  OpenAIContentSuggestionProvider,
  type ContentTone,
  type ShortFormContentContext,
  type ShortFormEvidenceItem,
} from "@/lib/content-writing";
import {
  buildCloudWritingPrompt,
  CloudAiProviderError,
} from "@/lib/content-writing/openai-provider";
import { writingPackageSchema } from "@/lib/content-writing/schema";
import {
  completeCloudAiRequest,
  getCloudAiStatus,
  markCloudAiCancelled,
  markCloudAiFallback,
  reserveCloudAiRequest,
} from "@/lib/cloud-ai-usage";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { CandidateEvidenceItem } from "@/lib/short-form-candidates";

export const SHORT_FORM_PLAN_VERSION = "u3-short-form-plan-v1";

const platformSchema = z.enum([
  "YOUTUBE_SHORTS",
  "TIKTOK",
  "INSTAGRAM_REELS",
  "HORIZONTAL_CLIP",
]);
const aspectRatioSchema = z.enum([
  "VERTICAL_9_16",
  "HORIZONTAL_16_9",
  "SQUARE_1_1",
  "PORTRAIT_4_5",
]);
const toneSchema = z.enum([
  "FUNNY",
  "HIGH_ENERGY",
  "STORYTELLING",
  "EDUCATIONAL",
  "SERIOUS",
  "NATURAL",
]);

export const shortFormConfigurationSchema = z
  .object({
    candidateId: z.string().trim().min(1).max(191),
    platform: platformSchema.default("YOUTUBE_SHORTS"),
    aspectRatio: aspectRatioSchema.default("VERTICAL_9_16"),
    tone: toneSchema.default("NATURAL"),
    targetDurationSeconds: z
      .number()
      .finite()
      .min(5, "Choose at least five seconds.")
      .max(180, "Short-form targets must be three minutes or less.")
      .default(30),
    provider: z.enum(["LOCAL", "OPENAI"]).default("LOCAL"),
    cloudConsent: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.provider === "OPENAI" && !value.cloudConsent) {
      context.addIssue({
        code: "custom",
        path: ["cloudConsent"],
        message:
          "Confirm the bounded cloud data disclosure before requesting cloud AI.",
      });
    }
  });

const storySectionSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    kind: z.enum([
      "HOOK",
      "SETUP",
      "ACTION",
      "REACTION",
      "PAYOFF",
      "ENDING",
      "CALL_TO_ACTION",
    ]),
    title: z.string().trim().min(1).max(120),
    startSeconds: z.number().finite().min(0),
    endSeconds: z.number().finite().positive(),
    narration: z.string().trim().max(2_000),
    reason: z.string().trim().min(1).max(1_000),
    evidence: z.array(z.string().trim().min(1).max(500)).max(20),
  })
  .strict();

export const storyPlanSchema = z
  .object({
    version: z.literal(SHORT_FORM_PLAN_VERSION),
    premise: z.string().trim().min(1).max(1_000),
    targetDurationSeconds: z.number().finite().min(5).max(180),
    sections: z.array(storySectionSchema).min(3).max(30),
    totalPlannedSeconds: z.number().finite().min(0).max(180),
    notes: z.string().trim().max(5_000),
  })
  .strict()
  .superRefine((value, context) => {
    let previousEnd = 0;
    value.sections.forEach((section, index) => {
      if (section.endSeconds <= section.startSeconds) {
        context.addIssue({
          code: "custom",
          path: ["sections", index, "endSeconds"],
          message: "A story section must end after it starts.",
        });
      }
      if (section.startSeconds < previousEnd - 0.001) {
        context.addIssue({
          code: "custom",
          path: ["sections", index, "startSeconds"],
          message: "Story sections must stay in timeline order.",
        });
      }
      if (section.endSeconds > value.targetDurationSeconds + 0.001) {
        context.addIssue({
          code: "custom",
          path: ["sections", index, "endSeconds"],
          message: "A story section extends beyond the target duration.",
        });
      }
      previousEnd = section.endSeconds;
    });
  });

export { writingPackageSchema };

export const shortFormRevisionSchema = z
  .object({
    storyPlan: storyPlanSchema,
    writingPackage: writingPackageSchema,
    reason: z.string().trim().min(1).max(500).default("Manual edit"),
  })
  .strict();

export type ShortFormStoryPlan = z.infer<typeof storyPlanSchema>;

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function toneForProvider(tone: ShortFormTone): ContentTone {
  const values: Record<ShortFormTone, ContentTone> = {
    FUNNY: "Funny",
    HIGH_ENERGY: "High energy",
    STORYTELLING: "Storytelling",
    EDUCATIONAL: "Educational",
    SERIOUS: "Serious",
    NATURAL: "Natural",
  };
  return values[tone];
}

function configurationSnapshot(input: {
  platform: ShortFormPlatform;
  aspectRatio: ShortFormAspectRatio;
  tone: ShortFormTone;
  targetDurationSeconds: number;
  candidateId: string;
  provider: "LOCAL" | "OPENAI";
  cloudRequestId?: string | null;
  cloudFallbackCode?: string | null;
}) {
  return {
    planVersion: SHORT_FORM_PLAN_VERSION,
    candidateId: input.candidateId,
    platform: input.platform,
    aspectRatio: input.aspectRatio,
    tone: input.tone,
    targetDurationSeconds: input.targetDurationSeconds,
    requestedProvider: input.provider,
    cloudRequestId: input.cloudRequestId ?? null,
    cloudFallbackCode: input.cloudFallbackCode ?? null,
  };
}

export function createDefaultStoryPlan(input: {
  targetDurationSeconds: number;
  candidateStartSeconds: number;
  candidatePeakSeconds: number;
  candidateEndSeconds: number;
  mainEvent: string;
  evidence: string[];
}): ShortFormStoryPlan {
  const target = input.targetDurationSeconds;
  const roundTimelineSeconds = (value: number) => Math.round(value * 10) / 10;
  const hookEnd = roundTimelineSeconds(Math.min(3, target * 0.12));
  const setupEnd = roundTimelineSeconds(Math.max(hookEnd + 1, target * 0.35));
  const actionEnd = roundTimelineSeconds(Math.max(setupEnd + 1, target * 0.68));
  const payoffEnd = roundTimelineSeconds(
    Math.max(actionEnd + 1, target * 0.88),
  );
  const sourcePeakOffset =
    input.candidatePeakSeconds - input.candidateStartSeconds;
  const sourceDuration =
    input.candidateEndSeconds - input.candidateStartSeconds;
  const evidence = input.evidence.slice(0, 6);
  const sections: ShortFormStoryPlan["sections"] = [
    {
      id: "hook",
      kind: "HOOK",
      title: "Open on the question",
      startSeconds: 0,
      endSeconds: hookEnd,
      narration: "Choose one generated hook, then confirm its wording.",
      reason:
        "A short opening gives the viewer context without inventing the result.",
      evidence,
    },
    {
      id: "setup",
      kind: "SETUP",
      title: "Show only the needed setup",
      startSeconds: hookEnd,
      endSeconds: setupEnd,
      narration:
        "Preserve enough source footage to understand the visible action.",
      reason: `${sourcePeakOffset.toFixed(1)} seconds of the reviewed source range occur before the evidence peak.`,
      evidence,
    },
    {
      id: "action",
      kind: "ACTION",
      title: "Let the gameplay carry the middle",
      startSeconds: setupEnd,
      endSeconds: actionEnd,
      narration:
        "Keep game audio and confirmed creator audio around the evidence peak.",
      reason: `The reviewed source range is ${sourceDuration.toFixed(1)} seconds long and contains the selected evidence peak.`,
      evidence,
    },
    {
      id: "payoff",
      kind: "PAYOFF",
      title: "Hold on the visible payoff",
      startSeconds: actionEnd,
      endSeconds: payoffEnd,
      narration:
        "Describe only what the footage or user-confirmed context establishes.",
      reason: `The recommendation is labeled “${input.mainEvent}”; the exact outcome may still need confirmation.`,
      evidence,
    },
    {
      id: "ending",
      kind: "ENDING",
      title: "Finish without a fabricated claim",
      startSeconds: payoffEnd,
      endSeconds: target,
      narration: "Close naturally or ask the viewer what they would have done.",
      reason:
        "The ending provides a clean exit while keeping unknown gameplay facts unknown.",
      evidence,
    },
  ];
  return {
    version: SHORT_FORM_PLAN_VERSION,
    premise: `Build an original short around the reviewed ${input.mainEvent.toLowerCase()}.`,
    targetDurationSeconds: target,
    sections,
    totalPlannedSeconds: target,
    notes:
      "This plan is editable. Timing describes the output story, not confirmed source events.",
  };
}

async function loadPlanningContext(
  studioProjectId: string,
  candidateId: string,
) {
  const project = await db.studioProject.findUnique({
    where: { id: studioProjectId },
    include: {
      styleProfile: true,
      map: true,
      mapVersion: true,
      bombSite: true,
      operator: true,
      operatorVersion: true,
      candidateMoments: {
        where: { id: candidateId },
        include: {
          reviews: { orderBy: { createdAt: "desc" }, take: 1 },
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
  const candidate = project.candidateMoments[0];
  if (!candidate) {
    throw new AppError(
      "Choose a candidate from this Creator Studio project.",
      404,
      "CANDIDATE_NOT_FOUND",
    );
  }
  const review = candidate.reviews[0] ?? null;
  const startSeconds = review?.correctedStartSeconds ?? candidate.startSeconds;
  const endSeconds = review?.correctedEndSeconds ?? candidate.endSeconds;
  const videoEvidence = parseJson<CandidateEvidenceItem[]>(
    candidate.videoEvidenceJson,
    [],
  );
  const transcriptEvidence = parseJson<CandidateEvidenceItem[]>(
    candidate.transcriptEvidenceJson,
    [],
  );
  const replayEvidence = parseJson<CandidateEvidenceItem[]>(
    candidate.replayEvidenceJson,
    [],
  );
  const userConfirmedContext = project.contextUserConfirmed
    ? [
        project.map ? { label: "Map", value: project.map.name } : null,
        project.mapVersion
          ? { label: "Map version", value: project.mapVersion.versionName }
          : null,
        project.bombSite
          ? { label: "Bomb site", value: project.bombSite.displayName }
          : null,
        project.side !== "UNKNOWN"
          ? { label: "Side", value: project.side.toLowerCase() }
          : null,
        project.operator
          ? { label: "Operator", value: project.operator.displayName }
          : null,
        project.operatorVersion
          ? {
              label: "Operator version",
              value: project.operatorVersion.versionName,
            }
          : null,
        project.roundResult
          ? { label: "Round result", value: project.roundResult }
          : null,
      ].filter(
        (item): item is { label: string; value: string } => item !== null,
      )
    : [];
  const evidence: ShortFormEvidenceItem[] = [
    ...videoEvidence.map((item) => ({
      source: "VIDEO" as const,
      summary: item.summary,
      timestampSeconds: item.timestampSeconds,
      confidence: item.confidence,
    })),
    ...transcriptEvidence.map((item) => ({
      source: "TRANSCRIPT" as const,
      summary: item.summary,
      timestampSeconds: item.timestampSeconds,
      confidence: item.confidence,
    })),
    ...replayEvidence.map((item) => ({
      source: "REPLAY" as const,
      summary: item.summary,
      timestampSeconds: item.timestampSeconds,
      confidence: item.confidence,
    })),
    ...userConfirmedContext.map((item) => ({
      source: "USER_CONFIRMED" as const,
      summary: `${item.label}: ${item.value}`,
    })),
  ].slice(0, 60);
  const missingEvidence = parseJson<string[]>(
    candidate.missingEvidenceJson,
    [],
  );
  const contextUnknowns = project.contextUserConfirmed
    ? []
    : [
        "Map, operator, side, bomb site, and round result are not user-confirmed.",
      ];
  const factsSnapshot = {
    candidate: {
      id: candidate.id,
      mainEvent: candidate.mainEvent,
      category: review?.correctedCategory ?? candidate.category,
      startSeconds,
      peakSeconds: candidate.peakSeconds,
      endSeconds,
      eventConfidence: candidate.eventConfidence,
      contentPotentialScore: candidate.contentPotentialScore,
      styleSimilarity: candidate.styleSimilarity,
      explanation: candidate.explanation,
      missingEvidence,
    },
    videoObservations: videoEvidence,
    transcriptStatements: transcriptEvidence,
    verifiedReplayFacts: replayEvidence,
    userConfirmedContext,
    unknowns: [...new Set([...missingEvidence, ...contextUnknowns])],
  };
  return {
    project,
    candidate,
    review,
    startSeconds,
    endSeconds,
    evidence,
    factsSnapshot,
  };
}

export async function generateShortFormProduction(
  studioProjectId: string,
  input: unknown,
  signal?: AbortSignal,
) {
  const payload = shortFormConfigurationSchema.parse(input);
  const planning = await loadPlanningContext(
    studioProjectId,
    payload.candidateId,
  );
  const context: ShortFormContentContext = {
    projectName: planning.project.name,
    candidate: planning.factsSnapshot.candidate,
    platform: payload.platform,
    aspectRatio: payload.aspectRatio,
    targetDurationSeconds: payload.targetDurationSeconds,
    contentInstructions: planning.project.contentInstructions,
    focusAreas: parseJson<string[]>(planning.project.focusAreasJson, []),
    evidence: planning.evidence,
    transcriptExcerpt: planning.factsSnapshot.transcriptStatements
      .map((item) => item.summary)
      .join(" ")
      .slice(0, 2_000),
    userConfirmedContext: planning.factsSnapshot.userConfirmedContext,
    styleProfile: planning.project.styleProfile
      ? {
          name: planning.project.styleProfile.name,
          energyLevel: planning.project.styleProfile.energyLevel,
          humorLevel: planning.project.styleProfile.humorLevel,
          educationalLevel: planning.project.styleProfile.educationalLevel,
          storytellingLevel: planning.project.styleProfile.storytellingLevel,
          titleStyle: planning.project.styleProfile.titleStyle,
          thumbnailTextStyle: planning.project.styleProfile.thumbnailTextStyle,
          wordsToAvoid: planning.project.styleProfile.wordsToAvoid,
          preferredPhrases: planning.project.styleProfile.preferredPhrases,
          perspective: planning.project.styleProfile.perspective,
        }
      : null,
    unknowns: planning.factsSnapshot.unknowns,
  };
  const storyPlan = createDefaultStoryPlan({
    targetDurationSeconds: payload.targetDurationSeconds,
    candidateStartSeconds: planning.startSeconds,
    candidatePeakSeconds: planning.candidate.peakSeconds,
    candidateEndSeconds: planning.endSeconds,
    mainEvent: planning.candidate.mainEvent,
    evidence: planning.evidence.map((item) => item.summary),
  });
  let providerId = "local-template-v1";
  let cloudRequestId: string | null = null;
  let cloudFallbackCode: string | null = null;
  let writingPackage;
  if (payload.provider === "OPENAI") {
    const cloudProvider = new OpenAIContentSuggestionProvider();
    const prompt = buildCloudWritingPrompt(
      context,
      toneForProvider(payload.tone),
    );
    try {
      const request = await reserveCloudAiRequest(
        studioProjectId,
        `${prompt.system}\n${prompt.user}`,
      );
      cloudRequestId = request.id;
      const result = await cloudProvider.generateShortFormPackageWithUsage(
        context,
        toneForProvider(payload.tone),
        signal,
      );
      await completeCloudAiRequest(request.id, result.usage);
      writingPackage = result.writingPackage;
      providerId = cloudProvider.id;
    } catch (error) {
      const errorCode =
        error instanceof CloudAiProviderError
          ? error.code
          : error instanceof AppError
            ? error.code
            : "CLOUD_AI_FAILED";
      if (errorCode === "CANCELLED" || signal?.aborted) {
        if (cloudRequestId) await markCloudAiCancelled(cloudRequestId);
        throw new AppError(
          "Cloud AI generation was cancelled. No writing revision was saved.",
          408,
          "CLOUD_AI_CANCELLED",
        );
      }
      const fallback = getContentSuggestionProvider();
      writingPackage = await fallback.generateShortFormPackage(
        context,
        toneForProvider(payload.tone),
      );
      providerId = `${fallback.id}-cloud-fallback`;
      cloudFallbackCode = errorCode;
      if (cloudRequestId) {
        await markCloudAiFallback(cloudRequestId, errorCode, fallback.id);
      }
    }
  } else {
    const provider = getContentSuggestionProvider();
    writingPackage = await provider.generateShortFormPackage(
      context,
      toneForProvider(payload.tone),
    );
    providerId = provider.id;
  }
  const validatedWriting = writingPackageSchema.parse(writingPackage);
  const production = await db.$transaction(async (transaction) => {
    const current = await transaction.shortFormProduction.upsert({
      where: { studioProjectId },
      create: {
        studioProjectId,
        selectedCandidateId: payload.candidateId,
        platform: payload.platform,
        aspectRatio: payload.aspectRatio,
        tone: payload.tone,
        targetDurationSeconds: payload.targetDurationSeconds,
        currentVersion: 0,
      },
      update: {
        selectedCandidateId: payload.candidateId,
        platform: payload.platform,
        aspectRatio: payload.aspectRatio,
        tone: payload.tone,
        targetDurationSeconds: payload.targetDurationSeconds,
      },
    });
    const version = current.currentVersion + 1;
    await transaction.shortFormProductionRevision.create({
      data: {
        productionId: current.id,
        version,
        reason:
          payload.provider === "OPENAI" && !cloudFallbackCode
            ? version === 1
              ? "Initial opt-in cloud AI generation"
              : "Regenerated with opt-in cloud AI"
            : cloudFallbackCode
              ? "Cloud AI unavailable; generated with local fallback"
              : version === 1
                ? "Initial local generation"
                : "Regenerated locally",
        providerId,
        configurationJson: JSON.stringify(
          configurationSnapshot({
            ...payload,
            cloudRequestId,
            cloudFallbackCode,
          }),
        ),
        storyPlanJson: JSON.stringify(storyPlan),
        writingPackageJson: JSON.stringify(validatedWriting),
        factsSnapshotJson: JSON.stringify(planning.factsSnapshot),
        evidenceSnapshotJson: JSON.stringify(planning.evidence),
      },
    });
    return transaction.shortFormProduction.update({
      where: { id: current.id },
      data: {
        status: "PLANNED",
        currentVersion: version,
      },
    });
  });
  return getShortFormProductionState(production.studioProjectId);
}

export async function saveShortFormRevision(
  studioProjectId: string,
  input: unknown,
) {
  const payload = shortFormRevisionSchema.parse(input);
  const production = await db.shortFormProduction.findUnique({
    where: { studioProjectId },
    include: {
      revisions: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!production || !production.revisions[0]) {
    throw new AppError(
      "Generate the first local story and writing package before saving edits.",
      409,
      "SHORT_FORM_PRODUCTION_REQUIRED",
    );
  }
  const current = production.revisions[0];
  await db.$transaction([
    db.shortFormProductionRevision.create({
      data: {
        productionId: production.id,
        version: production.currentVersion + 1,
        reason: payload.reason,
        providerId: "manual-edit",
        configurationJson: current.configurationJson,
        storyPlanJson: JSON.stringify(payload.storyPlan),
        writingPackageJson: JSON.stringify(payload.writingPackage),
        factsSnapshotJson: current.factsSnapshotJson,
        evidenceSnapshotJson: current.evidenceSnapshotJson,
      },
    }),
    db.shortFormProduction.update({
      where: { id: production.id },
      data: {
        currentVersion: production.currentVersion + 1,
        status: "PLANNED",
      },
    }),
  ]);
  return getShortFormProductionState(studioProjectId);
}

export async function getShortFormProductionState(studioProjectId: string) {
  const project = await db.studioProject.findUnique({
    where: { id: studioProjectId },
    select: {
      id: true,
      name: true,
      shortFormProduction: {
        include: {
          selectedCandidate: {
            select: {
              id: true,
              mainEvent: true,
              startSeconds: true,
              peakSeconds: true,
              endSeconds: true,
            },
          },
          revisions: { orderBy: { version: "desc" }, take: 20 },
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
  const production = project.shortFormProduction;
  return {
    studioProjectId,
    cloudAi: await getCloudAiStatus(studioProjectId),
    production: production
      ? {
          id: production.id,
          status: production.status,
          platform: production.platform,
          aspectRatio: production.aspectRatio,
          tone: production.tone,
          targetDurationSeconds: production.targetDurationSeconds,
          currentVersion: production.currentVersion,
          selectedCandidate: production.selectedCandidate,
          currentRevision: production.revisions[0]
            ? {
                id: production.revisions[0].id,
                version: production.revisions[0].version,
                reason: production.revisions[0].reason,
                providerId: production.revisions[0].providerId,
                configuration: parseJson<Record<string, unknown>>(
                  production.revisions[0].configurationJson,
                  {},
                ),
                storyPlan: storyPlanSchema.parse(
                  parseJson<unknown>(production.revisions[0].storyPlanJson, {}),
                ),
                writingPackage: writingPackageSchema.parse(
                  parseJson<unknown>(
                    production.revisions[0].writingPackageJson,
                    {},
                  ),
                ),
                factsSnapshot: parseJson<Record<string, unknown>>(
                  production.revisions[0].factsSnapshotJson,
                  {},
                ),
                createdAt: production.revisions[0].createdAt.toISOString(),
              }
            : null,
          versions: production.revisions.map((revision) => ({
            id: revision.id,
            version: revision.version,
            reason: revision.reason,
            providerId: revision.providerId,
            createdAt: revision.createdAt.toISOString(),
          })),
          updatedAt: production.updatedAt.toISOString(),
        }
      : null,
  };
}

export type ShortFormProductionState = Awaited<
  ReturnType<typeof getShortFormProductionState>
>;
