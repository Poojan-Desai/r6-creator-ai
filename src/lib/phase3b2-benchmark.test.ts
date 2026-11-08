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

  it("never matches spans from different benchmark categories", () => {
    expect(
      matchBenchmarkSpans(
        [span("label", 0, 5, 10)],
        [{ ...span("event", 0, 5, 10), category: "QUIET_OR_LOW_INTEREST" }],
      ),
    ).toEqual([]);
  });

  it("requires meaningful overlap for quiet sections even when peaks are close", () => {
    expect(
      matchBenchmarkSpans(
        [{ ...span("label", 0, 2, 4), category: "QUIET_OR_LOW_INTEREST" }],
        [{ ...span("event", 3.5, 4, 20), category: "QUIET_OR_LOW_INTEREST" }],
      ),
    ).toEqual([]);
  });

  it("requires a close peak for creator reactions even with high overlap", () => {
    expect(
      matchBenchmarkSpans(
        [{ ...span("label", 0, 2, 30), category: "LOUD_CREATOR_REACTION" }],
        [{ ...span("event", 0, 25, 30), category: "LOUD_CREATOR_REACTION" }],
      ),
    ).toEqual([]);
  });

  it("requires overlap as well as a close peak for creator reactions", () => {
    expect(
      matchBenchmarkSpans(
        [{ ...span("label", 0, 1, 1.5), category: "LOUD_CREATOR_REACTION" }],
        [{ ...span("event", 2, 2.5, 3), category: "LOUD_CREATOR_REACTION" }],
      ),
    ).toEqual([]);
  });

  it.each(["QUIET_OR_LOW_INTEREST", "LOUD_CREATOR_REACTION"] as const)(
    "accepts supported %s matches",
    (category) => {
      expect(
        matchBenchmarkSpans(
          [{ ...span("label", 0, 5, 10), category }],
          [{ ...span("event", 2, 6, 12), category }],
        ),
      ).toHaveLength(1);
    },
  );

  it.each(["MENU", "LOADING_SCREEN"] as const)(
    "matches %s transition boundaries by peak tolerance, not interval overlap",
    (category) => {
      expect(
        matchBenchmarkSpans(
          [{ ...span("label", 0, 1, 1.5), category }],
          [{ ...span("event", 2, 3, 4), category }],
        ),
      ).toHaveLength(1);
      expect(
        matchBenchmarkSpans(
          [{ ...span("label", 0, 1, 30), category }],
          [{ ...span("event", 0, 25, 30), category }],
        ),
      ).toEqual([]);
    },
  );

  it("isolates the requested category before calculating metric denominators", () => {
    const metric = calculateBenchmarkMetric({
      category: "HIGH_ACTION_GAMEPLAY",
      labels: [
        span("label", 0, 5, 10),
        { ...span("other-label", 0, 5, 10), category: "MENU" },
      ],
      events: [
        span("event", 0, 5, 10),
        { ...span("other-event", 0, 5, 10), category: "MENU" },
      ],
      falsePositiveScopeComplete: true,
    });
    expect(metric).toMatchObject({ sampleCount: 1, truePositives: 1, f1: 1 });
  });

  it("reports measured zero F1 when a fully reviewed benchmark misses every label", () => {
    const metric = calculateBenchmarkMetric({
      category: "HIGH_ACTION_GAMEPLAY",
      labels: [span("label", 0, 1, 2)],
      events: [span("unmatched", 20, 21, 22)],
      falsePositiveScopeComplete: true,
    });
    expect(metric).toMatchObject({ precision: 0, recall: 0, f1: 0 });
  });

  it("reports zero F1 for a fully reviewed missed label even without predictions", () => {
    const metric = calculateBenchmarkMetric({
      category: "HIGH_ACTION_GAMEPLAY",
      labels: [span("label", 0, 1, 2)],
      events: [],
      falsePositiveScopeComplete: true,
    });
    expect(metric).toMatchObject({ precision: null, recall: 0, f1: 0 });
  });

  it("keeps metrics unavailable for a fully reviewed empty category", () => {
    const metric = calculateBenchmarkMetric({
      category: "HIGH_ACTION_GAMEPLAY",
      labels: [],
      events: [],
      falsePositiveScopeComplete: true,
    });
    expect(metric).toMatchObject({ precision: null, recall: null, f1: null });
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
