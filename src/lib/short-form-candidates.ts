import type {
  CandidateReviewDecision,
  DetectorSourceSignal,
  GroundTruthCategory,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const CANDIDATE_FUSION_VERSION = "u3-candidate-fusion-v1";
export const CANDIDATE_SCORE_VERSION = "u3-transparent-score-v1";

const POSITIVE_CATEGORIES = new Set<GroundTruthCategory>([
  "KILL",
  "DEATH",
  "MULTI_KILL",
  "ROUND_WIN",
  "ROUND_LOSS",
  "MATCH_ENDING",
  "POSSIBLE_CLUTCH",
  "DEFUSER_PLANT",
  "DEFUSER_DISABLE",
  "HIGH_ACTION_GAMEPLAY",
  "LOUD_CREATOR_REACTION",
  "FUNNY_CONVERSATION",
  "RAGE_OR_FRUSTRATION",
  "FAIL_OR_MISTAKE",
  "EDUCATIONAL_EXPLANATION",
  "OTHER_INTERESTING",
]);

const CATEGORY_PRIORITY: Partial<Record<GroundTruthCategory, number>> = {
  POSSIBLE_CLUTCH: 1,
  MULTI_KILL: 2,
  ROUND_WIN: 3,
  ROUND_LOSS: 4,
  MATCH_ENDING: 5,
  DEFUSER_PLANT: 6,
  DEFUSER_DISABLE: 7,
  KILL: 8,
  DEATH: 9,
  FUNNY_CONVERSATION: 10,
  RAGE_OR_FRUSTRATION: 11,
  EDUCATIONAL_EXPLANATION: 12,
  FAIL_OR_MISTAKE: 13,
  LOUD_CREATOR_REACTION: 14,
  HIGH_ACTION_GAMEPLAY: 15,
  OTHER_INTERESTING: 16,
};

const CATEGORY_LABELS: Record<GroundTruthCategory, string> = {
  KILL: "Kill candidate",
  DEATH: "Death candidate",
  MULTI_KILL: "Multi-event elimination candidate",
  ROUND_WIN: "Round-win candidate",
  ROUND_LOSS: "Round-loss candidate",
  MATCH_ENDING: "Match-ending candidate",
  POSSIBLE_CLUTCH: "Possible clutch",
  DEFUSER_PLANT: "Defuser-plant candidate",
  DEFUSER_DISABLE: "Defuser-disable candidate",
  HIGH_ACTION_GAMEPLAY: "High-action gameplay candidate",
  LOUD_CREATOR_REACTION: "Creator-reaction candidate",
  FUNNY_CONVERSATION: "Funny-conversation candidate",
  RAGE_OR_FRUSTRATION: "Frustration or rage candidate",
  FAIL_OR_MISTAKE: "Fail or mistake candidate",
  EDUCATIONAL_EXPLANATION: "Educational-explanation candidate",
  QUIET_OR_LOW_INTEREST: "Quiet or low-interest interval",
  MENU: "Menu candidate",
  SCOREBOARD: "Scoreboard candidate",
  REPLAY: "Replay-screen candidate",
  SPECTATOR_SCREEN: "Spectator-screen candidate",
  LOADING_SCREEN: "Loading-screen candidate",
  OTHER_INTERESTING: "Evidence-supported candidate",
  OTHER_UNINTERESTING: "Uninteresting-section candidate",
};

const candidateReviewSchema = z
  .object({
    decision: z.enum(["USEFUL", "NOT_USEFUL", "WRONG_EVENT"]),
    correctedStartSeconds: z.number().finite().min(0).nullable().optional(),
    correctedEndSeconds: z.number().finite().positive().nullable().optional(),
    correctedCategory: z
      .enum([
        "KILL",
        "DEATH",
        "MULTI_KILL",
        "ROUND_WIN",
        "ROUND_LOSS",
        "MATCH_ENDING",
        "POSSIBLE_CLUTCH",
        "DEFUSER_PLANT",
        "DEFUSER_DISABLE",
        "HIGH_ACTION_GAMEPLAY",
        "LOUD_CREATOR_REACTION",
        "FUNNY_CONVERSATION",
        "RAGE_OR_FRUSTRATION",
        "FAIL_OR_MISTAKE",
        "EDUCATIONAL_EXPLANATION",
        "QUIET_OR_LOW_INTEREST",
        "MENU",
        "SCOREBOARD",
        "REPLAY",
        "SPECTATOR_SCREEN",
        "LOADING_SCREEN",
        "OTHER_INTERESTING",
        "OTHER_UNINTERESTING",
      ])
      .nullable()
      .optional(),
    note: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict();

export type CandidateSourceEvent = {
  id: string;
  eventType: string;
  category: GroundTruthCategory | null;
  startSeconds: number;
  peakSeconds: number;
  endSeconds: number;
  confidence: number;
  sourceSignal: DetectorSourceSignal;
  detectorId: string;
  detectorVersion: string;
  supportingEvidence: string[];
  conflictingEvidence: string[];
  evidence: Array<{
    kind: "SUPPORTING" | "CONFLICTING";
    sourceSignal: DetectorSourceSignal;
    summary: string;
    timestampSeconds: number | null;
  }>;
};

export type CandidateStyleInput = {
  id: string;
  preferredVideoLengthSeconds: number | null;
  energyLevel: number;
  setupAmount: number;
  reactionEmphasis: number;
  storytellingLevel: number;
};

export type CandidateEvidenceItem = {
  source: string;
  summary: string;
  timestampSeconds: number;
  confidence: number;
  detectorId?: string;
  detectorVersion?: string;
};

export type CandidateDraft = {
  category: GroundTruthCategory;
  mainEvent: string;
  alternativeCategories: GroundTruthCategory[];
  startSeconds: number;
  peakSeconds: number;
  endSeconds: number;
  eventConfidence: number;
  contentPotentialScore: number;
  styleSimilarity: number | null;
  scoreBreakdown: Record<string, unknown>;
  videoEvidence: CandidateEvidenceItem[];
  transcriptEvidence: CandidateEvidenceItem[];
  replayEvidence: CandidateEvidenceItem[];
  explanation: string;
  missingEvidence: string[];
  detectorVersions: Record<string, string>;
  sourceEventIds: string[];
};

type CandidateGroup = {
  firstPeak: number;
  lastPeak: number;
  seeds: CandidateSourceEvent[];
};

function parseArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function rounded(value: number, places = 3) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function isTranscriptSignal(signal: DetectorSourceSignal) {
  return signal === "TRANSCRIPT";
}

function isSeedEvent(event: CandidateSourceEvent) {
  if (event.category && POSITIVE_CATEGORIES.has(event.category)) return true;
  return /(ACTION_SPIKE|SUSTAINED_HIGH_ACTION|AUDIO_PEAK|SUSTAINED_LOUD|VOCAL_REACTION|STORY_PAYOFF|POSSIBLE_GAMEPLAY_INTERRUPTION)/.test(
    event.eventType,
  );
}

function eventCategory(event: CandidateSourceEvent): GroundTruthCategory {
  if (event.category && POSITIVE_CATEGORIES.has(event.category)) {
    if (
      isTranscriptSignal(event.sourceSignal) &&
      [
        "KILL",
        "DEATH",
        "MULTI_KILL",
        "ROUND_WIN",
        "ROUND_LOSS",
        "MATCH_ENDING",
        "POSSIBLE_CLUTCH",
        "DEFUSER_PLANT",
        "DEFUSER_DISABLE",
      ].includes(event.category)
    ) {
      return "OTHER_INTERESTING";
    }
    return event.category;
  }
  if (
    /(VOCAL_REACTION|CREATOR_AUDIO|CREATOR_AND_GAME_AUDIO)/.test(
      event.eventType,
    )
  ) {
    return "LOUD_CREATOR_REACTION";
  }
  if (/ACTION|GAME_AUDIO_PEAK/.test(event.eventType)) {
    return "HIGH_ACTION_GAMEPLAY";
  }
  return "OTHER_INTERESTING";
}

function chooseCategory(events: CandidateSourceEvent[]) {
  const categories = events.map(eventCategory);
  return [...new Set(categories)].sort(
    (left, right) =>
      (CATEGORY_PRIORITY[left] ?? 999) - (CATEGORY_PRIORITY[right] ?? 999),
  );
}

function sourceWeight(signal: DetectorSourceSignal) {
  if (signal === "COMBINED_EVIDENCE" || signal === "IMPORTED_TELEMETRY")
    return 1;
  if (signal === "CREATOR_MICROPHONE") return 0.95;
  if (
    signal === "VIDEO" ||
    signal === "MOTION" ||
    signal === "FRAME_DIFFERENCE"
  )
    return 0.9;
  if (isTranscriptSignal(signal)) return 0.7;
  return 0.8;
}

function confidenceScore(events: CandidateSourceEvent[]) {
  const weighted = events
    .map((event) => event.confidence * sourceWeight(event.sourceSignal))
    .sort((left, right) => right - left)
    .slice(0, 5);
  const evidenceStrength =
    weighted.reduce((total, value) => total + value, 0) /
    Math.max(1, weighted.length);
  const sourceCount = new Set(events.map((event) => event.sourceSignal)).size;
  const sourceDiversity = Math.min(1, sourceCount / 3);
  const corroboration = Math.min(1, Math.max(0, events.length - 1) / 4);
  const value = clamp(
    evidenceStrength * 0.7 + sourceDiversity * 0.2 + corroboration * 0.1,
    0,
    1,
  );
  return {
    value: rounded(value),
    evidenceStrength: rounded(evidenceStrength),
    sourceDiversity: rounded(sourceDiversity),
    corroboration: rounded(corroboration),
    formula:
      "evidence strength × 0.70 + source diversity × 0.20 + corroboration × 0.10",
  };
}

function contentPotentialScore(
  events: CandidateSourceEvent[],
  eventConfidence: number,
  startSeconds: number,
  peakSeconds: number,
  endSeconds: number,
) {
  const signals = new Set(events.map((event) => event.sourceSignal));
  const hasAction = events.some(
    (event) =>
      event.category === "HIGH_ACTION_GAMEPLAY" ||
      /ACTION|GAME_AUDIO_PEAK/.test(event.eventType),
  );
  const hasReaction = events.some(
    (event) =>
      event.category === "LOUD_CREATOR_REACTION" ||
      /VOCAL_REACTION|CREATOR_AUDIO/.test(event.eventType),
  );
  const hasTranscript = events.some((event) =>
    isTranscriptSignal(event.sourceSignal),
  );
  const quietConflicts = events.filter(
    (event) =>
      event.category === "QUIET_OR_LOW_INTEREST" ||
      /SILENCE|LOW_ACTION|STATIC/.test(event.eventType),
  ).length;
  const conflictCount = events.reduce(
    (total, event) =>
      total +
      event.conflictingEvidence.length +
      event.evidence.filter((item) => item.kind === "CONFLICTING").length,
    0,
  );
  const duration = endSeconds - startSeconds;
  const setupSeconds = peakSeconds - startSeconds;
  const confidencePoints = eventConfidence * 30;
  const diversityPoints = Math.min(20, signals.size * 5);
  const actionPoints = hasAction ? 15 : 0;
  const reactionPoints = hasReaction ? 15 : 0;
  const transcriptPoints = hasTranscript ? 10 : 0;
  const structurePoints =
    duration >= 8 && duration <= 60 && setupSeconds >= 1 && setupSeconds <= 20
      ? 10
      : 4;
  const quietPenalty = Math.min(15, quietConflicts * 3);
  const conflictPenalty = Math.min(10, conflictCount * 2);
  const total = clamp(
    confidencePoints +
      diversityPoints +
      actionPoints +
      reactionPoints +
      transcriptPoints +
      structurePoints -
      quietPenalty -
      conflictPenalty,
    0,
    100,
  );
  return {
    total: rounded(total, 1),
    confidencePoints: rounded(confidencePoints, 1),
    diversityPoints,
    actionPoints,
    reactionPoints,
    transcriptPoints,
    structurePoints,
    quietPenalty,
    conflictPenalty,
    formula:
      "confidence (30) + source diversity (20) + action (15) + creator reaction (15) + transcript usefulness (10) + bounded structure (10) − quiet/conflicting evidence",
    disclaimer:
      "Content Potential Score only prioritizes human review. It does not predict views or virality.",
  };
}

function styleScore(
  style: CandidateStyleInput | null,
  events: CandidateSourceEvent[],
  startSeconds: number,
  peakSeconds: number,
  endSeconds: number,
) {
  if (!style) return null;
  const duration = endSeconds - startSeconds;
  const preferredDuration = style.preferredVideoLengthSeconds ?? 30;
  const length = clamp(
    100 - (Math.abs(duration - preferredDuration) / preferredDuration) * 100,
    0,
    100,
  );
  const hasAction = events.some((event) =>
    /ACTION/.test(`${event.eventType} ${event.category ?? ""}`),
  );
  const energy = 100 - Math.abs((hasAction ? 85 : 35) - style.energyLevel);
  const hasReaction = events.some((event) =>
    /REACTION|CREATOR_AUDIO/.test(`${event.eventType} ${event.category ?? ""}`),
  );
  const reaction =
    100 - Math.abs((hasReaction ? 90 : 20) - style.reactionEmphasis);
  const setupRatio =
    ((peakSeconds - startSeconds) / Math.max(1, duration)) * 100;
  const setup = 100 - Math.abs(setupRatio - style.setupAmount);
  const storyEvidence = events.some((event) =>
    /STORY_(SETUP|PAYOFF)|QUESTION_OR_SUSPENSE_SETUP|DIRECT_AUDIENCE_ADDRESS/.test(
      event.eventType,
    ),
  );
  const story =
    100 - Math.abs((storyEvidence ? 85 : 25) - style.storytellingLevel);
  const total = clamp(
    length * 0.3 + energy * 0.25 + reaction * 0.2 + setup * 0.15 + story * 0.1,
    0,
    100,
  );
  return {
    total: rounded(total, 1),
    breakdown: {
      length: rounded(length, 1),
      energy: rounded(energy, 1),
      reaction: rounded(reaction, 1),
      setup: rounded(setup, 1),
      story: rounded(story, 1),
    },
    reasons: [
      `Candidate length is ${rounded(duration, 1)}s; the selected profile prefers about ${rounded(preferredDuration, 1)}s.`,
      hasAction
        ? "The candidate contains local action-intensity evidence."
        : "No strong local action-intensity evidence was found.",
      hasReaction
        ? "The candidate contains creator-reaction evidence."
        : "No creator-reaction evidence was found.",
      `${rounded(setupRatio, 1)}% of the candidate occurs before the evidence peak.`,
    ],
    formula:
      "length × 0.30 + energy × 0.25 + reaction × 0.20 + setup × 0.15 + story × 0.10",
  };
}

function evidenceItems(
  events: CandidateSourceEvent[],
  predicate: (event: CandidateSourceEvent) => boolean,
): CandidateEvidenceItem[] {
  return events
    .filter(predicate)
    .flatMap((event) => {
      const detailed = event.evidence
        .filter((item) => item.kind === "SUPPORTING")
        .map((item) => ({
          source: item.sourceSignal,
          summary: item.summary,
          timestampSeconds: item.timestampSeconds ?? event.peakSeconds,
          confidence: rounded(event.confidence),
          detectorId: event.detectorId,
          detectorVersion: event.detectorVersion,
        }));
      return detailed.length
        ? detailed
        : event.supportingEvidence.slice(0, 2).map((summary) => ({
            source: event.sourceSignal,
            summary,
            timestampSeconds: event.peakSeconds,
            confidence: rounded(event.confidence),
            detectorId: event.detectorId,
            detectorVersion: event.detectorVersion,
          }));
    })
    .sort((left, right) => left.timestampSeconds - right.timestampSeconds)
    .slice(0, 20);
}

function buildGroupCandidate(
  group: CandidateGroup,
  allEvents: CandidateSourceEvent[],
  durationSeconds: number,
  style: CandidateStyleInput | null,
): CandidateDraft {
  const supportStart = Math.max(0, group.firstPeak - 6);
  const supportEnd = Math.min(durationSeconds, group.lastPeak + 6);
  const support = allEvents
    .filter(
      (event) =>
        event.endSeconds >= supportStart && event.startSeconds <= supportEnd,
    )
    .sort((left, right) => {
      const leftSeed = group.seeds.some((seed) => seed.id === left.id) ? 1 : 0;
      const rightSeed = group.seeds.some((seed) => seed.id === right.id)
        ? 1
        : 0;
      return rightSeed - leftSeed || right.confidence - left.confidence;
    })
    .slice(0, 24);
  const peakEvent = [...group.seeds].sort(
    (left, right) =>
      right.confidence * sourceWeight(right.sourceSignal) -
      left.confidence * sourceWeight(left.sourceSignal),
  )[0];
  const peakSeconds = peakEvent?.peakSeconds ?? group.firstPeak;
  let startSeconds = Math.max(
    0,
    Math.min(...group.seeds.map((event) => event.startSeconds)) - 4,
  );
  let endSeconds = Math.min(
    durationSeconds,
    Math.max(...group.seeds.map((event) => event.endSeconds)) + 6,
  );
  if (endSeconds - startSeconds > 90) {
    startSeconds = Math.max(0, peakSeconds - 30);
    endSeconds = Math.min(durationSeconds, startSeconds + 90);
  }
  if (endSeconds - startSeconds < 4) {
    startSeconds = Math.max(0, peakSeconds - 2);
    endSeconds = Math.min(durationSeconds, peakSeconds + 4);
  }
  const categories = chooseCategory(group.seeds);
  const category = categories[0] ?? "OTHER_INTERESTING";
  const confidence = confidenceScore(group.seeds);
  const potential = contentPotentialScore(
    support,
    confidence.value,
    startSeconds,
    peakSeconds,
    endSeconds,
  );
  const similarity = styleScore(
    style,
    support,
    startSeconds,
    peakSeconds,
    endSeconds,
  );
  const videoEvidence = evidenceItems(
    support,
    (event) => !isTranscriptSignal(event.sourceSignal),
  );
  const transcriptEvidence = evidenceItems(support, (event) =>
    isTranscriptSignal(event.sourceSignal),
  );
  const missingEvidence: string[] = [];
  if (!transcriptEvidence.length) {
    missingEvidence.push(
      "No timestamped transcript evidence supports this candidate.",
    );
  }
  missingEvidence.push(
    "No synchronized replay fact was attached during local signal fusion.",
  );
  if (
    group.seeds.some((event) =>
      event.category
        ? [
            "KILL",
            "DEATH",
            "MULTI_KILL",
            "ROUND_WIN",
            "ROUND_LOSS",
            "MATCH_ENDING",
            "POSSIBLE_CLUTCH",
            "DEFUSER_PLANT",
            "DEFUSER_DISABLE",
          ].includes(event.category)
        : false,
    ) &&
    group.seeds.every((event) => isTranscriptSignal(event.sourceSignal))
  ) {
    missingEvidence.push(
      "Transcript language is supporting evidence only and does not confirm the gameplay event.",
    );
  }
  const detectorVersions = Object.fromEntries(
    support.map((event) => [event.detectorId, event.detectorVersion]),
  );
  const explanation =
    support.length === 1
      ? `${CATEGORY_LABELS[category]} selected from one local signal. Review the footage before using it.`
      : `${CATEGORY_LABELS[category]} selected because ${group.seeds.length} candidate signal${group.seeds.length === 1 ? "" : "s"} overlap near ${rounded(peakSeconds, 1)} seconds.`;
  return {
    category,
    mainEvent: CATEGORY_LABELS[category],
    alternativeCategories: categories.slice(1, 5),
    startSeconds: rounded(startSeconds),
    peakSeconds: rounded(peakSeconds),
    endSeconds: rounded(endSeconds),
    eventConfidence: confidence.value,
    contentPotentialScore: potential.total,
    styleSimilarity: similarity?.total ?? null,
    scoreBreakdown: {
      version: CANDIDATE_SCORE_VERSION,
      eventConfidence: confidence,
      contentPotential: potential,
      styleSimilarity: similarity,
    },
    videoEvidence,
    transcriptEvidence,
    replayEvidence: [],
    explanation,
    missingEvidence,
    detectorVersions,
    sourceEventIds: support.map((event) => event.id),
  };
}

export function fuseCandidateEvents(input: {
  events: CandidateSourceEvent[];
  durationSeconds: number;
  style?: CandidateStyleInput | null;
  mergeWindowSeconds?: number;
  maximumCandidates?: number;
}) {
  const durationSeconds = input.durationSeconds;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  const seeds = input.events
    .filter(isSeedEvent)
    .sort((left, right) => left.peakSeconds - right.peakSeconds);
  const groups: CandidateGroup[] = [];
  const mergeWindow = clamp(input.mergeWindowSeconds ?? 5, 0.5, 15);
  for (const event of seeds) {
    const current = groups.at(-1);
    if (
      current &&
      event.peakSeconds - current.lastPeak <= mergeWindow &&
      event.peakSeconds - current.firstPeak <= 20
    ) {
      current.lastPeak = event.peakSeconds;
      current.seeds.push(event);
    } else {
      groups.push({
        firstPeak: event.peakSeconds,
        lastPeak: event.peakSeconds,
        seeds: [event],
      });
    }
  }
  const defaultMaximum = clamp(
    Math.ceil((durationSeconds / 3_600) * 30),
    10,
    60,
  );
  return groups
    .map((group) =>
      buildGroupCandidate(
        group,
        input.events,
        durationSeconds,
        input.style ?? null,
      ),
    )
    .sort(
      (left, right) =>
        right.contentPotentialScore - left.contentPotentialScore ||
        right.eventConfidence - left.eventConfidence,
    )
    .slice(0, input.maximumCandidates ?? defaultMaximum);
}

function serializeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function requireStudioRecording(studioProjectId: string) {
  const studioProject = await db.studioProject.findUnique({
    where: { id: studioProjectId },
    include: {
      inputs: {
        include: {
          videoProject: true,
          replayPackage: {
            include: {
              canonicalMatch: {
                include: {
                  events: {
                    where: { timestampSeconds: { not: null } },
                    include: { round: true },
                  },
                },
              },
            },
          },
        },
      },
      styleProfile: true,
      synchronizations: {
        where: { status: "VERIFIED" },
        include: { roundAdjustments: true },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
  if (!studioProject) {
    throw new AppError(
      "That Creator Studio project does not exist.",
      404,
      "STUDIO_PROJECT_NOT_FOUND",
    );
  }
  const recording = studioProject.inputs.find(
    (item) => item.kind === "PRIMARY_RECORDING",
  )?.videoProject;
  if (!recording) {
    throw new AppError(
      "Short-form candidates require a real screen recording. Match Replay files contain structured facts, not playable video.",
      409,
      "STUDIO_RECORDING_REQUIRED",
    );
  }
  return { studioProject, recording };
}

async function enrichCandidateEvidence(
  drafts: CandidateDraft[],
  input: Awaited<ReturnType<typeof requireStudioRecording>>,
) {
  const transcriptJob = await db.transcriptionJob.findFirst({
    where: {
      projectId: input.recording.id,
      status: "COMPLETED",
      audioTrackId: input.studioProject.selectedAudioTrackId ?? undefined,
    },
    include: { segments: { orderBy: { startSeconds: "asc" } } },
    orderBy: { completedAt: "desc" },
  });
  const synchronization = input.studioProject.synchronizations[0] ?? null;
  const replayMatch = input.studioProject.inputs.find(
    (item) => item.kind === "MATCH_REPLAY",
  )?.replayPackage?.canonicalMatch;
  const roundAdjustments = new Map(
    synchronization?.roundAdjustments.map((item) => [
      item.replayRoundIndex,
      item.adjustmentSeconds,
    ]) ?? [],
  );

  return drafts.map((draft) => {
    const transcriptEvidence: CandidateEvidenceItem[] =
      transcriptJob?.segments
        .filter(
          (segment) =>
            segment.endSeconds >= draft.startSeconds &&
            segment.startSeconds <= draft.endSeconds,
        )
        .slice(0, 12)
        .map((segment) => ({
          source: "TRANSCRIPT",
          summary: segment.text,
          timestampSeconds: segment.startSeconds,
          confidence: 1,
        })) ?? [];
    const replayEvidence: CandidateEvidenceItem[] =
      synchronization && replayMatch
        ? replayMatch.events.flatMap((event) => {
            if (event.timestampSeconds === null) return [];
            const adjustment =
              roundAdjustments.get(event.round?.roundIndex ?? -1) ?? 0;
            const mappedSeconds =
              synchronization.offsetSeconds +
              event.timestampSeconds * synchronization.slope +
              adjustment;
            if (
              mappedSeconds < draft.startSeconds ||
              mappedSeconds > draft.endSeconds
            ) {
              return [];
            }
            return [
              {
                source: "SYNCHRONIZED_REPLAY",
                summary: `${event.category.replaceAll("_", " ").toLowerCase()} replay fact (${event.validationStatus.toLowerCase()}; ${event.confidenceStatus.toLowerCase()} confidence).`,
                timestampSeconds: rounded(mappedSeconds),
                confidence:
                  event.confidenceStatus === "HIGH"
                    ? 0.9
                    : event.confidenceStatus === "MODERATE"
                      ? 0.65
                      : event.confidenceStatus === "LOW"
                        ? 0.4
                        : 0.25,
                detectorId: "verified-replay-synchronization",
                detectorVersion: synchronization.mappingAlgorithmVersion,
              },
            ];
          })
        : [];
    const missingEvidence = draft.missingEvidence.filter((item) => {
      if (
        transcriptEvidence.length &&
        item.startsWith("No timestamped transcript")
      )
        return false;
      if (
        replayEvidence.length &&
        item.startsWith("No synchronized replay fact")
      )
        return false;
      return true;
    });
    if (!synchronization && replayMatch) {
      missingEvidence.push(
        "A Match Replay is linked, but no verified replay/video synchronization is available.",
      );
    } else if (
      synchronization &&
      replayMatch &&
      replayMatch.events.length === 0
    ) {
      missingEvidence.push(
        "The verified synchronization exists, but this replay parser supplied no replay-relative event timestamps.",
      );
    }
    return {
      ...draft,
      transcriptEvidence: [
        ...draft.transcriptEvidence,
        ...transcriptEvidence,
      ].slice(0, 20),
      replayEvidence: replayEvidence.slice(0, 20),
      missingEvidence: [...new Set(missingEvidence)],
    };
  });
}

export async function generateStudioCandidates(
  studioProjectId: string,
  requestedAnalysisJobId?: string,
) {
  const { studioProject, recording } =
    await requireStudioRecording(studioProjectId);
  const analysisJob = await db.analysisJob.findFirst({
    where: {
      id: requestedAnalysisJobId,
      projectId: recording.id,
      status: "COMPLETED",
    },
    orderBy: { completedAt: "desc" },
    include: {
      detectorRuns: {
        where: { status: "COMPLETED" },
        include: {
          detectorDefinition: true,
          events: {
            include: { evidence: true },
            orderBy: { peakSeconds: "asc" },
          },
        },
      },
    },
  });
  if (!analysisJob) {
    throw new AppError(
      "Run and complete local signal analysis in the linked video workspace before generating candidates.",
      409,
      "COMPLETED_ANALYSIS_REQUIRED",
    );
  }
  const existingCount = await db.candidateMoment.count({
    where: { studioProjectId, analysisJobId: analysisJob.id },
  });
  if (existingCount > 0) return getStudioCandidateState(studioProjectId);

  const sourceEvents: CandidateSourceEvent[] = analysisJob.detectorRuns.flatMap(
    (run) =>
      run.events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        category: event.category,
        startSeconds: event.startSeconds,
        peakSeconds: event.peakSeconds,
        endSeconds: event.endSeconds,
        confidence: event.confidence,
        sourceSignal: event.sourceSignal,
        detectorId: run.detectorStableId,
        detectorVersion: run.detectorVersion,
        supportingEvidence: parseArray(event.supportingEvidenceJson),
        conflictingEvidence: parseArray(event.conflictingEvidenceJson),
        evidence: event.evidence.map((item) => ({
          kind: item.kind,
          sourceSignal: item.sourceSignal,
          summary: item.summary,
          timestampSeconds: item.timestampSeconds,
        })),
      })),
  );
  if (!sourceEvents.some(isSeedEvent)) {
    throw new AppError(
      "The completed analysis contains no action, creator-reaction, or other positive candidate signals. The app will not invent a moment.",
      409,
      "NO_CANDIDATE_SIGNALS",
    );
  }
  const style: CandidateStyleInput | null = studioProject.styleProfile
    ? {
        id: studioProject.styleProfile.id,
        preferredVideoLengthSeconds:
          studioProject.styleProfile.preferredVideoLengthSeconds,
        energyLevel: studioProject.styleProfile.energyLevel,
        setupAmount: studioProject.styleProfile.setupAmount,
        reactionEmphasis: studioProject.styleProfile.reactionEmphasis,
        storytellingLevel: studioProject.styleProfile.storytellingLevel,
      }
    : null;
  const drafts = await enrichCandidateEvidence(
    fuseCandidateEvents({
      events: sourceEvents,
      durationSeconds: recording.durationSeconds,
      style,
    }),
    { studioProject, recording },
  );
  await db.$transaction(
    drafts.map((draft) =>
      db.candidateMoment.create({
        data: {
          projectId: recording.id,
          studioProjectId,
          analysisJobId: analysisJob.id,
          styleProfileId: style?.id ?? null,
          category: draft.category,
          mainEvent: draft.mainEvent,
          alternativeCategoriesJson: JSON.stringify(
            draft.alternativeCategories,
          ),
          startSeconds: draft.startSeconds,
          peakSeconds: draft.peakSeconds,
          endSeconds: draft.endSeconds,
          eventConfidence: draft.eventConfidence,
          contentPotentialScore: draft.contentPotentialScore,
          styleSimilarity: draft.styleSimilarity,
          scoreBreakdownJson: JSON.stringify(draft.scoreBreakdown),
          videoEvidenceJson: JSON.stringify(draft.videoEvidence),
          replayEvidenceJson: JSON.stringify(draft.replayEvidence),
          transcriptEvidenceJson: JSON.stringify(draft.transcriptEvidence),
          explanation: draft.explanation,
          missingEvidenceJson: JSON.stringify(draft.missingEvidence),
          detectorVersionsJson: JSON.stringify(draft.detectorVersions),
          fusionVersion: CANDIDATE_FUSION_VERSION,
          synchronizationVersion:
            studioProject.synchronizations[0]?.version ?? null,
          detectorLinks: {
            create: draft.sourceEventIds.map((detectorEventId) => ({
              detectorEventId,
              role: "SUPPORTING",
            })),
          },
        },
      }),
    ),
  );
  return getStudioCandidateState(studioProjectId);
}

export async function getStudioCandidateState(studioProjectId: string) {
  const { studioProject, recording } =
    await requireStudioRecording(studioProjectId);
  const [analysisJobs, candidates] = await Promise.all([
    db.analysisJob.findMany({
      where: { projectId: recording.id, status: "COMPLETED" },
      select: {
        id: true,
        analysisVersion: true,
        detectorSetVersion: true,
        completedAt: true,
        _count: { select: { candidates: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 20,
    }),
    db.candidateMoment.findMany({
      where: { studioProjectId },
      include: {
        analysisJob: {
          select: { analysisVersion: true, detectorSetVersion: true },
        },
        reviews: { orderBy: { createdAt: "desc" }, take: 1 },
        detectorLinks: {
          include: {
            detectorEvent: {
              select: {
                id: true,
                eventType: true,
                category: true,
                peakSeconds: true,
                confidence: true,
                sourceSignal: true,
              },
            },
          },
        },
      },
      orderBy: [{ contentPotentialScore: "desc" }, { eventConfidence: "desc" }],
    }),
  ]);
  return {
    studioProjectId,
    studioProjectName: studioProject.name,
    recording: {
      id: recording.id,
      name: recording.name,
      durationSeconds: recording.durationSeconds,
    },
    canGenerate: analysisJobs.length > 0,
    candidateCount: candidates.length,
    disclaimer:
      "Content Potential Score prioritizes review. It does not predict or guarantee views.",
    analysisJobs: analysisJobs.map((job) => ({
      id: job.id,
      analysisVersion: job.analysisVersion,
      detectorSetVersion: job.detectorSetVersion,
      completedAt: job.completedAt?.toISOString() ?? null,
      candidateCount: job._count.candidates,
    })),
    candidates: candidates.map((candidate) => {
      const review = candidate.reviews[0] ?? null;
      return {
        id: candidate.id,
        analysisJobId: candidate.analysisJobId,
        category: candidate.category,
        mainEvent: candidate.mainEvent,
        alternativeCategories: serializeJson<GroundTruthCategory[]>(
          candidate.alternativeCategoriesJson,
          [],
        ),
        suggestedStartSeconds: candidate.startSeconds,
        peakSeconds: candidate.peakSeconds,
        suggestedEndSeconds: candidate.endSeconds,
        effectiveStartSeconds:
          review?.correctedStartSeconds ?? candidate.startSeconds,
        effectiveEndSeconds:
          review?.correctedEndSeconds ?? candidate.endSeconds,
        effectiveCategory: review?.correctedCategory ?? candidate.category,
        eventConfidence: candidate.eventConfidence,
        contentPotentialScore: candidate.contentPotentialScore,
        styleSimilarity: candidate.styleSimilarity,
        scoreBreakdown: serializeJson<Record<string, unknown>>(
          candidate.scoreBreakdownJson,
          {},
        ),
        videoEvidence: serializeJson<CandidateEvidenceItem[]>(
          candidate.videoEvidenceJson,
          [],
        ),
        replayEvidence: serializeJson<CandidateEvidenceItem[]>(
          candidate.replayEvidenceJson,
          [],
        ),
        transcriptEvidence: serializeJson<CandidateEvidenceItem[]>(
          candidate.transcriptEvidenceJson,
          [],
        ),
        explanation: candidate.explanation,
        missingEvidence: serializeJson<string[]>(
          candidate.missingEvidenceJson,
          [],
        ),
        detectorVersions: serializeJson<Record<string, string>>(
          candidate.detectorVersionsJson,
          {},
        ),
        fusionVersion: candidate.fusionVersion,
        analysisVersion: candidate.analysisJob.analysisVersion,
        detectorSetVersion: candidate.analysisJob.detectorSetVersion,
        latestReview: review
          ? {
              id: review.id,
              decision: review.decision,
              correctedStartSeconds: review.correctedStartSeconds,
              correctedEndSeconds: review.correctedEndSeconds,
              correctedCategory: review.correctedCategory,
              note: review.note,
              updatedAt: review.updatedAt.toISOString(),
            }
          : null,
        supportingDetectors: candidate.detectorLinks.map((link) => ({
          ...link.detectorEvent,
          role: link.role,
        })),
        createdAt: candidate.createdAt.toISOString(),
        updatedAt: candidate.updatedAt.toISOString(),
      };
    }),
  };
}

export async function reviewStudioCandidate(
  studioProjectId: string,
  candidateId: string,
  input: unknown,
) {
  const payload = candidateReviewSchema.parse(input);
  const candidate = await db.candidateMoment.findFirst({
    where: { id: candidateId, studioProjectId },
    include: { project: { select: { durationSeconds: true } } },
  });
  if (!candidate) {
    throw new AppError(
      "That candidate does not belong to this Creator Studio project.",
      404,
      "CANDIDATE_NOT_FOUND",
    );
  }
  const start = payload.correctedStartSeconds ?? candidate.startSeconds;
  const end = payload.correctedEndSeconds ?? candidate.endSeconds;
  if (start < 0 || end > candidate.project.durationSeconds || end <= start) {
    throw new AppError(
      "Corrected timestamps must stay inside the recording, with the end after the start.",
      400,
      "CANDIDATE_RANGE_INVALID",
    );
  }
  if (candidate.peakSeconds < start || candidate.peakSeconds > end) {
    throw new AppError(
      "The corrected range must still contain the evidence peak.",
      400,
      "CANDIDATE_PEAK_OUTSIDE_RANGE",
    );
  }
  await db.candidateReviewLabel.create({
    data: {
      candidateId,
      decision: payload.decision as CandidateReviewDecision,
      correctedStartSeconds:
        payload.correctedStartSeconds === undefined
          ? null
          : payload.correctedStartSeconds,
      correctedEndSeconds:
        payload.correctedEndSeconds === undefined
          ? null
          : payload.correctedEndSeconds,
      correctedCategory:
        payload.correctedCategory === undefined
          ? null
          : payload.correctedCategory,
      note: payload.note === undefined ? null : payload.note,
    },
  });
  return getStudioCandidateState(studioProjectId);
}

export type StudioCandidateState = Awaited<
  ReturnType<typeof getStudioCandidateState>
>;
