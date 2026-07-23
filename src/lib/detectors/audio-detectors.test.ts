import { describe, expect, it } from "vitest";

import {
  calculateSilenceThreshold,
  generalAudioDetectors,
  parseAudioLevelWindows,
} from "@/lib/detectors/audio-detectors";
import { DetectorRegistry } from "@/lib/detectors/registry";
import { generalVideoDetectors } from "@/lib/detectors/video-detectors";
import { findSignalIntervals } from "@/lib/detectors/video-signal-utils";
import { normalizeTimeSeries } from "@/lib/signals/time-series";

describe("audio level windows", () => {
  it("keeps the selected stream identity and converts digital silence", () => {
    const points = parseAudioLevelWindows({
      records: [
        {
          frame: 0,
          pts: 0,
          ptsTime: 0,
          values: { "lavfi.astats.Overall.RMS_level": "-inf" },
        },
        {
          frame: 1,
          pts: 8_000,
          ptsTime: 0.5,
          values: { "lavfi.astats.Overall.RMS_level": -22 },
        },
      ],
      key: "lavfi.astats.Overall.RMS_level",
      durationSeconds: 2,
      windowSeconds: 0.5,
      streamIndex: 3,
    });
    expect(points).toMatchObject([
      { rawValue: -120, sourceStreamIndex: 3 },
      { rawValue: -22, sourceStreamIndex: 3 },
    ]);
    expect(points[0]?.qualityWarning).toMatch(/Digital silence/);
  });

  it("normalizes a quiet microphone relative to its own baseline", () => {
    const points = [-65, -64, -66, -63, -35, -64].map((rawValue, index) => ({
      timestampSeconds: index + 0.25,
      windowStartSeconds: index,
      windowEndSeconds: index + 0.5,
      rawValue,
    }));
    const normalized = normalizeTimeSeries(points, {
      durationSeconds: 6,
      baselineWindowPoints: 5,
      minimumScale: 0.1,
    });
    expect(normalized.points[4]?.relativeDeviation).toBeGreaterThan(3);
    expect(normalized.points[4]?.normalizedValue).toBe(1);
  });
});

describe("audio peak and silence rules", () => {
  it("groups nearby peak windows but preserves separate peaks across gaps", () => {
    const normalized = normalizeTimeSeries(
      [-60, -30, -29, -60, -60, -25].map((rawValue, index) => ({
        timestampSeconds: index + 0.25,
        windowStartSeconds: index,
        windowEndSeconds: index + 0.5,
        rawValue,
      })),
      { durationSeconds: 6, baselineWindowPoints: 3, minimumScale: 0.1 },
    );
    const intervals = findSignalIntervals({
      points: normalized.points,
      predicate: (point) => point.normalizedValue >= 0.8,
      minimumDurationSeconds: 0.5,
      maximumGapSeconds: 0.6,
    });
    expect(intervals).toHaveLength(2);
  });

  it("uses both the recording baseline and an absolute safeguard", () => {
    expect(
      calculateSilenceThreshold({
        globalBaselineDbfs: -25,
        relativeMarginDb: 12,
        absoluteSafeguardDbfs: -40,
      }),
    ).toBe(-40);
    expect(
      calculateSilenceThreshold({
        globalBaselineDbfs: -65,
        relativeMarginDb: 12,
        absoluteSafeguardDbfs: -40,
      }),
    ).toBe(-77);
    expect(
      calculateSilenceThreshold({
        globalBaselineDbfs: -95,
        relativeMarginDb: 12,
        absoluteSafeguardDbfs: -40,
      }),
    ).toBe(-100);
  });
});

describe("audio detector registration", () => {
  it("runs role-specific audio work before broad evidence fusion", () => {
    const registry = new DetectorRegistry();
    for (const detector of [
      ...generalVideoDetectors,
      ...generalAudioDetectors,
    ]) {
      registry.register(detector);
    }
    const installed = registry.list();
    const fusionIndex = installed.findIndex(
      (detector) => detector.stableId === "video.general-transition",
    );
    expect(generalAudioDetectors).toHaveLength(4);
    expect(
      installed
        .slice(0, fusionIndex)
        .some((detector) => detector.stableId === "audio.overlapping-peaks"),
    ).toBe(true);
  });
});
