import { describe, expect, it } from "vitest";

import { clipRequestSchema } from "@/lib/clips";
import type { CoachingState } from "@/lib/coaching";
import {
  buildCoachingReportDocument,
  COACHING_REPORT_SCHEMA_VERSION,
  createPracticeDrillSchema,
  createReviewClipSchema,
  renderCoachingReportMarkdown,
  renderCoachingReportPdf,
} from "@/lib/coaching-reports";

function finding(
  overrides: Record<string, unknown> = {},
): CoachingState["findings"][number] {
  return {
    id: "finding-1",
    analysisId: "analysis",
    originalCategory: "REVIEW_RECOMMENDED",
    category: "REVIEW_RECOMMENDED",
    originalSeverity: "MEDIUM",
    severity: "MEDIUM",
    confidence: 0.7,
    roundIndex: 0,
    originalVideoTimestampSeconds: 10,
    videoTimestampSeconds: 10,
    replayTimestampSeconds: null,
    directObservations: ["A visible doorway was reviewed."],
    replayFacts: [],
    transcriptEvidence: [],
    mapEvidence: [],
    supportingFrames: [],
    conflictingEvidence: [],
    missingContext: ["Exact player geometry is unavailable."],
    explanation: "This bounded moment is worth human review.",
    alternativeExplanations: ["Routine movement may explain the signal."],
    detectorVersions: { local: "1.0.0" },
    analysisVersion: "u6-test-analysis",
    decision: "ACCEPTED",
    coachNote: null,
    futurePractice: false,
    canonicalEvent: null,
    reviewClip: null,
    evidence: [],
    feedbackHistory: [],
    practiceDrills: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  } as CoachingState["findings"][number];
}

function stateFixture(): CoachingState {
  return {
    project: {
      id: "studio",
      name: "Evidence review",
      inputMode: "SCREEN_RECORDING_AND_REPLAY",
      coachingGoals: "Review selected-player outcomes.",
      selectedPlayerStableId: "player",
      selectedPlayerAlias: "User",
      contextUserConfirmed: false,
      recording: {
        id: "video",
        name: "Owned recording",
        durationSeconds: 120,
        width: 1920,
        height: 1080,
        frameRate: 60,
      },
      replay: {
        id: "replay",
        name: "Owned replay",
        status: "PARSED",
        mapName: "Lair",
        gameMode: "Bomb",
        matchType: "Ranked",
        providerId: "provider",
        providerVersion: "1.0.0",
        confidenceStatus: "HIGH",
        validationStatus: "VALIDATED",
      },
      userConfirmedContext: [],
    },
    capabilities: {},
    transcriptSegments: [],
    replayEvents: [
      {
        id: "event-kill",
        stableId: "event-kill-stable",
        category: "KILL",
        summary:
          "Replay feedback recorded kill from User to Opponent 1 in round 1.",
        roundIndex: 0,
        timestampSeconds: null,
        confidenceStatus: "HIGH",
        validationStatus: "VALIDATED",
        confidence: 0.9,
        missingEvidence: ["Elapsed timestamp unavailable."],
        conflictingEvidence: [],
      },
      {
        id: "event-death",
        stableId: "event-death-stable",
        category: "KILL",
        summary:
          "Replay feedback recorded kill from Opponent 2 to User in round 1.",
        roundIndex: 0,
        timestampSeconds: null,
        confidenceStatus: "HIGH",
        validationStatus: "VALIDATED",
        confidence: 0.9,
        missingEvidence: ["Independent death state unavailable."],
        conflictingEvidence: [],
      },
    ],
    calibrations: [],
    measurements: [],
    analyses: [
      {
        enabledRuleIds: ["replay.selected-player-events"],
        id: "analysis",
        inputMode: "SCREEN_RECORDING_AND_REPLAY",
        status: "COMPLETED",
        progress: 100,
        stage: "Ready",
        analysisVersion: "u6-test-analysis",
        ruleSetVersion: "u6-test-rules",
        currentRuleId: null,
        completedRuleCount: 1,
        failedRuleCount: 0,
        findingCount: 2,
        warnings: [],
        errorMessage: null,
        cancelRequestedAt: null,
        startedAt: "2026-08-01T00:00:00.000Z",
        createdAt: "2026-08-01T00:00:00.000Z",
        completedAt: "2026-08-01T00:00:01.000Z",
      },
    ],
    findings: [
      finding(),
      finding({
        id: "rejected",
        category: "POSSIBLE_BAD_POSITIONING",
        decision: "REJECTED",
        explanation: "This rejected explanation must not become a priority.",
      }),
    ],
    drills: [
      {
        id: "drill",
        findingId: "finding-1",
        name: "Evidence review",
        observation: "The visible moment was accepted.",
        instructions: "Separate observation from inference.",
        measurableGoal: "Complete five reviews.",
        nextFiveMatchGoal: "Review one moment after each match.",
        completed: false,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    reports: [],
  } as unknown as CoachingState;
}

describe("U6 coaching reports and practice", () => {
  it("builds an evidence-bounded immutable report document", () => {
    const report = buildCoachingReportDocument(
      stateFixture(),
      "2026-08-01T12:00:00.000Z",
    );
    expect(report.schemaVersion).toBe(COACHING_REPORT_SCHEMA_VERSION);
    expect(report.generatedAt).toBe("2026-08-01T12:00:00.000Z");
    expect(report.matchSummary).toMatchObject({
      map: "Lair",
      mode: "Bomb",
      selectedPlayerKills: 1,
      selectedPlayerLikelyDeaths: 1,
    });
    expect(report.topReviewPriorities).toHaveLength(1);
    expect(JSON.stringify(report.topReviewPriorities)).not.toContain(
      "rejected explanation",
    );
    expect(report.evidenceBoundary.join(" ")).toMatch(
      /position.*line of sight.*unknown/i,
    );
  });

  it("renders real Markdown and PDF exports", async () => {
    const report = buildCoachingReportDocument(
      stateFixture(),
      "2026-08-01T12:00:00.000Z",
    );
    const markdown = renderCoachingReportMarkdown(report);
    expect(markdown).toContain("# R6 Creator AI Coaching Report");
    expect(markdown).toContain("AI-assisted replay and POV review");
    expect(markdown).toContain("Goals for the next five matches");

    const pdf = await renderCoachingReportPdf(report);
    expect(Buffer.from(pdf).subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(1_000);
  });

  it("creates bounded drill and review-clip requests", () => {
    expect(
      createPracticeDrillSchema.parse({ findingId: "finding" }),
    ).toMatchObject({ findingId: "finding" });
    expect(createReviewClipSchema.parse({})).toEqual({
      contextBeforeSeconds: 6,
      contextAfterSeconds: 8,
    });
    expect(() =>
      createReviewClipSchema.parse({
        contextBeforeSeconds: 60,
        contextAfterSeconds: 8,
      }),
    ).toThrow();
  });

  it("keeps the Phase 1 clip request boundary after service extraction", () => {
    expect(
      clipRequestSchema.parse({
        name: "Review clip",
        startTime: 4.5,
        endTime: "12.25",
      }),
    ).toMatchObject({ startTime: 4.5, endTime: "12.25" });
    expect(() =>
      clipRequestSchema.parse({
        startTime: 0,
        endTime: 5,
        unexpected: true,
      }),
    ).toThrow();
  });
});
