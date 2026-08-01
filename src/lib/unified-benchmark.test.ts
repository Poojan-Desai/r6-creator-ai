import { describe, expect, it } from "vitest";

import {
  calculateUnifiedReviewMetrics,
  createUnifiedReviewLabelSchema,
} from "@/lib/unified-benchmark";

function metric(
  metrics: ReturnType<typeof calculateUnifiedReviewMetrics>,
  key: string,
) {
  const result = metrics.find((item) => item.key === key);
  if (!result) throw new Error(`Missing review metric ${key}`);
  return result;
}

describe("U8 unified content and coaching review metrics", () => {
  it("keeps unapproved labels out of rates and warns on small samples", () => {
    const metrics = calculateUnifiedReviewMetrics([
      { category: "USEFUL_CLIP", approvedAsBenchmark: true },
      { category: "UNINTERESTING_CLIP", approvedAsBenchmark: true },
      { category: "USEFUL_CLIP", approvedAsBenchmark: false },
    ]);

    expect(metric(metrics, "clip_acceptance_rate")).toMatchObject({
      numerator: 1,
      denominator: 2,
      value: 0.5,
      availability: "INSUFFICIENT_SAMPLE",
    });
    expect(metric(metrics, "coaching_finding_correctness_rate")).toMatchObject({
      value: null,
      availability: "UNAVAILABLE",
    });
  });

  it("calculates only transparent approved-label denominators", () => {
    const metrics = calculateUnifiedReviewMetrics([
      { category: "GOOD_SCRIPT", approvedAsBenchmark: true },
      { category: "GOOD_SCRIPT", approvedAsBenchmark: true },
      { category: "INCORRECT_FACT", approvedAsBenchmark: true },
      { category: "GOOD_SCRIPT", approvedAsBenchmark: true },
      { category: "GOOD_SCRIPT", approvedAsBenchmark: true },
      { category: "CORRECT_TIMING", approvedAsBenchmark: true },
      { category: "INCORRECT_TIMING", approvedAsBenchmark: true },
      { category: "CORRECT_REPEEK_FINDING", approvedAsBenchmark: true },
      { category: "CORRECT_CROSSHAIR_FINDING", approvedAsBenchmark: true },
      { category: "CORRECT_TRADE_FINDING", approvedAsBenchmark: true },
    ]);

    expect(metric(metrics, "script_fact_error_rate")).toMatchObject({
      numerator: 1,
      denominator: 5,
      value: 0.2,
      availability: "AVAILABLE",
    });
    expect(metric(metrics, "coaching_finding_correctness_rate")).toMatchObject({
      numerator: 4,
      denominator: 5,
      value: 0.8,
      availability: "AVAILABLE",
    });
  });

  it("rejects a category from the wrong review area and partial ranges", () => {
    expect(() =>
      createUnifiedReviewLabelSchema.parse({
        studioProjectId: "studio",
        area: "CONTENT",
        category: "CORRECT_TIMING",
        reviewerConfidence: 1,
        approvedAsBenchmark: false,
      }),
    ).toThrow(/content review label/i);
    expect(() =>
      createUnifiedReviewLabelSchema.parse({
        studioProjectId: "studio",
        area: "COACHING",
        category: "USEFUL_RECOMMENDATION",
        startSeconds: 12,
        reviewerConfidence: 1,
        approvedAsBenchmark: false,
      }),
    ).toThrow(/both a start and end time/i);
  });
});
