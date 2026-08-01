import { describe, expect, it } from "vitest";

import {
  assessTradeTiming,
  coachingRuleAvailability,
  isPossibleEarlyRoundDeath,
  runCoachingRulesIsolated,
  startCoachingAnalysisSchema,
} from "@/lib/coaching-analysis";

describe("U6 local coaching analysis", () => {
  it("isolates a failed rule and preserves the other rule result", async () => {
    const result = await runCoachingRulesIsolated(
      [
        {
          id: "failed-rule",
          run() {
            throw new Error("Synthetic isolated failure");
          },
        },
        {
          id: "working-rule",
          run() {
            return {
              findings: [],
              warnings: ["The working rule still completed."],
            };
          },
        },
      ],
      {},
    );

    expect(result.failures).toEqual([
      { ruleId: "failed-rule", message: "Synthetic isolated failure" },
    ]);
    expect(result.warnings).toEqual(["The working rule still completed."]);
  });

  it("requires selected-player target feedback and an observed early clock", () => {
    expect(
      isPossibleEarlyRoundDeath({
        category: "KILL",
        selectedPlayerIsTarget: true,
        roundClockSecondsRemaining: 162,
      }),
    ).toBe(true);
    expect(
      isPossibleEarlyRoundDeath({
        category: "KILL",
        selectedPlayerIsTarget: true,
        roundClockSecondsRemaining: null,
      }),
    ).toBe(false);
    expect(
      isPossibleEarlyRoundDeath({
        category: "KILL",
        selectedPlayerIsTarget: false,
        roundClockSecondsRemaining: 162,
      }),
    ).toBe(false);
  });

  it("reports event-order trade windows without claiming spatial opportunity", () => {
    const result = assessTradeTiming([
      {
        id: "teammate-death",
        timestampSeconds: 10,
        actorTeamIndex: 1,
        targetTeamIndex: 0,
        actorIsSelectedPlayer: false,
        targetIsSelectedPlayer: false,
      },
      {
        id: "response",
        timestampSeconds: 12.5,
        actorTeamIndex: 0,
        targetTeamIndex: 1,
        actorIsSelectedPlayer: true,
        targetIsSelectedPlayer: false,
      },
    ]);

    expect(result.opportunities).toEqual([
      {
        teammateDeathEventId: "teammate-death",
        responseEventId: "response",
        responseSeconds: 2.5,
        selectedPlayerResponse: true,
        spatialOpportunityKnown: false,
      },
    ]);
    expect(result.limitation).toMatch(/line of sight|distance/i);
  });

  it("makes missing elapsed timestamps explicit", () => {
    const result = assessTradeTiming([
      {
        id: "untimed",
        timestampSeconds: null,
        actorTeamIndex: 1,
        targetTeamIndex: 0,
        actorIsSelectedPlayer: false,
        targetIsSelectedPlayer: false,
      },
    ]);
    expect(result.opportunities).toHaveLength(0);
    expect(result.missingEvidence).toMatch(/lack elapsed timestamps/i);
  });

  it("validates stable rule IDs and rejects unknown selections", () => {
    expect(
      startCoachingAnalysisSchema.parse({
        enabledRuleIds: [
          "recording.signal-review",
          "recording.transcript-review",
        ],
      }),
    ).toMatchObject({
      enabledRuleIds: [
        "recording.signal-review",
        "recording.transcript-review",
      ],
    });
    expect(() =>
      startCoachingAnalysisSchema.parse({
        enabledRuleIds: ["unsupported.rule"],
      }),
    ).toThrow(/unknown coaching rule/i);
  });

  it("shows input-mode availability without hiding unsupported evidence", () => {
    const recording = coachingRuleAvailability("SCREEN_RECORDING_ONLY");
    expect(
      recording.find((rule) => rule.id === "recording.signal-review"),
    ).toMatchObject({ applicable: true });
    expect(
      recording.find((rule) => rule.id === "replay.trade-timing"),
    ).toMatchObject({
      applicable: false,
      reliability: "unsupported-without-evidence",
    });

    const combined = coachingRuleAvailability("SCREEN_RECORDING_AND_REPLAY");
    expect(combined.every((rule) => rule.applicable)).toBe(true);
  });
});
