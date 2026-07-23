import { describe, expect, it } from "vitest";

import {
  calculateBenchmarkMetric,
  intersectionOverUnion,
  matchBenchmarkSpans,
  type BenchmarkSpan,
} from "@/lib/phase3b2-benchmark";

const span = (
  id: string,
  startSeconds: number,
  peakSeconds: number,
  endSeconds: number,
): BenchmarkSpan => ({
  id,
  category: "HIGH_ACTION_GAMEPLAY",
  startSeconds,
  peakSeconds,
  endSeconds,
});

describe("Phase 3B.2 benchmark calculations", () => {
  it("calculates temporal intersection over union", () => {
    expect(
      intersectionOverUnion(span("a", 0, 5, 10), span("b", 5, 7, 15)),
    ).toBeCloseTo(1 / 3);
  });

  it("uses deterministic one-to-one matching and removes duplicates", () => {
    const matches = matchBenchmarkSpans(
      [span("label-1", 10, 12, 14), span("label-2", 30, 31, 33)],
      [
        span("best", 10, 12, 14),
        span("duplicate", 9, 12, 15),
        span("second", 30, 31.5, 33),
      ],
    );
    expect(matches.map((match) => match.eventId)).toEqual(["best", "second"]);
  });

  it("accepts overlap with a peak inside the documented two-second tolerance", () => {
    expect(
      matchBenchmarkSpans(
        [span("label", 0, 2, 4)],
        [span("event", 3.5, 4, 20)],
      ),
    ).toHaveLength(1);
  });

  it("does not report precision before full-category review", () => {
    const metric = calculateBenchmarkMetric({
      category: "HIGH_ACTION_GAMEPLAY",
      labels: [span("label", 10, 11, 12)],
      events: [span("match", 10, 11, 12), span("unknown", 40, 41, 42)],
      falsePositiveScopeComplete: false,
    });
    expect(metric).toMatchObject({
      truePositives: 1,
      falsePositives: 0,
      unmatchedCandidateCount: 1,
      precision: null,
      recall: 1,
      f1: null,
      insufficientExamples: true,
    });
  });

  it("counts unmatched events after explicit review and calculates errors", () => {
    const metric = calculateBenchmarkMetric({
      category: "HIGH_ACTION_GAMEPLAY",
      labels: [span("label", 10, 12, 14)],
      events: [span("match", 9, 11.5, 15), span("false", 40, 41, 42)],
      falsePositiveScopeComplete: true,
    });
    expect(metric).toMatchObject({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 0,
      precision: 0.5,
      recall: 1,
      medianPeakError: 0.5,
      medianStartError: 1,
      medianEndError: 1,
    });
    expect(metric.f1).toBeCloseTo(2 / 3);
  });
});
