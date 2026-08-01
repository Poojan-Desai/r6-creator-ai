import type {
  PlayerPracticeGoalStatus,
  ProgressMetricAvailability,
  StudioInputMode,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const PLAYER_PROGRESS_METRIC_VERSION = "u7-transparent-progress-v1";
export const PLAYER_PROGRESS_COMPARISON_VERSION =
  "u7-first-five-latest-five-v1";

const validatedEvidence = new Set([
  "VALIDATED",
  "USER_CONFIRMED",
  "USER_CORRECTED",
]);

export const createPlayerProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    preferredAlias: z.string().trim().min(1).max(100).nullable().optional(),
    notes: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict();

export const updatePlayerProfileSchema = createPlayerProfileSchema
  .partial()
  .extend({
    selectedPlayerStableIds: z
      .array(z.string().trim().min(1).max(191))
      .max(100)
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Choose at least one profile change.",
  });

export const progressSnapshotFilterSchema = z
  .object({
    inputMode: z
      .enum([
        "SCREEN_RECORDING_ONLY",
        "MATCH_REPLAY_ONLY",
        "SCREEN_RECORDING_AND_REPLAY",
      ])
      .nullable()
      .default(null),
    map: z.string().trim().min(1).max(150).nullable().default(null),
    operator: z.string().trim().min(1).max(150).nullable().default(null),
    side: z.enum(["ATTACK", "DEFENSE"]).nullable().default(null),
  })
  .strict();

export const createProgressSnapshotSchema = z
  .object({
    playerProfileId: z.string().trim().min(1).max(191),
    projectIds: z.array(z.string().trim().min(1).max(191)).min(1).max(500),
    reason: z.string().trim().min(1).max(500),
    filters: progressSnapshotFilterSchema.default({
      inputMode: null,
      map: null,
      operator: null,
      side: null,
    }),
  })
  .strict();

export const createProgressNoteSchema = z
  .object({
    playerProfileId: z.string().trim().min(1).max(191),
    snapshotId: z.string().trim().min(1).max(191).nullable().optional(),
    studioProjectId: z.string().trim().min(1).max(191).nullable().optional(),
    text: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const createPlayerPracticeGoalSchema = z
  .object({
    playerProfileId: z.string().trim().min(1).max(191),
    snapshotId: z.string().trim().min(1).max(191).nullable().optional(),
    sourceDrillId: z.string().trim().min(1).max(191).nullable().optional(),
    name: z.string().trim().min(1).max(150),
    measurableGoal: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const updatePlayerPracticeGoalSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    measurableGoal: z.string().trim().min(1).max(1_000).optional(),
    status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Choose at least one practice-goal change.",
  });

type ProgressEvent = {
  category: string;
  roundId: string | null;
  actorStableId: string | null;
  targetStableId: string | null;
  validationStatus: string;
  directObservation: Record<string, unknown>;
};

type ProgressFinding = {
  category: string;
  decision: string;
  severity: string;
  confidence: number;
  analysisVersion: string;
};

type ProgressMeasurement = {
  kind: string;
  value: number | null;
  methodVersion: string;
  userConfirmed: boolean;
  findingDecision: string | null;
};

export type ProgressSourceProject = {
  id: string;
  name: string;
  createdAt: string;
  inputMode: StudioInputMode;
  selectedPlayerStableId: string | null;
  selectedPlayerAlias: string | null;
  side: "UNKNOWN" | "ATTACK" | "DEFENSE";
  contextUserConfirmed: boolean;
  map: string | null;
  operator: string | null;
  match: {
    id: string;
    map: string | null;
    mode: string | null;
    providerId: string;
    providerVersion: string;
    validationStatus: string;
    selectedPlayerOperator: string | null;
    events: ProgressEvent[];
  } | null;
  findings: ProgressFinding[];
  measurements: ProgressMeasurement[];
  drills: Array<{ completed: boolean; name: string; measurableGoal: string }>;
};

export type ProgressMetricResult = {
  key: string;
  label: string;
  metricGroup: string;
  value: number | null;
  unit: string;
  sampleSize: number;
  availability: ProgressMetricAvailability;
  confidence: number | null;
  explanation: string;
  evidenceClass: string;
  sourceVersions: string[];
  sourceEvidence: string[];
};

type MetricOptions = Omit<
  ProgressMetricResult,
  "availability" | "sourceVersions" | "sourceEvidence"
> & {
  availability?: ProgressMetricAvailability;
  sourceVersions?: string[];
  sourceEvidence?: string[];
};

function metric(options: MetricOptions): ProgressMetricResult {
  return {
    ...options,
    availability:
      options.availability ??
      (options.sampleSize > 0 ? "AVAILABLE" : "UNAVAILABLE"),
    sourceVersions: [...new Set(options.sourceVersions ?? [])],
    sourceEvidence: [...new Set(options.sourceEvidence ?? [])],
  };
}

function parseRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function numericMeasurement(
  value: string,
  preferredKeys: string[],
): number | null {
  const record = parseRecord(value);
  for (const key of preferredKeys) {
    const candidate = record[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return null;
}

function sourceVersions(projects: ProgressSourceProject[]) {
  return [
    PLAYER_PROGRESS_METRIC_VERSION,
    ...projects.flatMap((project) =>
      project.match
        ? [`${project.match.providerId}@${project.match.providerVersion}`]
        : [],
    ),
    ...projects.flatMap((project) =>
      project.findings.map((finding) => finding.analysisVersion),
    ),
    ...projects.flatMap((project) =>
      project.measurements.map((measurement) => measurement.methodVersion),
    ),
  ];
}

function selectedEvents(project: ProgressSourceProject) {
  if (!project.match || !project.selectedPlayerStableId) return [];
  return project.match.events.filter((event) =>
    validatedEvidence.has(event.validationStatus),
  );
}

function firstKillByRound(events: ProgressEvent[]) {
  const first = new Map<string, ProgressEvent>();
  for (const event of events.filter(
    (item) => item.category === "KILL" && item.roundId,
  )) {
    const roundId = event.roundId!;
    const remaining = event.directObservation.roundClockSecondsRemaining;
    const current = first.get(roundId);
    const currentRemaining =
      current?.directObservation.roundClockSecondsRemaining;
    if (
      !current ||
      (typeof remaining === "number" &&
        (typeof currentRemaining !== "number" || remaining > currentRemaining))
    ) {
      first.set(roundId, event);
    }
  }
  return [...first.values()];
}

function acceptedDecision(decision: string) {
  return decision === "ACCEPTED" || decision === "GOOD_OBSERVATION";
}

export function calculateProgressMetrics(
  projects: ProgressSourceProject[],
  noteCount = 0,
  practiceGoalCount = 0,
): ProgressMetricResult[] {
  const versions = sourceVersions(projects);
  const matches = projects.filter(
    (project) =>
      project.match &&
      validatedEvidence.has(project.match.validationStatus) &&
      project.selectedPlayerStableId,
  );
  const events = matches.flatMap((project) => selectedEvents(project));
  const playerIds = new Set(
    matches
      .map((project) => project.selectedPlayerStableId)
      .filter((value): value is string => Boolean(value)),
  );
  const kills = events.filter(
    (event) =>
      event.category === "KILL" &&
      event.actorStableId &&
      playerIds.has(event.actorStableId),
  );
  const likelyDeaths = events.filter(
    (event) =>
      event.category === "KILL" &&
      event.targetStableId &&
      playerIds.has(event.targetStableId),
  );
  const openingEvents = matches.flatMap((project) =>
    firstKillByRound(selectedEvents(project)),
  );
  const openingKills = openingEvents.filter(
    (event) => event.actorStableId && playerIds.has(event.actorStableId),
  );
  const openingDeaths = openingEvents.filter(
    (event) => event.targetStableId && playerIds.has(event.targetStableId),
  );
  const headshots = kills.filter(
    (event) => event.directObservation.headshot === true,
  );
  const defuserEvents = events.filter(
    (event) =>
      (event.category === "DEFUSER_PLANT" ||
        event.category === "DEFUSER_DISABLE") &&
      event.actorStableId &&
      playerIds.has(event.actorStableId),
  );
  const findings = projects.flatMap((project) => project.findings);
  const accepted = findings.filter((finding) =>
    acceptedDecision(finding.decision),
  );
  const rejected = findings.filter(
    (finding) =>
      finding.decision === "REJECTED" || finding.decision === "WRONG_CATEGORY",
  );
  const repeek = accepted.filter(
    (finding) => finding.category === "POSSIBLE_UNNECESSARY_REPEEK",
  );
  const earlyDeaths = accepted.filter(
    (finding) => finding.category === "EARLY_ROUND_DEATH",
  );
  const priorities = findings.filter(
    (finding) =>
      finding.severity === "HIGH" &&
      finding.decision !== "REJECTED" &&
      finding.decision !== "WRONG_CATEGORY",
  );
  const correctionMeasurements = projects
    .flatMap((project) => project.measurements)
    .filter(
      (measurement) =>
        measurement.kind === "CROSSHAIR_CORRECTION" &&
        measurement.value !== null &&
        measurement.findingDecision !== "REJECTED" &&
        measurement.findingDecision !== "WRONG_CATEGORY",
    );
  const averageCorrection =
    correctionMeasurements.length > 0
      ? correctionMeasurements.reduce(
          (total, measurement) => total + (measurement.value ?? 0),
          0,
        ) / correctionMeasurements.length
      : null;
  const maps = new Set(
    matches
      .map((project) => project.match?.map ?? project.map)
      .filter((value): value is string => Boolean(value)),
  );
  const operators = new Set(
    matches
      .map(
        (project) => project.match?.selectedPlayerOperator ?? project.operator,
      )
      .filter((value): value is string => Boolean(value)),
  );
  const sides = projects.filter(
    (project) => project.contextUserConfirmed && project.side !== "UNKNOWN",
  );
  const completedDrills = projects
    .flatMap((project) => project.drills)
    .filter((drill) => drill.completed);

  const supportedMatchEvidence = matches.map(
    (project) =>
      `${project.name}: ${project.match!.providerId}@${project.match!.providerVersion}, ${project.match!.validationStatus}`,
  );
  const unavailableComparison =
    matches.length < 2 ? "INSUFFICIENT_SAMPLE" : "AVAILABLE";

  return [
    metric({
      key: "match_count",
      label: "Supported matches",
      metricGroup: "MATCHES",
      value: matches.length,
      unit: "matches",
      sampleSize: matches.length,
      confidence: matches.length ? 1 : null,
      explanation:
        matches.length > 0
          ? "Counts linked matches with validated/user-confirmed replay evidence and an explicitly selected player."
          : "No linked validated Match Replay with an explicitly selected player is available.",
      evidenceClass: "VERIFIED_REPLAY_FACT",
      sourceVersions: versions,
      sourceEvidence: supportedMatchEvidence,
    }),
    metric({
      key: "distinct_maps",
      label: "Maps represented",
      metricGroup: "MATCHES",
      value: maps.size,
      unit: "maps",
      sampleSize: matches.length,
      confidence: matches.length ? 1 : null,
      explanation: "Distinct map names from supported linked matches.",
      evidenceClass: "VERIFIED_REPLAY_FACT",
      sourceVersions: versions,
      sourceEvidence: [...maps],
    }),
    metric({
      key: "distinct_operators",
      label: "Selected-player operators represented",
      metricGroup: "MATCHES",
      value: operators.size,
      unit: "operators",
      sampleSize: operators.size,
      confidence: operators.size ? 1 : null,
      explanation:
        operators.size > 0
          ? "Distinct operator fields linked to the explicitly selected replay player."
          : "No supported selected-player operator field is available.",
      evidenceClass: "VERIFIED_REPLAY_FACT",
      sourceVersions: versions,
      sourceEvidence: [...operators],
    }),
    metric({
      key: "attack_projects",
      label: "User-confirmed attack projects",
      metricGroup: "SIDES",
      value: sides.filter((project) => project.side === "ATTACK").length,
      unit: "projects",
      sampleSize: sides.length,
      confidence: sides.length ? 1 : null,
      availability: sides.length ? "AVAILABLE" : "UNAVAILABLE",
      explanation:
        sides.length > 0
          ? "Uses only project side values explicitly marked user-confirmed."
          : "Attack/defense was not user-confirmed on the selected projects.",
      evidenceClass: "USER_CONFIRMED_CONTEXT",
      sourceVersions: versions,
      sourceEvidence: sides.map(
        (project) => `${project.name}: ${project.side.toLowerCase()}`,
      ),
    }),
    metric({
      key: "defense_projects",
      label: "User-confirmed defense projects",
      metricGroup: "SIDES",
      value: sides.filter((project) => project.side === "DEFENSE").length,
      unit: "projects",
      sampleSize: sides.length,
      confidence: sides.length ? 1 : null,
      availability: sides.length ? "AVAILABLE" : "UNAVAILABLE",
      explanation:
        sides.length > 0
          ? "Uses only project side values explicitly marked user-confirmed."
          : "Attack/defense was not user-confirmed on the selected projects.",
      evidenceClass: "USER_CONFIRMED_CONTEXT",
      sourceVersions: versions,
      sourceEvidence: sides.map(
        (project) => `${project.name}: ${project.side.toLowerCase()}`,
      ),
    }),
    metric({
      key: "kills",
      label: "Supported selected-player kills",
      metricGroup: "REPLAY_EVENTS",
      value: kills.length,
      unit: "events",
      sampleSize: events.length,
      confidence: matches.length ? 1 : null,
      explanation:
        "Counts direct validated kill feedback whose actor is the explicitly selected player.",
      evidenceClass: "VERIFIED_REPLAY_FACT",
      sourceVersions: versions,
      sourceEvidence: supportedMatchEvidence,
    }),
    metric({
      key: "likely_deaths",
      label: "Likely deaths from kill-target feedback",
      metricGroup: "REPLAY_EVENTS",
      value: likelyDeaths.length,
      unit: "events",
      sampleSize: events.length,
      confidence: matches.length ? 0.8 : null,
      explanation:
        "Infers a likely death when direct kill feedback names the selected player as the target. The provider does not expose a separate validated death stream.",
      evidenceClass: "INFERENCE",
      sourceVersions: versions,
      sourceEvidence: supportedMatchEvidence,
    }),
    metric({
      key: "opening_kills",
      label: "Supported opening kills",
      metricGroup: "REPLAY_EVENTS",
      value: openingKills.length,
      unit: "rounds",
      sampleSize: openingEvents.length,
      confidence: openingEvents.length ? 0.85 : null,
      availability: openingEvents.length ? "AVAILABLE" : "UNAVAILABLE",
      explanation:
        "Uses the earliest direct kill feedback by observed remaining round clock. It does not convert that clock into an elapsed video timestamp.",
      evidenceClass: "VERIFIED_REPLAY_FACT",
      sourceVersions: versions,
      sourceEvidence: supportedMatchEvidence,
    }),
    metric({
      key: "opening_deaths",
      label: "Likely opening deaths",
      metricGroup: "REPLAY_EVENTS",
      value: openingDeaths.length,
      unit: "rounds",
      sampleSize: openingEvents.length,
      confidence: openingEvents.length ? 0.75 : null,
      availability: openingEvents.length ? "AVAILABLE" : "UNAVAILABLE",
      explanation:
        "Uses the earliest kill-target feedback by observed remaining round clock. The death interpretation remains an inference.",
      evidenceClass: "INFERENCE",
      sourceVersions: versions,
      sourceEvidence: supportedMatchEvidence,
    }),
    metric({
      key: "headshots",
      label: "Supported selected-player headshot flags",
      metricGroup: "REPLAY_EVENTS",
      value: headshots.length,
      unit: "events",
      sampleSize: kills.length,
      confidence: kills.length ? 1 : null,
      explanation:
        "Counts direct headshot flags attached to supported selected-player kill feedback.",
      evidenceClass: "VERIFIED_REPLAY_FACT",
      sourceVersions: versions,
      sourceEvidence: supportedMatchEvidence,
    }),
    metric({
      key: "defuser_involvement",
      label: "Supported defuser involvement",
      metricGroup: "REPLAY_EVENTS",
      value: defuserEvents.length,
      unit: "events",
      sampleSize: events.length,
      confidence: matches.length ? 1 : null,
      explanation:
        "Counts direct defuser plant/disable feedback whose actor is the explicitly selected player.",
      evidenceClass: "VERIFIED_REPLAY_FACT",
      sourceVersions: versions,
      sourceEvidence: supportedMatchEvidence,
    }),
    metric({
      key: "accepted_findings",
      label: "Accepted or good-observation findings",
      metricGroup: "COACHING_REVIEW",
      value: accepted.length,
      unit: "findings",
      sampleSize: findings.length,
      confidence: findings.length ? 1 : null,
      explanation:
        "Counts explicit local review decisions. Acceptance does not prove the explanation or tactical cause.",
      evidenceClass: "USER_CONFIRMED_CONTEXT",
      sourceVersions: versions,
      sourceEvidence: accepted.map(
        (finding) => `${finding.category}: ${finding.decision}`,
      ),
    }),
    metric({
      key: "rejected_findings",
      label: "Rejected or wrong-category findings",
      metricGroup: "COACHING_REVIEW",
      value: rejected.length,
      unit: "findings",
      sampleSize: findings.length,
      confidence: findings.length ? 1 : null,
      explanation:
        "Counts explicit rejected or wrong-category review decisions. Rejected findings remain in history.",
      evidenceClass: "USER_CONFIRMED_CONTEXT",
      sourceVersions: versions,
      sourceEvidence: rejected.map(
        (finding) => `${finding.category}: ${finding.decision}`,
      ),
    }),
    metric({
      key: "accepted_repeek_findings",
      label: "Accepted possible re-peek findings",
      metricGroup: "COACHING_TRENDS",
      value: repeek.length,
      unit: "findings",
      sampleSize: accepted.length,
      confidence: accepted.length ? 1 : null,
      availability: accepted.length ? "AVAILABLE" : "INSUFFICIENT_SAMPLE",
      explanation:
        "Counts accepted possible re-peek findings. It does not prove a tactical trend or improvement.",
      evidenceClass: "USER_CONFIRMED_CONTEXT",
      sourceVersions: versions,
      sourceEvidence: repeek.map(
        (finding) => `${finding.analysisVersion}: accepted possible re-peek`,
      ),
    }),
    metric({
      key: "average_crosshair_correction",
      label: "Reviewed crosshair correction distance",
      metricGroup: "COACHING_TRENDS",
      value: averageCorrection,
      unit: "normalized frame distance",
      sampleSize: correctionMeasurements.length,
      confidence: correctionMeasurements.length ? 0.75 : null,
      availability:
        correctionMeasurements.length >= 2
          ? "AVAILABLE"
          : correctionMeasurements.length === 1
            ? "INSUFFICIENT_SAMPLE"
            : "UNAVAILABLE",
      explanation:
        correctionMeasurements.length > 0
          ? "Average of non-rejected user-marked crosshair-correction measurements. At least two measurements are required before showing it as available."
          : "No non-rejected user-marked crosshair-correction measurement is available.",
      evidenceClass: "DIRECT_VIDEO_OBSERVATION",
      sourceVersions: versions,
      sourceEvidence: correctionMeasurements.map(
        (measurement) => `${measurement.methodVersion}: ${measurement.value}`,
      ),
    }),
    metric({
      key: "accepted_early_death_findings",
      label: "Accepted early-death findings",
      metricGroup: "COACHING_TRENDS",
      value: earlyDeaths.length,
      unit: "findings",
      sampleSize: accepted.length,
      confidence: accepted.length ? 1 : null,
      availability: accepted.length ? "AVAILABLE" : "INSUFFICIENT_SAMPLE",
      explanation:
        "Counts explicit accepted early-round-death findings. A count change alone does not prove improvement.",
      evidenceClass: "USER_CONFIRMED_CONTEXT",
      sourceVersions: versions,
      sourceEvidence: earlyDeaths.map(
        (finding) => `${finding.analysisVersion}: accepted early death`,
      ),
    }),
    metric({
      key: "high_priority_reviews",
      label: "Current high-priority reviews",
      metricGroup: "COACHING_REVIEW",
      value: priorities.length,
      unit: "findings",
      sampleSize: findings.length,
      confidence: findings.length ? 1 : null,
      explanation:
        "Counts high-severity findings not rejected or marked wrong-category. Severity is a review aid, not a performance grade.",
      evidenceClass: "USER_CONFIRMED_CONTEXT",
      sourceVersions: versions,
      sourceEvidence: priorities.map(
        (finding) => `${finding.category}: ${finding.decision}`,
      ),
    }),
    metric({
      key: "completed_drills",
      label: "Completed practice drills",
      metricGroup: "PRACTICE",
      value: completedDrills.length,
      unit: "drills",
      sampleSize: projects.flatMap((project) => project.drills).length,
      confidence: 1,
      explanation:
        "Counts drills explicitly marked completed. Completion does not prove the skill improved.",
      evidenceClass: "USER_CONFIRMED_CONTEXT",
      sourceVersions: versions,
      sourceEvidence: completedDrills.map((drill) => drill.name),
    }),
    metric({
      key: "active_practice_goals",
      label: "Saved active practice goals",
      metricGroup: "PRACTICE",
      value: practiceGoalCount,
      unit: "goals",
      sampleSize: practiceGoalCount,
      confidence: 1,
      explanation:
        "Counts locally saved active goals. A goal is a user plan, not an observed outcome.",
      evidenceClass: "USER_CONFIRMED_CONTEXT",
      sourceVersions: versions,
      sourceEvidence: [],
    }),
    metric({
      key: "user_notes",
      label: "Saved progress notes",
      metricGroup: "PRACTICE",
      value: noteCount,
      unit: "notes",
      sampleSize: noteCount,
      confidence: 1,
      explanation:
        "Counts explicit local notes. Notes are user context and are not automatic evidence.",
      evidenceClass: "USER_CONFIRMED_CONTEXT",
      sourceVersions: versions,
      sourceEvidence: [],
    }),
    metric({
      key: "comparison_readiness",
      label: "First-five/latest-five comparison sample",
      metricGroup: "COMPARISON",
      value: matches.length,
      unit: "supported matches",
      sampleSize: matches.length,
      confidence: null,
      availability: unavailableComparison,
      explanation:
        matches.length < 2
          ? "At least two supported matches are needed to show any change, and five per window are preferred."
          : "Changes can be compared, but correlation does not prove improvement.",
      evidenceClass: "CAPABILITY_BOUNDARY",
      sourceVersions: [
        PLAYER_PROGRESS_METRIC_VERSION,
        PLAYER_PROGRESS_COMPARISON_VERSION,
      ],
      sourceEvidence: supportedMatchEvidence,
    }),
  ];
}

function projectMatchesFilters(
  project: ProgressSourceProject,
  filters: z.infer<typeof progressSnapshotFilterSchema>,
) {
  if (filters.inputMode && project.inputMode !== filters.inputMode)
    return false;
  const projectMap = project.match?.map ?? project.map;
  if (filters.map && projectMap?.toLowerCase() !== filters.map.toLowerCase()) {
    return false;
  }
  const projectOperator =
    project.match?.selectedPlayerOperator ?? project.operator;
  if (
    filters.operator &&
    projectOperator?.toLowerCase() !== filters.operator.toLowerCase()
  ) {
    return false;
  }
  if (
    filters.side &&
    (!project.contextUserConfirmed || project.side !== filters.side)
  ) {
    return false;
  }
  return true;
}

function serializeMetric(metricResult: ProgressMetricResult) {
  return {
    key: metricResult.key,
    label: metricResult.label,
    metricGroup: metricResult.metricGroup,
    value: metricResult.value,
    unit: metricResult.unit,
    sampleSize: metricResult.sampleSize,
    availability: metricResult.availability,
    confidence: metricResult.confidence,
    explanation: metricResult.explanation,
    evidenceClass: metricResult.evidenceClass,
    sourceVersionsJson: JSON.stringify(metricResult.sourceVersions),
    sourceEvidenceJson: JSON.stringify(metricResult.sourceEvidence),
  };
}

const comparisonMetricKeys = new Set([
  "match_count",
  "kills",
  "likely_deaths",
  "opening_kills",
  "opening_deaths",
  "headshots",
  "defuser_involvement",
  "accepted_findings",
  "rejected_findings",
  "accepted_repeek_findings",
  "average_crosshair_correction",
  "accepted_early_death_findings",
  "completed_drills",
]);

function windowMetrics(
  projects: ProgressSourceProject[],
  prefix: "first_five" | "latest_five",
  label: "First five" | "Latest five",
) {
  return calculateProgressMetrics(projects)
    .filter((item) => comparisonMetricKeys.has(item.key))
    .map((item): ProgressMetricResult => ({
      ...item,
      key: `${prefix}.${item.key}`,
      label: `${label} · ${item.label}`,
      metricGroup: prefix === "first_five" ? "FIRST_FIVE" : "LATEST_FIVE",
      availability:
        item.availability === "UNAVAILABLE"
          ? "UNAVAILABLE"
          : projects.length < 5
            ? "INSUFFICIENT_SAMPLE"
            : item.availability,
      explanation: `${item.explanation} This window contains ${projects.length} selected project${projects.length === 1 ? "" : "s"}; five are preferred.`,
    }));
}

export async function loadProgressSourceProjects(projectIds?: string[]) {
  const projects = await db.studioProject.findMany({
    where: projectIds ? { id: { in: projectIds } } : undefined,
    orderBy: { createdAt: "asc" },
    include: {
      map: { select: { name: true } },
      operator: { select: { displayName: true } },
      inputs: {
        include: {
          replayPackage: {
            include: {
              canonicalMatch: {
                include: {
                  players: true,
                  events: {
                    include: {
                      actorPlayer: { select: { stableId: true } },
                      targetPlayer: { select: { stableId: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      coachingFindings: true,
      coachingMeasurements: { include: { finding: true } },
      coachingDrills: true,
    },
  });
  return projects.map((project): ProgressSourceProject => {
    const match =
      project.inputs.find((input) => input.kind === "MATCH_REPLAY")
        ?.replayPackage?.canonicalMatch ?? null;
    const selectedPlayer = match?.players.find(
      (player) => player.stableId === project.selectedPlayerStableId,
    );
    return {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt.toISOString(),
      inputMode: project.inputMode,
      selectedPlayerStableId: project.selectedPlayerStableId,
      selectedPlayerAlias: project.selectedPlayerAlias,
      side: project.side,
      contextUserConfirmed: project.contextUserConfirmed,
      map: project.map?.name ?? null,
      operator: project.operator?.displayName ?? null,
      match: match
        ? {
            id: match.id,
            map: match.mapName,
            mode: match.gameMode,
            providerId: match.sourceProviderId,
            providerVersion: match.sourceProviderVersion,
            validationStatus: match.validationStatus,
            selectedPlayerOperator: selectedPlayer?.operatorName ?? null,
            events: match.events.map((event) => ({
              category: event.category,
              roundId: event.roundId,
              actorStableId: event.actorPlayer?.stableId ?? null,
              targetStableId: event.targetPlayer?.stableId ?? null,
              validationStatus: event.validationStatus,
              directObservation: parseRecord(event.directObservationJson),
            })),
          }
        : null,
      findings: project.coachingFindings.map((finding) => ({
        category: finding.category,
        decision: finding.decision,
        severity: finding.severity,
        confidence: finding.confidence,
        analysisVersion: finding.analysisVersion,
      })),
      measurements: project.coachingMeasurements.map((measurement) => ({
        kind: measurement.kind,
        value: numericMeasurement(measurement.measurementsJson, [
          "normalizedDistance",
          "correctionDistance",
          "distance",
          "value",
        ]),
        methodVersion: measurement.methodVersion,
        userConfirmed: measurement.userConfirmed,
        findingDecision: measurement.finding?.decision ?? null,
      })),
      drills: project.coachingDrills.map((drill) => ({
        completed: drill.completed,
        name: drill.name,
        measurableGoal: drill.measurableGoal,
      })),
    };
  });
}

function parseJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeSavedMetric(metricRecord: {
  id: string;
  key: string;
  label: string;
  metricGroup: string;
  value: number | null;
  unit: string;
  sampleSize: number;
  availability: ProgressMetricAvailability;
  confidence: number | null;
  explanation: string;
  evidenceClass: string;
  sourceVersionsJson: string;
  sourceEvidenceJson: string;
}) {
  return {
    ...metricRecord,
    sourceVersions: parseJsonArray(metricRecord.sourceVersionsJson),
    sourceEvidence: parseJsonArray(metricRecord.sourceEvidenceJson),
  };
}

export async function getProgressState() {
  const [profiles, availableProjects] = await Promise.all([
    db.playerProfile.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        snapshots: {
          orderBy: { version: "desc" },
          include: {
            metrics: { orderBy: [{ metricGroup: "asc" }, { key: "asc" }] },
            projectLinks: {
              orderBy: { sortOrder: "asc" },
              include: {
                studioProject: { select: { id: true, name: true } },
              },
            },
          },
        },
        progressNotes: { orderBy: { createdAt: "desc" } },
        practiceGoals: { orderBy: { createdAt: "desc" } },
      },
    }),
    loadProgressSourceProjects(),
  ]);
  return {
    metricVersion: PLAYER_PROGRESS_METRIC_VERSION,
    comparisonVersion: PLAYER_PROGRESS_COMPARISON_VERSION,
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      preferredAlias: profile.preferredAlias,
      selectedPlayerStableIds: parseJsonArray(
        profile.selectedPlayerStableIds,
      ).filter((value): value is string => typeof value === "string"),
      notes: profile.notes,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
      snapshots: profile.snapshots.map((snapshot) => ({
        id: snapshot.id,
        version: snapshot.version,
        reason: snapshot.reason,
        metricVersion: snapshot.metricVersion,
        filters: parseRecord(snapshot.filterJson),
        evidenceSummary: parseRecord(snapshot.evidenceSummaryJson),
        createdAt: snapshot.createdAt.toISOString(),
        projects: snapshot.projectLinks.map((link) => ({
          id: link.studioProject.id,
          name: link.studioProject.name,
          selectedPlayerStableId: link.selectedPlayerStableId,
          selectedPlayerAlias: link.selectedPlayerAlias,
          sourceSummary: parseRecord(link.sourceSummaryJson),
        })),
        metrics: snapshot.metrics.map(serializeSavedMetric),
      })),
      progressNotes: profile.progressNotes.map((note) => ({
        id: note.id,
        snapshotId: note.snapshotId,
        studioProjectId: note.studioProjectId,
        text: note.text,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      })),
      practiceGoals: profile.practiceGoals.map((goal) => ({
        id: goal.id,
        snapshotId: goal.snapshotId,
        sourceDrillId: goal.sourceDrillId,
        name: goal.name,
        measurableGoal: goal.measurableGoal,
        status: goal.status,
        completedAt: goal.completedAt?.toISOString() ?? null,
        createdAt: goal.createdAt.toISOString(),
        updatedAt: goal.updatedAt.toISOString(),
      })),
    })),
    availableProjects: availableProjects.map((project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      inputMode: project.inputMode,
      selectedPlayerStableId: project.selectedPlayerStableId,
      selectedPlayerAlias: project.selectedPlayerAlias,
      map: project.match?.map ?? project.map,
      operator: project.match?.selectedPlayerOperator ?? project.operator,
      side: project.contextUserConfirmed ? project.side : "UNKNOWN",
      replayEvidence: project.match
        ? `${project.match.providerId}@${project.match.providerVersion} · ${project.match.validationStatus}`
        : null,
      findingCount: project.findings.length,
      measurementCount: project.measurements.length,
      completedDrillCount: project.drills.filter((drill) => drill.completed)
        .length,
    })),
  };
}

export async function createPlayerProfile(input: unknown) {
  const value = createPlayerProfileSchema.parse(input);
  await db.playerProfile.create({
    data: {
      name: value.name,
      preferredAlias: value.preferredAlias ?? null,
      notes: value.notes ?? null,
    },
  });
  return getProgressState();
}

export async function updatePlayerProfile(profileId: string, input: unknown) {
  const value = updatePlayerProfileSchema.parse(input);
  const existing = await db.playerProfile.findUnique({
    where: { id: profileId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError(
      "That local player profile no longer exists.",
      404,
      "PLAYER_PROFILE_NOT_FOUND",
    );
  }
  await db.playerProfile.update({
    where: { id: profileId },
    data: {
      name: value.name,
      preferredAlias:
        value.preferredAlias === undefined ? undefined : value.preferredAlias,
      notes: value.notes === undefined ? undefined : value.notes,
      selectedPlayerStableIds: value.selectedPlayerStableIds
        ? JSON.stringify([...new Set(value.selectedPlayerStableIds)])
        : undefined,
    },
  });
  return getProgressState();
}

export async function deletePlayerProfile(profileId: string) {
  const existing = await db.playerProfile.findUnique({
    where: { id: profileId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError(
      "That local player profile no longer exists.",
      404,
      "PLAYER_PROFILE_NOT_FOUND",
    );
  }
  await db.playerProfile.delete({ where: { id: profileId } });
  return getProgressState();
}

export async function createProgressSnapshot(input: unknown) {
  const value = createProgressSnapshotSchema.parse(input);
  const profile = await db.playerProfile.findUnique({
    where: { id: value.playerProfileId },
    include: {
      progressNotes: { select: { id: true } },
      practiceGoals: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
  });
  if (!profile) {
    throw new AppError(
      "Choose an existing local player profile.",
      404,
      "PLAYER_PROFILE_NOT_FOUND",
    );
  }
  const uniqueProjectIds = [...new Set(value.projectIds)];
  const sourceProjects = await loadProgressSourceProjects(uniqueProjectIds);
  if (sourceProjects.length !== uniqueProjectIds.length) {
    throw new AppError(
      "One selected project no longer exists.",
      404,
      "STUDIO_PROJECT_NOT_FOUND",
    );
  }
  const filtered = sourceProjects.filter((project) =>
    projectMatchesFilters(project, value.filters),
  );
  if (!filtered.length) {
    throw new AppError(
      "No selected project matches those filters.",
      400,
      "NO_PROGRESS_PROJECTS",
    );
  }
  const metrics = [
    ...calculateProgressMetrics(
      filtered,
      profile.progressNotes.length,
      profile.practiceGoals.length,
    ),
    ...windowMetrics(filtered.slice(0, 5), "first_five", "First five"),
    ...windowMetrics(filtered.slice(-5), "latest_five", "Latest five"),
  ];
  await db.$transaction(async (transaction) => {
    const latest = await transaction.playerProgressSnapshot.aggregate({
      where: { playerProfileId: profile.id },
      _max: { version: true },
    });
    const snapshot = await transaction.playerProgressSnapshot.create({
      data: {
        playerProfileId: profile.id,
        version: (latest._max.version ?? 0) + 1,
        reason: value.reason,
        metricVersion: PLAYER_PROGRESS_METRIC_VERSION,
        filterJson: JSON.stringify(value.filters),
        evidenceSummaryJson: JSON.stringify({
          projectCount: filtered.length,
          supportedMatchCount:
            metrics.find((item) => item.key === "match_count")?.value ?? 0,
          warning:
            "Changes and correlations do not prove player improvement. Review sample sizes and evidence classes.",
          comparison:
            filtered.length >= 10
              ? "The first-five and latest-five windows are non-overlapping."
              : "The first-five and latest-five windows may overlap or contain fewer than five projects. Comparison metrics are marked insufficient.",
        }),
        projectLinks: {
          create: filtered.map((project, index) => ({
            studioProjectId: project.id,
            sortOrder: index,
            selectedPlayerStableId: project.selectedPlayerStableId,
            selectedPlayerAlias: project.selectedPlayerAlias,
            sourceSummaryJson: JSON.stringify({
              inputMode: project.inputMode,
              map: project.match?.map ?? project.map,
              operator:
                project.match?.selectedPlayerOperator ?? project.operator,
              replayProvider: project.match
                ? `${project.match.providerId}@${project.match.providerVersion}`
                : null,
              replayValidation: project.match?.validationStatus ?? null,
              findingCount: project.findings.length,
              measurementCount: project.measurements.length,
            }),
          })),
        },
        metrics: { create: metrics.map(serializeMetric) },
      },
    });
    const selectedIds = filtered
      .map((project) => project.selectedPlayerStableId)
      .filter((item): item is string => Boolean(item));
    await transaction.playerProfile.update({
      where: { id: profile.id },
      data: {
        selectedPlayerStableIds: JSON.stringify([
          ...new Set([
            ...parseJsonArray(profile.selectedPlayerStableIds).filter(
              (item): item is string => typeof item === "string",
            ),
            ...selectedIds,
          ]),
        ]),
        updatedAt: snapshot.createdAt,
      },
    });
  });
  return getProgressState();
}

export async function deleteProgressSnapshot(
  profileId: string,
  snapshotId: string,
) {
  const snapshot = await db.playerProgressSnapshot.findFirst({
    where: { id: snapshotId, playerProfileId: profileId },
    select: { id: true },
  });
  if (!snapshot) {
    throw new AppError(
      "That progress snapshot no longer exists.",
      404,
      "PROGRESS_SNAPSHOT_NOT_FOUND",
    );
  }
  await db.playerProgressSnapshot.delete({ where: { id: snapshot.id } });
  return getProgressState();
}

export async function createProgressNote(input: unknown) {
  const value = createProgressNoteSchema.parse(input);
  const profile = await db.playerProfile.findUnique({
    where: { id: value.playerProfileId },
    select: { id: true },
  });
  if (!profile) {
    throw new AppError(
      "Choose an existing local player profile.",
      404,
      "PLAYER_PROFILE_NOT_FOUND",
    );
  }
  if (value.snapshotId) {
    const snapshot = await db.playerProgressSnapshot.findFirst({
      where: {
        id: value.snapshotId,
        playerProfileId: value.playerProfileId,
      },
      select: { id: true },
    });
    if (!snapshot) {
      throw new AppError(
        "That progress snapshot does not belong to this player profile.",
        400,
        "INVALID_PROGRESS_SNAPSHOT",
      );
    }
  }
  await db.playerProgressNote.create({
    data: {
      playerProfileId: value.playerProfileId,
      snapshotId: value.snapshotId ?? null,
      studioProjectId: value.studioProjectId ?? null,
      text: value.text,
    },
  });
  return getProgressState();
}

export async function deleteProgressNote(profileId: string, noteId: string) {
  const note = await db.playerProgressNote.findFirst({
    where: { id: noteId, playerProfileId: profileId },
    select: { id: true },
  });
  if (!note) {
    throw new AppError(
      "That progress note no longer exists.",
      404,
      "PROGRESS_NOTE_NOT_FOUND",
    );
  }
  await db.playerProgressNote.delete({ where: { id: note.id } });
  return getProgressState();
}

export async function createPlayerPracticeGoal(input: unknown) {
  const value = createPlayerPracticeGoalSchema.parse(input);
  const profile = await db.playerProfile.findUnique({
    where: { id: value.playerProfileId },
    select: { id: true },
  });
  if (!profile) {
    throw new AppError(
      "Choose an existing local player profile.",
      404,
      "PLAYER_PROFILE_NOT_FOUND",
    );
  }
  await db.playerPracticeGoal.create({
    data: {
      playerProfileId: value.playerProfileId,
      snapshotId: value.snapshotId ?? null,
      sourceDrillId: value.sourceDrillId ?? null,
      name: value.name,
      measurableGoal: value.measurableGoal,
    },
  });
  return getProgressState();
}

export async function updatePlayerPracticeGoal(
  profileId: string,
  goalId: string,
  input: unknown,
) {
  const value = updatePlayerPracticeGoalSchema.parse(input);
  const goal = await db.playerPracticeGoal.findFirst({
    where: { id: goalId, playerProfileId: profileId },
    select: { id: true, status: true },
  });
  if (!goal) {
    throw new AppError(
      "That practice goal no longer exists.",
      404,
      "PLAYER_PRACTICE_GOAL_NOT_FOUND",
    );
  }
  const nextStatus = value.status as PlayerPracticeGoalStatus | undefined;
  await db.playerPracticeGoal.update({
    where: { id: goal.id },
    data: {
      name: value.name,
      measurableGoal: value.measurableGoal,
      status: nextStatus,
      completedAt:
        nextStatus === "COMPLETED"
          ? new Date()
          : nextStatus === "ACTIVE"
            ? null
            : undefined,
    },
  });
  return getProgressState();
}

export async function deletePlayerPracticeGoal(
  profileId: string,
  goalId: string,
) {
  const goal = await db.playerPracticeGoal.findFirst({
    where: { id: goalId, playerProfileId: profileId },
    select: { id: true },
  });
  if (!goal) {
    throw new AppError(
      "That practice goal no longer exists.",
      404,
      "PLAYER_PRACTICE_GOAL_NOT_FOUND",
    );
  }
  await db.playerPracticeGoal.delete({ where: { id: goal.id } });
  return getProgressState();
}
