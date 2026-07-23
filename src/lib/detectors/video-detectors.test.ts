import { describe, expect, it } from "vitest";

import { parseFfmpegMetadata } from "@/lib/detectors/ffmpeg-signals";
import { DetectorRegistry } from "@/lib/detectors/registry";
import {
  blackIntervalDetector,
  generalTransitionDetector,
  generalVideoDetectors,
  sceneChangeDetector,
} from "@/lib/detectors/video-detectors";
import {
  findSignalIntervals,
  metadataMeasurements,
  normalizeMeasurements,
} from "@/lib/detectors/video-signal-utils";

describe("FFmpeg video signal parsing", () => {
  it("parses frame metadata, numeric values, and ignores malformed lines", () => {
    expect(
      parseFfmpegMetadata(
        [
          "frame:0 pts:0 pts_time:0",
          "lavfi.scd.score=0.000",
          "lavfi.scd.mafd=1.25",
          "not metadata",
          "frame:1 pts:500 pts_time:0.5",
          "lavfi.scd.score=22.4",
        ].join("\n"),
      ),
    ).toEqual([
      {
        frame: 0,
        pts: 0,
        ptsTime: 0,
        values: { "lavfi.scd.score": 0, "lavfi.scd.mafd": 1.25 },
      },
      {
        frame: 1,
        pts: 500,
        ptsTime: 0.5,
        values: { "lavfi.scd.score": 22.4 },
      },
    ]);
  });

  it("deduplicates repeated measurements at one timestamp", () => {
    const points = metadataMeasurements({
      records: [
        { frame: 0, pts: 0, ptsTime: 1, values: { value: 5 } },
        { frame: 1, pts: 1, ptsTime: 1, values: { value: 7 } },
      ],
      key: "value",
      durationSeconds: 5,
      sampleIntervalSeconds: 0.5,
    });
    expect(points).toHaveLength(1);
    expect(points[0]?.rawValue).toBe(7);
  });
});

describe("temporally consistent video intervals", () => {
  const raw = [0.1, 0.1, 0.98, 0.97, 0.96, 0.1].map((rawValue, index) => ({
    timestampSeconds: index,
    windowStartSeconds: Math.max(0, index - 0.5),
    windowEndSeconds: Math.min(6, index + 0.5),
    rawValue,
  }));
  const points = normalizeMeasurements(raw, 6, 1).points;

  it("requires sustained samples instead of treating one dark sample as a transition", () => {
    const oneSample = findSignalIntervals({
      points,
      predicate: (point) => point.timestampSeconds === 2,
      minimumDurationSeconds: 2.5,
      maximumGapSeconds: 0.6,
    });
    const sustained = findSignalIntervals({
      points,
      predicate: (point) => point.rawValue >= 0.95,
      minimumDurationSeconds: 2.5,
      maximumGapSeconds: 0.6,
    });
    expect(oneSample).toEqual([]);
    expect(sustained).toHaveLength(1);
    expect(sustained[0]).toMatchObject({
      startSeconds: 1.5,
      endSeconds: 4.5,
    });
  });
});

describe("general video detector registration", () => {
  it("keeps stable versions and executes fusion after source detectors", () => {
    const registry = new DetectorRegistry();
    for (const detector of generalVideoDetectors) registry.register(detector);
    const installed = registry.list();
    expect(installed).toHaveLength(5);
    expect(installed.every((detector) => detector.version === "1.0.0")).toBe(
      true,
    );
    expect(installed.at(-1)?.stableId).toBe(generalTransitionDetector.stableId);
    expect(installed.indexOf(sceneChangeDetector)).toBeLessThan(
      installed.indexOf(blackIntervalDetector),
    );
  });
});
