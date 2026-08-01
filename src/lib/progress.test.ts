import { describe, expect, it } from "vitest";

import {
  calculateProgressMetrics,
  PLAYER_PROGRESS_METRIC_VERSION,
  type ProgressSourceProject,
  progressSnapshotFilterSchema,
} from "@/lib/progress";

function sourceProject(
  overrides: Partial<ProgressSourceProject> = {},
): ProgressSourceProject {
  return {
    id: "studio-1",
    name: "Owned combined project",
    createdAt: "2026-08-01T00:00:00.000Z",
    inputMode: "SCREEN_RECORDING_AND_REPLAY",
    selectedPlayerStableId: "player-user",
    selectedPlayerAlias: "User",
    side: "UNKNOWN",
    contextUserConfirmed: false,
    map: null,
    operator: null,
    match: {
      id: "match-1",
      map: "LairY10",
      mode: "Bomb",
      providerId: "local-parser",
      providerVersion: "1.0.0",
      validationStatus: "VALIDATED",
      selectedPlayerOperator: "Ash",
      events: [
        {
          category: "KILL",
          roundId: "round-1",
          actorStableId: "player-user",
          targetStableId: "opponent",
          validationStatus: "VALIDATED",
          directObservation: {
            headshot: true,
            roundClockSecondsRemaining: 130,
          },
        },
        {
          category: "KILL",
          roundId: "round-1",
          actorStableId: "opponent",
          targetStableId: "player-user",
          validationStatus: "VALIDATED",
          directObservation: { roundClockSecondsRemaining: 80 },
        },
        {
          category: "DEFUSER_PLANT",
          roundId: "round-2",
          actorStableId: "player-user",
          targetStableId: null,
          validationStatus: "VALIDATED",
          directObservation: { roundClockSecondsRemaining: 20 },
        },
      ],
    },
    findings: [
      {
        category: "REVIEW_RECOMMENDED",
        decision: "ACCEPTED",
        severity: "MEDIUM",
        confidence: 0.7,
        analysisVersion: "coaching-v1",
      },
      {
        category: "POSSIBLE_UNNECESSARY_REPEEK",
        decision: "REJECTED",
        severity: "LOW",
        confidence: 0.8,
        analysisVersion: "coaching-v1",
      },
    ],
    measurements: [
      {
        kind: "CROSSHAIR_CORRECTION",
        value: 0.12,
        methodVersion: "measurement-v1",
        userConfirmed: true,
        findingDecision: "ACCEPTED",
      },
    ],
    drills: [
      {
        completed: true,
        name: "Evidence-first review",
        measurableGoal: "Complete five reviews.",
      },
    ],
    ...overrides,
  };
}

function byKey(
  metrics: ReturnType<typeof calculateProgressMetrics>,
  key: string,
) {
  const result = metrics.find((item) => item.key === key);
  if (!result) throw new Error(`Missing metric ${key}`);
  return result;
}

describe("U7 transparent local progress metrics", () => {
  it("separates direct replay facts, death inference, and user decisions", () => {
    const metrics = calculateProgressMetrics([sourceProject()], 2, 1);

    expect(byKey(metrics, "kills")).toMatchObject({
      value: 1,
      evidenceClass: "VERIFIED_REPLAY_FACT",
    });
    expect(byKey(metrics, "likely_deaths")).toMatchObject({
      value: 1,
      evidenceClass: "INFERENCE",
    });
    expect(byKey(metrics, "headshots").value).toBe(1);
    expect(byKey(metrics, "defuser_involvement").value).toBe(1);
    expect(byKey(metrics, "accepted_findings").value).toBe(1);
    expect(byKey(metrics, "rejected_findings").value).toBe(1);
    expect(byKey(metrics, "completed_drills").value).toBe(1);
    expect(byKey(metrics, "user_notes").value).toBe(2);
    expect(byKey(metrics, "active_practice_goals").value).toBe(1);
    expect(byKey(metrics, "kills").sourceVersions).toContain(
      PLAYER_PROGRESS_METRIC_VERSION,
    );
  });

  it("keeps one crosshair measurement and one match visibly insufficient", () => {
    const metrics = calculateProgressMetrics([sourceProject()]);

    expect(byKey(metrics, "average_crosshair_correction")).toMatchObject({
      value: 0.12,
      sampleSize: 1,
      availability: "INSUFFICIENT_SAMPLE",
      evidenceClass: "DIRECT_VIDEO_OBSERVATION",
    });
    expect(byKey(metrics, "comparison_readiness")).toMatchObject({
      sampleSize: 1,
      availability: "INSUFFICIENT_SAMPLE",
    });
    expect(byKey(metrics, "attack_projects")).toMatchObject({
      availability: "UNAVAILABLE",
      sampleSize: 0,
    });
  });

  it("does not count unverified replay events or a mismatched selected player", () => {
    const project = sourceProject();
    project.match!.events[0]!.validationStatus = "UNVERIFIED";
    project.selectedPlayerStableId = "different-player";
    const metrics = calculateProgressMetrics([project]);

    expect(byKey(metrics, "kills").value).toBe(0);
    expect(byKey(metrics, "likely_deaths").value).toBe(0);
    expect(byKey(metrics, "headshots").value).toBe(0);
  });

  it("validates explicit map, operator, side, and input-mode filters", () => {
    expect(
      progressSnapshotFilterSchema.parse({
        inputMode: "SCREEN_RECORDING_AND_REPLAY",
        map: "LairY10",
        operator: "Ash",
        side: "ATTACK",
      }),
    ).toEqual({
      inputMode: "SCREEN_RECORDING_AND_REPLAY",
      map: "LairY10",
      operator: "Ash",
      side: "ATTACK",
    });
  });
});
