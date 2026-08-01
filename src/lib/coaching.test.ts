import { describe, expect, it } from "vitest";

import {
  COACHING_ANALYSIS_VERSION,
  createHumanReviewedFindingSchema,
  summarizeCanonicalEvent,
  updateCoachingFindingSchema,
} from "@/lib/coaching";

describe("U6 inspectable coaching foundation", () => {
  it("requires evidence and explicit confirmation for visible observations", () => {
    expect(() =>
      createHumanReviewedFindingSchema.parse({
        category: "REVIEW_RECOMMENDED",
        severity: "MEDIUM",
        confidence: 0.6,
      }),
    ).toThrow(/visible observation/i);

    expect(() =>
      createHumanReviewedFindingSchema.parse({
        category: "CROSSHAIR_PLACEMENT_ISSUE",
        severity: "MEDIUM",
        confidence: 0.6,
        videoTimestampSeconds: 10,
        directObservation:
          "The crosshair was visibly below the doorway when firing began.",
        directObservationConfirmed: false,
      }),
    ).toThrow(/personally reviewed/i);

    expect(
      createHumanReviewedFindingSchema.parse({
        category: "CROSSHAIR_PLACEMENT_ISSUE",
        severity: "MEDIUM",
        confidence: 0.6,
        videoTimestampSeconds: 10,
        directObservation:
          "The crosshair was visibly below the doorway when firing began.",
        directObservationConfirmed: true,
        missingContext:
          "The intended pre-aim height and threat position before the frame are unknown.",
      }),
    ).toMatchObject({
      directObservationConfirmed: true,
      videoTimestampSeconds: 10,
    });
  });

  it("labels parsed replay feedback without inventing elapsed timing or cause", () => {
    const summary = summarizeCanonicalEvent({
      id: "event",
      stableId: "event-stable",
      category: "KILL",
      timestampSeconds: null,
      directObservationJson: JSON.stringify({
        actorAlias: "User",
        targetAlias: "Opponent 2",
        roundClock: "1:53",
        headshot: true,
      }),
      confidenceStatus: "HIGH",
      validationStatus: "VALIDATED",
      missingEvidenceJson: JSON.stringify([
        "Elapsed match timestamp unavailable.",
      ]),
      conflictingEvidenceJson: "[]",
      round: { id: "round", roundIndex: 2 },
    });

    expect(summary).toContain("Replay feedback recorded kill");
    expect(summary).toContain("round 3");
    expect(summary).toContain("observed round clock 1:53");
    expect(summary).not.toMatch(/good|bad|intent|position|cause/i);
  });

  it("validates review corrections without rewriting the analysis version", () => {
    expect(
      updateCoachingFindingSchema.parse({
        decision: "NOT_ENOUGH_CONTEXT",
        category: "POSSIBLE_BAD_POSITIONING",
        severity: "LOW",
        videoTimestampSeconds: 12.25,
        coachNote: "Review teammate positions before accepting this.",
      }),
    ).toMatchObject({
      decision: "NOT_ENOUGH_CONTEXT",
      videoTimestampSeconds: 12.25,
    });
    expect(COACHING_ANALYSIS_VERSION).toBe("u6-human-reviewed-v1");
  });
});
