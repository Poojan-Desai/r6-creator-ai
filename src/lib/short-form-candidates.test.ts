import type { DetectorSourceSignal, GroundTruthCategory } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  CANDIDATE_FUSION_VERSION,
  fuseCandidateEvents,
  type CandidateSourceEvent,
} from "@/lib/short-form-candidates";

function event(
  id: string,
  peakSeconds: number,
  overrides: Partial<CandidateSourceEvent> = {},
): CandidateSourceEvent {
  return {
    id,
    eventType: "ACTION_SPIKE",
    category: null,
    startSeconds: peakSeconds - 0.5,
    peakSeconds,
    endSeconds: peakSeconds + 0.5,
    confidence: 0.8,
    sourceSignal: "MOTION",
    detectorId: "local.motion",
    detectorVersion: "1.0.0",
    supportingEvidence: ["Downscaled frame difference rose above baseline."],
    conflictingEvidence: [],
    evidence: [],
    ...overrides,
  };
}

describe("U3 transparent candidate fusion", () => {
  it("merges overlapping independent signals and keeps three scores separate", () => {
    const candidates = fuseCandidateEvents({
      durationSeconds: 120,
      events: [
        event("motion", 30),
        event("reaction", 32, {
          eventType: "UNCLASSIFIED_STRONG_VOCAL_REACTION",
          category: "LOUD_CREATOR_REACTION",
          sourceSignal: "CREATOR_MICROPHONE",
          detectorId: "local.reaction",
          confidence: 0.75,
        }),
        event("transcript", 31.5, {
          eventType: "TRANSCRIPT_SURPRISE",
          category: "OTHER_INTERESTING",
          sourceSignal: "TRANSCRIPT",
          detectorId: "local.transcript",
          confidence: 0.6,
          supportingEvidence: ["Transcript contains a surprise phrase."],
        }),
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.sourceEventIds).toEqual(
      expect.arrayContaining(["motion", "reaction", "transcript"]),
    );
    expect(candidates[0]?.eventConfidence).toBeGreaterThan(0);
    expect(candidates[0]?.contentPotentialScore).toBeGreaterThan(0);
    expect(candidates[0]?.styleSimilarity).toBeNull();
    expect(candidates[0]?.scoreBreakdown).toMatchObject({
      contentPotential: {
        disclaimer: expect.stringContaining("does not predict"),
      },
    });
    expect(candidates[0]?.transcriptEvidence[0]?.summary).toContain("surprise");
  });

  it("does not turn transcript-only kill language into a confirmed kill", () => {
    const candidates = fuseCandidateEvents({
      durationSeconds: 60,
      events: [
        event("words", 20, {
          eventType: "TRANSCRIPT_KILL_RELATED_LANGUAGE",
          category: "KILL",
          sourceSignal: "TRANSCRIPT",
          detectorId: "local.transcript",
          supportingEvidence: ["The creator said “I killed him.”"],
        }),
      ],
    });

    expect(candidates[0]?.category).toBe("OTHER_INTERESTING");
    expect(candidates[0]?.mainEvent).not.toMatch(/^Kill candidate$/);
    expect(candidates[0]?.missingEvidence).toContain(
      "Transcript language is supporting evidence only and does not confirm the gameplay event.",
    );
  });

  it("clamps candidate context to the recording and keeps distant moments separate", () => {
    const candidates = fuseCandidateEvents({
      durationSeconds: 40,
      maximumCandidates: 10,
      events: [event("opening", 0.5), event("ending", 39.2)],
    });

    expect(candidates).toHaveLength(2);
    expect(candidates.every((candidate) => candidate.startSeconds >= 0)).toBe(
      true,
    );
    expect(candidates.every((candidate) => candidate.endSeconds <= 40)).toBe(
      true,
    );
  });

  it("returns inspectable style similarity only when a profile is selected", () => {
    const candidates = fuseCandidateEvents({
      durationSeconds: 90,
      events: [event("action", 20)],
      style: {
        id: "profile",
        preferredVideoLengthSeconds: 15,
        energyLevel: 80,
        setupAmount: 40,
        reactionEmphasis: 50,
        storytellingLevel: 30,
      },
    });

    expect(candidates[0]?.styleSimilarity).not.toBeNull();
    expect(candidates[0]?.scoreBreakdown).toMatchObject({
      styleSimilarity: {
        formula: expect.stringContaining("length"),
        reasons: expect.any(Array),
      },
    });
  });

  it("ignores low-interest and scene-change evidence as standalone seeds", () => {
    const categories: Array<GroundTruthCategory | null> = [
      "QUIET_OR_LOW_INTEREST",
      null,
    ];
    const signals: DetectorSourceSignal[] = ["MOTION", "VIDEO"];
    const events = categories.map((category, index) =>
      event(`noise-${index}`, 10 + index, {
        category,
        sourceSignal: signals[index],
        eventType: index === 0 ? "SUSTAINED_LOW_ACTION" : "MINOR_SCENE_CHANGE",
      }),
    );

    expect(fuseCandidateEvents({ durationSeconds: 60, events })).toHaveLength(
      0,
    );
    expect(CANDIDATE_FUSION_VERSION).toBe("u3-candidate-fusion-v1");
  });
});
