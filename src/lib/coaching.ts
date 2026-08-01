import {
  type CanonicalConfidenceStatus,
  type CanonicalEventCategory,
  type CoachingEvidenceClass,
  type CoachingFindingCategory,
  type CoachingFindingDecision,
  type CoachingFindingSeverity,
  type Prisma,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const COACHING_ANALYSIS_VERSION = "u6-human-reviewed-v1";
export const COACHING_RULE_SET_VERSION = "u6-inspectable-foundation-v1";

export const COACHING_FINDING_CATEGORIES: ReadonlyArray<{
  value: CoachingFindingCategory;
  label: string;
  kind: "review" | "strength";
  evidenceBoundary: string;
}> = [
  {
    value: "POSSIBLE_UNNECESSARY_REPEEK",
    label: "Possible unnecessary re-peek",
    kind: "review",
    evidenceBoundary:
      "Requires repeated visible exposure. Intent and tactical necessity remain unknown.",
  },
  {
    value: "CROSSHAIR_PLACEMENT_ISSUE",
    label: "Crosshair-placement issue",
    kind: "review",
    evidenceBoundary:
      "Requires a visible, user-reviewed crosshair and threat point. Replay data alone cannot establish it.",
  },
  {
    value: "POSSIBLE_BAD_POSITIONING",
    label: "Possible bad positioning",
    kind: "review",
    evidenceBoundary:
      "A visible risk can support review, but exact room geometry, teammate coverage, and intent may be missing.",
  },
  {
    value: "ROTATION_ISSUE",
    label: "Rotation issue",
    kind: "review",
    evidenceBoundary:
      "Requires visible movement plus enough round and map context. A route is not automatically wrong.",
  },
  {
    value: "POSSIBLE_MISSED_TRADE",
    label: "Possible missed trade",
    kind: "review",
    evidenceBoundary:
      "Requires event timing, team relationship, and spatial opportunity. Kill order alone is insufficient.",
  },
  {
    value: "POSSIBLE_FLANK_EXPOSURE",
    label: "Possible flank exposure",
    kind: "review",
    evidenceBoundary:
      "Requires a visible uncovered route or user-confirmed map context. Replay outcomes do not prove exposure.",
  },
  {
    value: "LINE_OF_SIGHT_ISSUE",
    label: "Line-of-sight issue",
    kind: "review",
    evidenceBoundary:
      "Requires visible geometry. The current replay parser has no camera or validated position stream.",
  },
  {
    value: "POSSIBLE_WRONG_ANGLE",
    label: "Possible wrong angle",
    kind: "review",
    evidenceBoundary:
      "Requires visible angle geometry and threat context. Tactical necessity may remain unknown.",
  },
  {
    value: "POOR_TIMING",
    label: "Poor timing",
    kind: "review",
    evidenceBoundary:
      "Requires an observable timing relationship. The outcome alone does not prove a timing mistake.",
  },
  {
    value: "EARLY_ROUND_DEATH",
    label: "Early-round death",
    kind: "review",
    evidenceBoundary:
      "Requires a supported death event and usable round timing. Cause remains unknown.",
  },
  {
    value: "UTILITY_TIMING",
    label: "Utility timing",
    kind: "review",
    evidenceBoundary:
      "Requires visible or supported utility use. The current replay provider does not expose gadget use.",
  },
  {
    value: "OBJECTIVE_INVOLVEMENT",
    label: "Objective involvement",
    kind: "strength",
    evidenceBoundary:
      "May use supported defuser or objective feedback without inventing intention or exact position.",
  },
  {
    value: "STRONG_DECISION",
    label: "Strong decision",
    kind: "strength",
    evidenceBoundary:
      "Requires a visible choice and relevant context. A favorable outcome alone is not proof.",
  },
  {
    value: "STRONG_PATIENCE",
    label: "Strong patience",
    kind: "strength",
    evidenceBoundary:
      "Requires a visible period of deliberate restraint. Intent may still be uncertain.",
  },
  {
    value: "GOOD_TRADE",
    label: "Good trade",
    kind: "strength",
    evidenceBoundary:
      "Requires supported team relationships and event timing; spatial opportunity may remain unknown.",
  },
  {
    value: "GOOD_POSITIONING",
    label: "Good positioning",
    kind: "strength",
    evidenceBoundary:
      "Requires visible geometry and outcome context. Exact room recognition is not implemented.",
  },
  {
    value: "GOOD_CROSSHAIR_DISCIPLINE",
    label: "Good crosshair discipline",
    kind: "strength",
    evidenceBoundary:
      "Requires user-reviewed visible crosshair measurements, not replay-only data.",
  },
  {
    value: "REVIEW_RECOMMENDED",
    label: "Review recommended",
    kind: "review",
    evidenceBoundary:
      "A bounded signal or human observation suggests review without asserting a tactical cause.",
  },
];

export const COACHING_SEVERITIES: ReadonlyArray<{
  value: CoachingFindingSeverity;
  label: string;
}> = [
  { value: "INFORMATIONAL", label: "Informational" },
  { value: "LOW", label: "Low priority" },
  { value: "MEDIUM", label: "Medium priority" },
  { value: "HIGH", label: "High priority" },
];

export const COACHING_DECISIONS: ReadonlyArray<{
  value: CoachingFindingDecision;
  label: string;
}> = [
  { value: "PENDING", label: "Not reviewed" },
  { value: "ACCEPTED", label: "Accept" },
  { value: "REJECTED", label: "Reject" },
  { value: "NOT_ENOUGH_CONTEXT", label: "Not enough context" },
  { value: "WRONG_CATEGORY", label: "Wrong category" },
  { value: "GOOD_OBSERVATION", label: "Good observation" },
  { value: "BAD_EXPLANATION", label: "Bad explanation" },
];

const categoryValues = COACHING_FINDING_CATEGORIES.map(
  (category) => category.value,
) as [CoachingFindingCategory, ...CoachingFindingCategory[]];
const severityValues = COACHING_SEVERITIES.map(
  (severity) => severity.value,
) as [CoachingFindingSeverity, ...CoachingFindingSeverity[]];
const decisionValues = COACHING_DECISIONS.map((decision) => decision.value) as [
  CoachingFindingDecision,
  ...CoachingFindingDecision[],
];

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().optional();

export const createHumanReviewedFindingSchema = z
  .object({
    category: z.enum(categoryValues),
    severity: z.enum(severityValues).default("MEDIUM"),
    confidence: z.number().min(0).max(1).default(0.6),
    videoTimestampSeconds: z.number().min(0).nullable().optional(),
    canonicalEventId: z.string().trim().min(1).max(191).nullable().optional(),
    transcriptSegmentId: z
      .string()
      .trim()
      .min(1)
      .max(191)
      .nullable()
      .optional(),
    directObservation: optionalText(2_000),
    directObservationConfirmed: z.boolean().default(false),
    inference: optionalText(2_000),
    missingContext: optionalText(2_000),
    alternativeExplanation: optionalText(2_000),
    coachNote: optionalText(5_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !value.directObservation &&
      !value.canonicalEventId &&
      !value.transcriptSegmentId
    ) {
      context.addIssue({
        code: "custom",
        path: ["directObservation"],
        message:
          "Add a visible observation, a supported replay fact, or a saved transcript line.",
      });
    }
    if (value.directObservation && !value.directObservationConfirmed) {
      context.addIssue({
        code: "custom",
        path: ["directObservationConfirmed"],
        message:
          "Confirm that you personally reviewed this visible observation in the selected recording.",
      });
    }
    if (value.directObservation && value.videoTimestampSeconds == null) {
      context.addIssue({
        code: "custom",
        path: ["videoTimestampSeconds"],
        message: "A visible observation needs a video timestamp.",
      });
    }
  });

export const updateCoachingFindingSchema = z
  .object({
    decision: z.enum(decisionValues).optional(),
    videoTimestampSeconds: z.number().min(0).nullable().optional(),
    severity: z.enum(severityValues).optional(),
    category: z.enum(categoryValues).optional(),
    coachNote: optionalText(5_000),
    futurePractice: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Choose at least one finding change.",
  });

type JsonRecord = Record<string, unknown>;

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseStringArray(value: string) {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampConfidence(status: CanonicalConfidenceStatus, fallback = 0.5) {
  if (status === "VERIFIED") return 1;
  if (status === "HIGH") return 0.9;
  if (status === "MODERATE") return 0.7;
  if (status === "LOW") return 0.4;
  return fallback;
}

function categoryLabel(category: CoachingFindingCategory) {
  return (
    COACHING_FINDING_CATEGORIES.find((item) => item.value === category)
      ?.label ?? category.toLowerCase().replaceAll("_", " ")
  );
}

function eventLabel(category: CanonicalEventCategory) {
  return category.toLowerCase().replaceAll("_", " ");
}

type CanonicalEventForSummary = {
  id: string;
  stableId: string;
  category: CanonicalEventCategory;
  timestampSeconds: number | null;
  directObservationJson: string;
  confidenceStatus: CanonicalConfidenceStatus;
  validationStatus: string;
  missingEvidenceJson: string;
  conflictingEvidenceJson: string;
  sourceProviderId?: string;
  sourceProviderVersion?: string;
  round: { id: string; roundIndex: number } | null;
};

export function summarizeCanonicalEvent(event: CanonicalEventForSummary) {
  const observation = parseJson(event.directObservationJson);
  const details = isRecord(observation) ? observation : {};
  const actor =
    typeof details.actorAlias === "string" ? details.actorAlias : null;
  const target =
    typeof details.targetAlias === "string" ? details.targetAlias : null;
  const roundClock =
    typeof details.roundClock === "string" ? details.roundClock : null;
  const headshot = details.headshot === true;
  const parts = [
    `Replay feedback recorded ${eventLabel(event.category)}`,
    actor && target ? `from ${actor} to ${target}` : null,
    event.round ? `in round ${event.round.roundIndex + 1}` : null,
    roundClock ? `at the observed round clock ${roundClock}` : null,
    headshot ? "with a headshot flag" : null,
  ].filter((part): part is string => Boolean(part));

  return `${parts.join(" ")}.`;
}

function coachingProjectInclude() {
  return {
    inputs: {
      orderBy: [{ kind: "asc" as const }, { sortOrder: "asc" as const }],
      include: {
        videoProject: {
          include: {
            transcriptionJobs: {
              where: { status: "COMPLETED" as const },
              orderBy: { completedAt: "desc" as const },
              take: 3,
              include: {
                segments: { orderBy: { startSeconds: "asc" as const } },
              },
            },
          },
        },
        replayPackage: {
          include: {
            canonicalMatch: {
              include: {
                rounds: { orderBy: { roundIndex: "asc" as const } },
                events: {
                  orderBy: [
                    { round: { roundIndex: "asc" as const } },
                    { timestampSeconds: "asc" as const },
                    { createdAt: "asc" as const },
                  ],
                  include: {
                    round: { select: { id: true, roundIndex: true } },
                  },
                },
              },
            },
          },
        },
      },
    },
    map: true,
    mapVersion: true,
    bombSite: true,
    operator: true,
    coachingCalibrations: {
      orderBy: { version: "desc" as const },
    },
    coachingMeasurements: {
      orderBy: { createdAt: "desc" as const },
      include: {
        calibration: {
          select: { version: true, name: true },
        },
      },
    },
    coachingAnalyses: {
      orderBy: { createdAt: "desc" as const },
      include: { _count: { select: { findings: true } } },
    },
    coachingFindings: {
      orderBy: { createdAt: "desc" as const },
      include: {
        evidence: { orderBy: { createdAt: "asc" as const } },
        feedbackHistory: { orderBy: { createdAt: "desc" as const } },
        practiceDrills: { orderBy: { createdAt: "desc" as const } },
        canonicalRound: { select: { roundIndex: true } },
        canonicalEvent: { select: { stableId: true, category: true } },
        reviewClip: {
          select: {
            id: true,
            name: true,
            status: true,
            startSeconds: true,
            endSeconds: true,
          },
        },
      },
    },
    coachingDrills: {
      orderBy: { createdAt: "desc" as const },
    },
    coachingReports: {
      orderBy: { version: "desc" as const },
      include: { exports: true },
    },
  } satisfies Prisma.StudioProjectInclude;
}

type CoachingProject = Prisma.StudioProjectGetPayload<{
  include: ReturnType<typeof coachingProjectInclude>;
}>;

function serializeEvidence(
  evidence: CoachingProject["coachingFindings"][number]["evidence"][number],
) {
  return {
    id: evidence.id,
    evidenceClass: evidence.evidenceClass,
    summary: evidence.summary,
    sourceType: evidence.sourceType,
    sourceId: evidence.sourceId,
    videoTimestampSeconds: evidence.videoTimestampSeconds,
    replayTimestampSeconds: evidence.replayTimestampSeconds,
    confidence: evidence.confidence,
    observation: parseJson(evidence.observationJson),
    inference: parseJson(evidence.inferenceJson),
    createdAt: evidence.createdAt.toISOString(),
  };
}

function serializeCoachingProject(project: CoachingProject) {
  const primaryRecording = project.inputs.find(
    (input) => input.kind === "PRIMARY_RECORDING",
  )?.videoProject;
  const replay = project.inputs.find(
    (input) => input.kind === "MATCH_REPLAY",
  )?.replayPackage;
  const match = replay?.canonicalMatch;
  const latestTranscript = primaryRecording?.transcriptionJobs[0] ?? null;

  return {
    project: {
      id: project.id,
      name: project.name,
      inputMode: project.inputMode,
      coachingGoals: project.coachingGoals,
      selectedPlayerStableId: project.selectedPlayerStableId,
      selectedPlayerAlias: project.selectedPlayerAlias,
      contextUserConfirmed: project.contextUserConfirmed,
      recording: primaryRecording
        ? {
            id: primaryRecording.id,
            name: primaryRecording.name,
            durationSeconds: primaryRecording.durationSeconds,
            width: primaryRecording.width,
            height: primaryRecording.height,
            frameRate: primaryRecording.frameRate,
          }
        : null,
      replay: replay
        ? {
            id: replay.id,
            name: replay.displayName,
            status: replay.status,
            mapName: match?.mapName ?? null,
            gameMode: match?.gameMode ?? null,
            matchType: match?.matchType ?? null,
            providerId: match?.sourceProviderId ?? null,
            providerVersion: match?.sourceProviderVersion ?? null,
            confidenceStatus: match?.confidenceStatus ?? null,
            validationStatus: match?.validationStatus ?? null,
          }
        : null,
      userConfirmedContext: project.contextUserConfirmed
        ? [
            project.map ? `Map: ${project.map.name}` : null,
            project.mapVersion
              ? `Map version: ${project.mapVersion.versionName}`
              : null,
            project.bombSite
              ? `Bomb site: ${project.bombSite.displayName}`
              : null,
            project.side !== "UNKNOWN"
              ? `Side: ${project.side.toLowerCase()}`
              : null,
            project.operator
              ? `Operator: ${project.operator.displayName}`
              : null,
            project.roundResult ? `Round result: ${project.roundResult}` : null,
          ].filter((item): item is string => Boolean(item))
        : [],
    },
    capabilities: {
      directVideoObservation: primaryRecording
        ? {
            state: "AVAILABLE_WITH_HUMAN_REVIEW",
            explanation:
              "The selected screen recording can support direct visible observations after a human reviews the exact timestamp.",
          }
        : {
            state: "UNAVAILABLE",
            explanation:
              "Match Replay files do not contain the creator's original gameplay pixels.",
          },
      transcriptEvidence: latestTranscript
        ? {
            state: "AVAILABLE_SUPPORTING_ONLY",
            explanation: `${latestTranscript.segments.length} saved transcript line${latestTranscript.segments.length === 1 ? "" : "s"} can support a review but cannot prove a gameplay event.`,
          }
        : {
            state: "UNAVAILABLE",
            explanation:
              "No completed selected-track transcript is attached to the primary recording.",
          },
      replayFacts: match
        ? {
            state: "AVAILABLE_BOUNDED",
            explanation: `${match.events.length} canonical replay event${match.events.length === 1 ? "" : "s"} are available with their provider validation and missing evidence.`,
          }
        : {
            state: "UNAVAILABLE",
            explanation:
              "No parsed Match Replay is attached to this unified project.",
          },
      positionAndCamera: {
        state: "UNSUPPORTED",
        explanation:
          "The current replay provider exposes no validated position, orientation, line-of-sight, shot, or player-view camera stream.",
      },
      automaticRoomRecognition: {
        state: "UNSUPPORTED",
        explanation:
          "The map knowledge base does not recognize an exact room from gameplay footage.",
      },
    },
    transcriptSegments:
      latestTranscript?.segments.map((segment) => ({
        id: segment.id,
        startSeconds: segment.startSeconds,
        endSeconds: segment.endSeconds,
        text: segment.text,
      })) ?? [],
    replayEvents:
      match?.events.map((event) => ({
        id: event.id,
        stableId: event.stableId,
        category: event.category,
        summary: summarizeCanonicalEvent(event),
        roundIndex: event.round?.roundIndex ?? null,
        timestampSeconds: event.timestampSeconds,
        confidenceStatus: event.confidenceStatus,
        validationStatus: event.validationStatus,
        confidence: clampConfidence(event.confidenceStatus),
        missingEvidence: parseStringArray(event.missingEvidenceJson),
        conflictingEvidence: parseStringArray(event.conflictingEvidenceJson),
      })) ?? [],
    calibrations: project.coachingCalibrations.map((calibration) => ({
      id: calibration.id,
      version: calibration.version,
      name: calibration.name,
      isActive: calibration.isActive,
      crosshairNormalizedX: calibration.crosshairNormalizedX,
      crosshairNormalizedY: calibration.crosshairNormalizedY,
      hudScalePercent: calibration.hudScalePercent,
      sensitivityAssumptions: calibration.sensitivityAssumptions,
      aspectRatio: calibration.aspectRatio,
      fovDegrees: calibration.fovDegrees,
      sourceWidth: calibration.sourceWidth,
      sourceHeight: calibration.sourceHeight,
      colorSettings: calibration.colorSettings,
      safeAreaNotes: calibration.safeAreaNotes,
      overlayNotes: calibration.overlayNotes,
      userConfirmed: calibration.userConfirmed,
      calibrationVersion: calibration.calibrationVersion,
      createdAt: calibration.createdAt.toISOString(),
    })),
    measurements: project.coachingMeasurements.map((measurement) => ({
      id: measurement.id,
      findingId: measurement.findingId,
      kind: measurement.kind,
      startSeconds: measurement.startSeconds,
      peakSeconds: measurement.peakSeconds,
      endSeconds: measurement.endSeconds,
      confidence: measurement.confidence,
      methodVersion: measurement.methodVersion,
      inputs: parseJson(measurement.inputsJson),
      measurements: parseJson(measurement.measurementsJson),
      thresholds: parseJson(measurement.thresholdsJson),
      userConfirmed: measurement.userConfirmed,
      warnings: parseStringArray(measurement.warningMessagesJson),
      calibration: measurement.calibration,
      createdAt: measurement.createdAt.toISOString(),
    })),
    analyses: project.coachingAnalyses.map((analysis) => ({
      id: analysis.id,
      inputMode: analysis.inputMode,
      status: analysis.status,
      progress: analysis.progress,
      stage: analysis.stage,
      analysisVersion: analysis.analysisVersion,
      ruleSetVersion: analysis.ruleSetVersion,
      findingCount: analysis._count.findings,
      warnings: parseStringArray(analysis.warningsJson),
      errorMessage: analysis.errorMessage,
      createdAt: analysis.createdAt.toISOString(),
      completedAt: analysis.completedAt?.toISOString() ?? null,
    })),
    findings: project.coachingFindings.map((finding) => ({
      id: finding.id,
      analysisId: finding.analysisId,
      originalCategory: finding.originalCategory,
      category: finding.category,
      originalSeverity: finding.originalSeverity,
      severity: finding.severity,
      confidence: finding.confidence,
      roundIndex:
        finding.roundIndex ?? finding.canonicalRound?.roundIndex ?? null,
      originalVideoTimestampSeconds: finding.originalVideoTimestampSeconds,
      videoTimestampSeconds: finding.videoTimestampSeconds,
      replayTimestampSeconds: finding.replayTimestampSeconds,
      directObservations: parseStringArray(finding.directObservationsJson),
      replayFacts: parseStringArray(finding.replayFactsJson),
      transcriptEvidence: parseStringArray(finding.transcriptEvidenceJson),
      mapEvidence: parseStringArray(finding.mapEvidenceJson),
      supportingFrames: parseJson(finding.supportingFramesJson),
      conflictingEvidence: parseStringArray(finding.conflictingEvidenceJson),
      missingContext: parseStringArray(finding.missingContextJson),
      explanation: finding.explanation,
      alternativeExplanations: parseStringArray(
        finding.alternativeExplanationsJson,
      ),
      detectorVersions: parseJson(finding.detectorVersionsJson),
      analysisVersion: finding.analysisVersion,
      decision: finding.decision,
      coachNote: finding.coachNote,
      futurePractice: finding.futurePractice,
      canonicalEvent: finding.canonicalEvent,
      reviewClip: finding.reviewClip,
      evidence: finding.evidence.map(serializeEvidence),
      feedbackHistory: finding.feedbackHistory.map((feedback) => ({
        id: feedback.id,
        decision: feedback.decision,
        previousDecision: feedback.previousDecision,
        correctedVideoTimestamp: feedback.correctedVideoTimestamp,
        previousVideoTimestamp: feedback.previousVideoTimestamp,
        correctedSeverity: feedback.correctedSeverity,
        previousSeverity: feedback.previousSeverity,
        correctedCategory: feedback.correctedCategory,
        previousCategory: feedback.previousCategory,
        note: feedback.note,
        futurePractice: feedback.futurePractice,
        createdAt: feedback.createdAt.toISOString(),
      })),
      practiceDrills: finding.practiceDrills.map((drill) => ({
        id: drill.id,
        name: drill.name,
        measurableGoal: drill.measurableGoal,
        completed: drill.completed,
      })),
      createdAt: finding.createdAt.toISOString(),
      updatedAt: finding.updatedAt.toISOString(),
    })),
    drills: project.coachingDrills.map((drill) => ({
      id: drill.id,
      findingId: drill.findingId,
      name: drill.name,
      observation: drill.observation,
      instructions: drill.instructions,
      measurableGoal: drill.measurableGoal,
      nextFiveMatchGoal: drill.nextFiveMatchGoal,
      completed: drill.completed,
      createdAt: drill.createdAt.toISOString(),
      updatedAt: drill.updatedAt.toISOString(),
    })),
    reports: project.coachingReports.map((report) => ({
      id: report.id,
      version: report.version,
      reason: report.reason,
      reportVersion: report.reportVersion,
      createdAt: report.createdAt.toISOString(),
      exports: report.exports.map((item) => ({
        id: item.id,
        format: item.format,
        fileSizeBytes: Number(item.fileSizeBytes),
        createdAt: item.createdAt.toISOString(),
      })),
    })),
  };
}

async function requireCoachingProject(id: string) {
  const project = await db.studioProject.findUnique({
    where: { id },
    include: coachingProjectInclude(),
  });
  if (!project) {
    throw new AppError(
      "That Creator Studio project no longer exists.",
      404,
      "STUDIO_PROJECT_NOT_FOUND",
    );
  }
  return project;
}

export async function getCoachingState(studioProjectId: string) {
  return serializeCoachingProject(
    await requireCoachingProject(studioProjectId),
  );
}

function mapEvidenceForProject(project: {
  contextUserConfirmed: boolean;
  map: { name: string } | null;
  mapVersion: { versionName: string } | null;
  bombSite: { displayName: string } | null;
  side: string;
  operator: { displayName: string } | null;
  roundResult: string | null;
}) {
  if (!project.contextUserConfirmed) return [];
  return [
    project.map ? `User-confirmed map: ${project.map.name}.` : null,
    project.mapVersion
      ? `User-confirmed map version: ${project.mapVersion.versionName}.`
      : null,
    project.bombSite
      ? `User-confirmed bomb site: ${project.bombSite.displayName}.`
      : null,
    project.side !== "UNKNOWN"
      ? `User-confirmed side: ${project.side.toLowerCase()}.`
      : null,
    project.operator
      ? `User-confirmed operator: ${project.operator.displayName}.`
      : null,
    project.roundResult
      ? `User-confirmed round result: ${project.roundResult}.`
      : null,
  ].filter((item): item is string => Boolean(item));
}

function sourceSnapshot(project: CoachingProject) {
  const recording = project.inputs.find(
    (input) => input.kind === "PRIMARY_RECORDING",
  )?.videoProject;
  const replay = project.inputs.find(
    (input) => input.kind === "MATCH_REPLAY",
  )?.replayPackage;
  return {
    inputMode: project.inputMode,
    recordingId: recording?.id ?? null,
    recordingDurationSeconds: recording?.durationSeconds ?? null,
    replayPackageId: replay?.id ?? null,
    replayProviderId: replay?.canonicalMatch?.sourceProviderId ?? null,
    replayProviderVersion:
      replay?.canonicalMatch?.sourceProviderVersion ?? null,
    selectedPlayerStableId: project.selectedPlayerStableId,
    selectedPlayerAlias: project.selectedPlayerAlias,
    contextUserConfirmed: project.contextUserConfirmed,
  };
}

async function ensureHumanReviewedAnalysis(
  transaction: Prisma.TransactionClient,
  project: CoachingProject,
) {
  const existing = await transaction.coachingAnalysis.findFirst({
    where: {
      studioProjectId: project.id,
      analysisVersion: COACHING_ANALYSIS_VERSION,
      status: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  const now = new Date();
  return transaction.coachingAnalysis.create({
    data: {
      studioProjectId: project.id,
      inputMode: project.inputMode,
      status: "COMPLETED",
      progress: 100,
      stage: "Human-reviewed findings ready",
      analysisVersion: COACHING_ANALYSIS_VERSION,
      ruleSetVersion: COACHING_RULE_SET_VERSION,
      sourceSnapshotJson: JSON.stringify(sourceSnapshot(project)),
      detectorVersionsJson: JSON.stringify({
        humanReview: COACHING_ANALYSIS_VERSION,
      }),
      completedRuleCount: 1,
      startedAt: now,
      completedAt: now,
    },
  });
}

function pushEvidence(
  evidence: Array<{
    evidenceClass: CoachingEvidenceClass;
    summary: string;
    sourceType: string;
    sourceId?: string;
    videoTimestampSeconds?: number;
    replayTimestampSeconds?: number;
    confidence?: number;
    observationJson?: string;
    inferenceJson?: string;
  }>,
  value: (typeof evidence)[number],
) {
  evidence.push(value);
}

export async function createHumanReviewedFinding(
  studioProjectId: string,
  input: unknown,
) {
  const value = createHumanReviewedFindingSchema.parse(input);
  const project = await requireCoachingProject(studioProjectId);
  const primaryRecording = project.inputs.find(
    (item) => item.kind === "PRIMARY_RECORDING",
  )?.videoProject;
  if (
    value.videoTimestampSeconds != null &&
    (!primaryRecording ||
      value.videoTimestampSeconds > primaryRecording.durationSeconds)
  ) {
    throw new AppError(
      primaryRecording
        ? `Choose a timestamp between 0 and ${primaryRecording.durationSeconds.toFixed(2)} seconds.`
        : "A video timestamp requires a primary screen recording.",
      400,
      "COACHING_VIDEO_TIMESTAMP_INVALID",
    );
  }

  const replayInput = project.inputs.find(
    (item) => item.kind === "MATCH_REPLAY",
  )?.replayPackage;
  const canonicalEvent = value.canonicalEventId
    ? replayInput?.canonicalMatch?.events.find(
        (event) => event.id === value.canonicalEventId,
      )
    : null;
  if (value.canonicalEventId && !canonicalEvent) {
    throw new AppError(
      "Choose a replay event from this Creator Studio project.",
      400,
      "COACHING_REPLAY_EVENT_MISMATCH",
    );
  }
  if (
    canonicalEvent &&
    !["VALIDATED", "USER_CONFIRMED", "USER_CORRECTED"].includes(
      canonicalEvent.validationStatus,
    )
  ) {
    throw new AppError(
      "That replay event is not validated enough to store as a replay-confirmed fact.",
      409,
      "COACHING_REPLAY_EVENT_UNVERIFIED",
    );
  }

  const transcriptSegment = value.transcriptSegmentId
    ? primaryRecording?.transcriptionJobs
        .flatMap((job) => job.segments)
        .find((segment) => segment.id === value.transcriptSegmentId)
    : null;
  if (value.transcriptSegmentId && !transcriptSegment) {
    throw new AppError(
      "Choose a saved transcript line from this project's primary recording.",
      400,
      "COACHING_TRANSCRIPT_SEGMENT_MISMATCH",
    );
  }

  const directObservations = value.directObservation
    ? [value.directObservation]
    : [];
  const replayFacts = canonicalEvent
    ? [summarizeCanonicalEvent(canonicalEvent)]
    : [];
  const transcriptEvidence = transcriptSegment
    ? [
        `Transcript at ${transcriptSegment.startSeconds.toFixed(2)}s: “${transcriptSegment.text}”`,
      ]
    : [];
  const mapEvidence = mapEvidenceForProject(project);
  const missingContext = [
    ...(value.missingContext ? [value.missingContext] : []),
    ...(canonicalEvent
      ? parseStringArray(canonicalEvent.missingEvidenceJson)
      : []),
  ];
  if (
    [
      "POSSIBLE_BAD_POSITIONING",
      "ROTATION_ISSUE",
      "POSSIBLE_FLANK_EXPOSURE",
      "LINE_OF_SIGHT_ISSUE",
      "POSSIBLE_WRONG_ANGLE",
    ].includes(value.category) &&
    !missingContext.some((item) =>
      /position|room|geometry|line|angle/i.test(item),
    )
  ) {
    missingContext.push(
      "Validated position, room geometry, teammate coverage, and player intention are not established.",
    );
  }
  if (
    [
      "POSSIBLE_UNNECESSARY_REPEEK",
      "CROSSHAIR_PLACEMENT_ISSUE",
      "GOOD_CROSSHAIR_DISCIPLINE",
      "STRONG_PATIENCE",
    ].includes(value.category) &&
    !value.directObservation
  ) {
    missingContext.push(
      "No human-reviewed gameplay-pixel observation supports this visual category.",
    );
  }

  const inferenceText = value.inference
    ? `This supports a ${categoryLabel(value.category).toLowerCase()} review candidate: ${value.inference} This remains an inference, not proof of intention or mechanical cause.`
    : `The available evidence makes this ${categoryLabel(value.category).toLowerCase()} item worth human review. It does not establish intention or mechanical cause.`;
  const alternatives = value.alternativeExplanation
    ? [value.alternativeExplanation]
    : [];
  const evidence: Parameters<typeof pushEvidence>[0] = [];
  if (value.directObservation) {
    pushEvidence(evidence, {
      evidenceClass: "DIRECT_VIDEO_OBSERVATION",
      summary: value.directObservation,
      sourceType: "HUMAN_REVIEWED_RECORDING",
      sourceId: primaryRecording?.id,
      videoTimestampSeconds: value.videoTimestampSeconds ?? undefined,
      confidence: value.confidence,
      observationJson: JSON.stringify({
        userConfirmed: true,
        method: "human-reviewed-visible-observation",
      }),
    });
  }
  if (canonicalEvent) {
    pushEvidence(evidence, {
      evidenceClass: "REPLAY_CONFIRMED_FACT",
      summary: replayFacts[0] ?? "Validated replay event.",
      sourceType: "CANONICAL_REPLAY_EVENT",
      sourceId: canonicalEvent.id,
      replayTimestampSeconds: canonicalEvent.timestampSeconds ?? undefined,
      confidence: clampConfidence(canonicalEvent.confidenceStatus),
      observationJson: canonicalEvent.directObservationJson,
    });
  }
  if (transcriptSegment) {
    pushEvidence(evidence, {
      evidenceClass: "TRANSCRIPT_EVIDENCE",
      summary: transcriptEvidence[0] ?? transcriptSegment.text,
      sourceType: "TRANSCRIPT_SEGMENT",
      sourceId: transcriptSegment.id,
      videoTimestampSeconds: transcriptSegment.startSeconds,
      confidence: 0.6,
      observationJson: JSON.stringify({
        text: transcriptSegment.text,
        startSeconds: transcriptSegment.startSeconds,
        endSeconds: transcriptSegment.endSeconds,
        limitation: "Transcript language is supporting evidence only.",
      }),
    });
  }
  for (const summary of mapEvidence) {
    pushEvidence(evidence, {
      evidenceClass: "USER_CONFIRMED_MAP_CONTEXT",
      summary,
      sourceType: "STUDIO_PROJECT_CONTEXT",
      sourceId: project.id,
      confidence: 1,
      observationJson: JSON.stringify({ userConfirmed: true }),
    });
  }
  if (value.inference) {
    pushEvidence(evidence, {
      evidenceClass: "INFERENCE",
      summary: value.inference,
      sourceType: "HUMAN_COACHING_INFERENCE",
      confidence: value.confidence,
      inferenceJson: JSON.stringify({
        statement: value.inference,
        isInference: true,
      }),
    });
  }
  for (const summary of missingContext) {
    pushEvidence(evidence, {
      evidenceClass: "MISSING_CONTEXT",
      summary,
      sourceType: "CAPABILITY_BOUNDARY",
    });
  }

  await db.$transaction(async (transaction) => {
    const analysis = await ensureHumanReviewedAnalysis(transaction, project);
    await transaction.coachingFinding.create({
      data: {
        studioProjectId,
        analysisId: analysis.id,
        canonicalRoundId: canonicalEvent?.round?.id ?? null,
        canonicalEventId: canonicalEvent?.id ?? null,
        originalCategory: value.category,
        category: value.category,
        originalSeverity: value.severity,
        severity: value.severity,
        confidence: value.confidence,
        roundIndex: canonicalEvent?.round?.roundIndex ?? null,
        originalVideoTimestampSeconds: value.videoTimestampSeconds ?? null,
        videoTimestampSeconds: value.videoTimestampSeconds ?? null,
        replayTimestampSeconds: canonicalEvent?.timestampSeconds ?? null,
        directObservationsJson: JSON.stringify(directObservations),
        replayFactsJson: JSON.stringify(replayFacts),
        transcriptEvidenceJson: JSON.stringify(transcriptEvidence),
        mapEvidenceJson: JSON.stringify(mapEvidence),
        supportingFramesJson: "[]",
        conflictingEvidenceJson: canonicalEvent
          ? canonicalEvent.conflictingEvidenceJson
          : "[]",
        missingContextJson: JSON.stringify(missingContext),
        explanation: inferenceText,
        alternativeExplanationsJson: JSON.stringify(alternatives),
        detectorVersionsJson: JSON.stringify({
          humanReview: COACHING_ANALYSIS_VERSION,
          replayProvider: replayInput?.canonicalMatch
            ? `${replayInput.canonicalMatch.sourceProviderId}@${replayInput.canonicalMatch.sourceProviderVersion}`
            : null,
        }),
        analysisVersion: COACHING_ANALYSIS_VERSION,
        coachNote: value.coachNote ?? null,
        evidence: {
          create: evidence,
        },
      },
    });
  });

  return getCoachingState(studioProjectId);
}

export async function updateCoachingFinding(
  studioProjectId: string,
  findingId: string,
  input: unknown,
) {
  const value = updateCoachingFindingSchema.parse(input);
  const project = await requireCoachingProject(studioProjectId);
  const finding = project.coachingFindings.find(
    (item) => item.id === findingId,
  );
  if (!finding) {
    throw new AppError(
      "That coaching finding no longer exists in this project.",
      404,
      "COACHING_FINDING_NOT_FOUND",
    );
  }
  const recording = project.inputs.find(
    (item) => item.kind === "PRIMARY_RECORDING",
  )?.videoProject;
  if (
    value.videoTimestampSeconds != null &&
    (!recording || value.videoTimestampSeconds > recording.durationSeconds)
  ) {
    throw new AppError(
      recording
        ? `Choose a timestamp between 0 and ${recording.durationSeconds.toFixed(2)} seconds.`
        : "A video timestamp requires a primary screen recording.",
      400,
      "COACHING_VIDEO_TIMESTAMP_INVALID",
    );
  }

  const nextDecision = value.decision ?? finding.decision;
  const nextTimestamp =
    value.videoTimestampSeconds === undefined
      ? finding.videoTimestampSeconds
      : value.videoTimestampSeconds;
  const nextSeverity = value.severity ?? finding.severity;
  const nextCategory = value.category ?? finding.category;

  await db.$transaction([
    db.coachingFinding.update({
      where: { id: finding.id },
      data: {
        decision: nextDecision,
        videoTimestampSeconds: nextTimestamp,
        severity: nextSeverity,
        category: nextCategory,
        coachNote:
          value.coachNote === undefined ? finding.coachNote : value.coachNote,
        futurePractice: value.futurePractice ?? finding.futurePractice,
      },
    }),
    db.coachingFindingFeedback.create({
      data: {
        findingId: finding.id,
        decision: nextDecision,
        previousDecision: finding.decision,
        correctedVideoTimestamp:
          value.videoTimestampSeconds === undefined
            ? null
            : value.videoTimestampSeconds,
        previousVideoTimestamp:
          value.videoTimestampSeconds === undefined
            ? null
            : finding.videoTimestampSeconds,
        correctedSeverity: value.severity ?? null,
        previousSeverity: value.severity ? finding.severity : null,
        correctedCategory: value.category ?? null,
        previousCategory: value.category ? finding.category : null,
        note: value.coachNote ?? null,
        futurePractice: value.futurePractice,
      },
    }),
  ]);
  return getCoachingState(studioProjectId);
}

export async function deleteCoachingFinding(
  studioProjectId: string,
  findingId: string,
) {
  const finding = await db.coachingFinding.findFirst({
    where: { id: findingId, studioProjectId },
    select: { id: true },
  });
  if (!finding) {
    throw new AppError(
      "That coaching finding no longer exists in this project.",
      404,
      "COACHING_FINDING_NOT_FOUND",
    );
  }
  await db.coachingFinding.delete({ where: { id: finding.id } });
  return getCoachingState(studioProjectId);
}

export type CoachingState = Awaited<ReturnType<typeof getCoachingState>>;
