import { describe, expect, it } from "vitest";

import {
  calculateSynchronizationMapping,
  clusterOffsetPairs,
  mapReplayToVideoTime,
} from "@/lib/replay-video-sync-math";

describe("replay/video synchronization math", () => {
  it("calculates a manual offset from one anchor without claiming drift", () => {
    const mapping = calculateSynchronizationMapping([
      {
        id: "one",
        kind: "ROUND_START",
        videoTimestampSeconds: 42,
        replayTimestampSeconds: 12,
        confidence: 0.9,
        userConfirmed: true,
      },
    ]);

    expect(mapping.offsetSeconds).toBe(30);
    expect(mapping.slope).toBe(1);
    expect(mapping.driftSecondsPerHour).toBe(0);
    expect(mapping.confidence).toBeLessThan(0.6);
    expect(mapping.missingEvidence.join(" ")).toMatch(
      /drift cannot be measured/i,
    );
  });

  it("fits offset and drift from distinct confirmed anchors", () => {
    const mapping = calculateSynchronizationMapping([
      {
        id: "first",
        kind: "ROUND_START",
        videoTimestampSeconds: 20.1,
        replayTimestampSeconds: 10,
        confidence: 1,
        userConfirmed: true,
      },
      {
        id: "second",
        kind: "ROUND_END",
        videoTimestampSeconds: 121.1,
        replayTimestampSeconds: 110,
        confidence: 1,
        userConfirmed: true,
      },
    ]);

    expect(mapping.offsetSeconds).toBeCloseTo(10, 6);
    expect(mapping.slope).toBeCloseTo(1.01, 6);
    expect(mapping.driftSecondsPerHour).toBeCloseTo(36, 4);
    expect(mapping.rootMeanSquareErrorSeconds).toBeCloseTo(0, 6);
    expect(mapping.confidence).toBeGreaterThan(0.6);
  });

  it("keeps the mapping formula and per-round correction explicit", () => {
    expect(
      mapReplayToVideoTime({
        replayTimestampSeconds: 100,
        offsetSeconds: 20,
        slope: 1.001,
        roundAdjustmentSeconds: -0.5,
      }),
    ).toBe(119.6);
  });

  it("lowers confidence and explains implausible drift", () => {
    const mapping = calculateSynchronizationMapping([
      {
        id: "first",
        kind: "KILL",
        videoTimestampSeconds: 10,
        replayTimestampSeconds: 10,
        confidence: 1,
        userConfirmed: true,
      },
      {
        id: "second",
        kind: "KILL",
        videoTimestampSeconds: 130,
        replayTimestampSeconds: 100,
        confidence: 1,
        userConfirmed: true,
      },
    ]);

    expect(Math.abs(mapping.driftSecondsPerHour)).toBeGreaterThan(120);
    expect(mapping.conflictingEvidence.join(" ")).toMatch(
      /outside the conservative verification limit/i,
    );
  });

  it("clusters multiple compatible offset pairs without accepting them", () => {
    const clusters = clusterOffsetPairs([
      {
        videoTimestampSeconds: 110,
        replayTimestampSeconds: 10,
        evidenceType: "KILL",
        confidence: 0.8,
        videoEvidence: "Video kill-feed change",
        replayEvidence: "Replay kill",
      },
      {
        videoTimestampSeconds: 201,
        replayTimestampSeconds: 100,
        evidenceType: "ROUND_END",
        confidence: 0.9,
        videoEvidence: "Video result screen",
        replayEvidence: "Replay round end",
      },
      {
        videoTimestampSeconds: 32,
        replayTimestampSeconds: 10,
        evidenceType: "KILL",
        confidence: 0.7,
        videoEvidence: "Other possible kill",
        replayEvidence: "Replay kill",
      },
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.offsetSeconds).toBeGreaterThan(100);
    expect(clusters[0]?.offsetSeconds).toBeLessThan(101.1);
    expect(clusters[0]?.compatiblePairCount).toBe(2);
    expect(clusters[0]?.distinctEvidenceTypeCount).toBe(2);
    expect(clusters[0]?.confidence).toBeLessThanOrEqual(0.85);
  });
});
