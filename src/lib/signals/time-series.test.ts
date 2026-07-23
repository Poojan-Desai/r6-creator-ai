import { describe, expect, it } from "vitest";

import { prepareSignalCurve } from "@/lib/signals/storage";
import {
  aggregateTimeSeries,
  decodeTimeSeriesChunk,
  encodeTimeSeriesChunks,
  median,
  medianAbsoluteDeviation,
  normalizeTimeSeries,
  percentile,
  validateTimeSeries,
  type TimeSeriesPoint,
} from "@/lib/signals/time-series";

function point(
  timestampSeconds: number,
  rawValue: number,
  relativeDeviation = rawValue,
): TimeSeriesPoint {
  return {
    timestampSeconds,
    windowStartSeconds: timestampSeconds,
    windowEndSeconds: timestampSeconds + 0.5,
    rawValue,
    normalizedValue: Math.min(1, Math.max(0, rawValue / 100)),
    localBaseline: 0,
    globalBaseline: 0,
    relativeDeviation,
  };
}

describe("time-series statistics and normalization", () => {
  it("calculates deterministic median, percentile, and MAD values", () => {
    expect(median([9, 1, 5, 3])).toBe(4);
    expect(percentile([0, 10, 20], 0.75)).toBe(15);
    expect(medianAbsoluteDeviation([1, 2, 3, 4, 100], 3)).toBe(1);
  });

  it("orders timestamps, clamps windows, and records local/global baselines", () => {
    const normalized = normalizeTimeSeries(
      [
        {
          timestampSeconds: 2,
          windowStartSeconds: 1.5,
          windowEndSeconds: 2.5,
          rawValue: 30,
        },
        {
          timestampSeconds: 0,
          windowStartSeconds: -1,
          windowEndSeconds: 0.5,
          rawValue: 10,
        },
        {
          timestampSeconds: 1,
          windowStartSeconds: 0.5,
          windowEndSeconds: 1.5,
          rawValue: 11,
        },
      ],
      { durationSeconds: 3, baselineWindowPoints: 3 },
    );
    expect(normalized.points.map((item) => item.timestampSeconds)).toEqual([
      0, 1, 2,
    ]);
    expect(normalized.points[0]?.windowStartSeconds).toBe(0);
    expect(normalized.points[2]?.relativeDeviation).toBeGreaterThan(0);
    expect(normalized.statistics.normalizationFormula).toContain("p95");
  });

  it("rejects out-of-order and out-of-bounds persisted points", () => {
    expect(() => validateTimeSeries([point(2, 1), point(1, 1)], 10)).toThrow(
      /timestamp order/,
    );
    expect(() => validateTimeSeries([point(10, 1)], 10)).toThrow(
      /beyond the video/,
    );
  });
});

describe("time-series aggregation and chunk storage", () => {
  it("preserves a short spike during event-preserving aggregation", () => {
    const points = Array.from({ length: 100 }, (_, index) => point(index, 1));
    points[47] = point(47, 100, 12);
    const aggregated = aggregateTimeSeries(points, {
      maxPoints: 10,
      method: "EVENT_PRESERVING",
    });
    expect(aggregated).toHaveLength(10);
    expect(aggregated.some((item) => item.rawValue === 100)).toBe(true);
  });

  it("supports maximum, mean, median, and percentile aggregation", () => {
    const points = [point(0, 1), point(1, 3), point(2, 100), point(3, 5)];
    expect(
      aggregateTimeSeries(points, { maxPoints: 2, method: "MAXIMUM" }).map(
        (item) => item.rawValue,
      ),
    ).toEqual([3, 100]);
    expect(
      aggregateTimeSeries(points, { maxPoints: 2, method: "MEAN" })[0]
        ?.rawValue,
    ).toBe(2);
    expect(
      aggregateTimeSeries(points, { maxPoints: 2, method: "MEDIAN" })[0]
        ?.rawValue,
    ).toBe(2);
    expect(
      aggregateTimeSeries(points, {
        maxPoints: 2,
        method: "PERCENTILE",
        percentile: 0.5,
      })[0]?.rawValue,
    ).toBe(2);
  });

  it("round-trips bounded compressed chunks without one row per point", () => {
    const points = Array.from({ length: 1_201 }, (_, index) =>
      point(index / 2, index % 100),
    );
    const chunks = encodeTimeSeriesChunks(points);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.pointCount <= 500)).toBe(true);
    expect(
      chunks.flatMap((chunk) =>
        decodeTimeSeriesChunk(chunk.payload, chunk.pointCount),
      ),
    ).toEqual(points);
    expect(() => decodeTimeSeriesChunk(chunks[0]!.payload, 499)).toThrow(
      /point count/,
    );
  });

  it("prepares reproducible curve metadata and supports replacement keys", () => {
    const input = {
      detectorRunId: "detector-run",
      stableId: "video.action-intensity",
      kind: "ACTION_INTENSITY" as const,
      displayName: "Action intensity",
      unit: "relative difference",
      sourceSignal: "FRAME_DIFFERENCE" as const,
      sampleIntervalSeconds: 0.5,
      aggregation: "EVENT_PRESERVING" as const,
      configuration: { framesPerSecond: 2 },
      statistics: { baseline: "rolling median" },
      rawPointCount: 4,
      points: [point(0, 1), point(1, 2), point(2, 20), point(3, 2)],
    };
    const first = prepareSignalCurve(input, 4);
    const regenerated = prepareSignalCurve(
      { ...input, points: [point(0, 2), point(1, 3)] },
      4,
    );
    expect(first.curve.stableId).toBe(regenerated.curve.stableId);
    expect(first.curve.storedPointCount).toBe(4);
    expect(regenerated.curve.storedPointCount).toBe(2);
    expect(first.permanentDataBytes).toBeGreaterThan(0);
  });
});
