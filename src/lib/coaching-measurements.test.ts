import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  calculateFrameSimilarity,
  coachingCalibrationSchema,
  coachingMeasurementSchema,
  measureCrosshairOffset,
  measureRepeatedFrameSimilarity,
  REPEATED_VIEW_METHOD_VERSION,
} from "@/lib/coaching-measurements";
import { appConfig } from "@/lib/config";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("U6 conservative recording measurements", () => {
  it("versions only explicitly confirmed calibration assumptions", () => {
    expect(() =>
      coachingCalibrationSchema.parse({
        name: "Centered",
        crosshairNormalizedX: 0.5,
        crosshairNormalizedY: 0.5,
        userConfirmed: false,
      }),
    ).toThrow(/confirm/i);
    expect(
      coachingCalibrationSchema.parse({
        name: "Centered",
        crosshairNormalizedX: 0.5,
        crosshairNormalizedY: 0.5,
        hudScalePercent: 100,
        aspectRatio: "16:9",
        fovDegrees: 90,
        userConfirmed: true,
      }),
    ).toMatchObject({ fovDegrees: 90, userConfirmed: true });
  });

  it("calculates an inspectable normalized and pixel crosshair offset", () => {
    const result = measureCrosshairOffset({
      crosshairNormalizedX: 0.5,
      crosshairNormalizedY: 0.5,
      targetNormalizedX: 0.6,
      targetNormalizedY: 0.4,
      width: 1920,
      height: 1080,
    });
    expect(result.normalizedDistance).toBeCloseTo(Math.sqrt(0.02), 8);
    expect(result.pixelDeltaX).toBeCloseTo(192, 8);
    expect(result.pixelDeltaY).toBeCloseTo(-108, 8);
    expect(result.verticalDirection).toBe("target-above-crosshair");
  });

  it("requires ordered, human-confirmed repeated-view timestamps", () => {
    expect(() =>
      coachingMeasurementSchema.parse({
        kind: "REPEATED_VIEW_SIMILARITY",
        firstTimestampSeconds: 10,
        secondTimestampSeconds: 9,
        sameViewConfirmed: true,
        userConfirmed: true,
      }),
    ).toThrow(/after the first/i);
    expect(() =>
      coachingMeasurementSchema.parse({
        kind: "REPEATED_VIEW_SIMILARITY",
        firstTimestampSeconds: 9,
        secondTimestampSeconds: 10,
        sameViewConfirmed: false,
        userConfirmed: true,
      }),
    ).toThrow(/same visible view/i);
  });

  it("keeps frame similarity numeric and deterministic", () => {
    expect(
      calculateFrameSimilarity(
        new Uint8Array([0, 100, 200]),
        new Uint8Array([0, 100, 200]),
      ),
    ).toEqual({
      meanAbsoluteDifference: 0,
      similarity: 1,
      sampleCount: 3,
    });
    expect(
      calculateFrameSimilarity(
        new Uint8Array([0, 0]),
        new Uint8Array([255, 255]),
      ).similarity,
    ).toBe(0);
  });

  it.skipIf(!appConfig.ffmpegPath)(
    "samples two real local frames without retaining debug images",
    async () => {
      const directory = mkdtempSync(
        path.join(tmpdir(), "r6-u6-frame-similarity-"),
      );
      temporaryDirectories.push(directory);
      const fixture = path.join(directory, "two-colors.mp4");
      execFileSync(appConfig.ffmpegPath!, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=320x180:d=1:r=30",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=320x180:d=1:r=30",
        "-filter_complex",
        "[0:v][1:v]concat=n=2:v=1:a=0[out]",
        "-map",
        "[out]",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-y",
        fixture,
      ]);

      const same = await measureRepeatedFrameSimilarity(fixture, 0.2, 0.7);
      const changed = await measureRepeatedFrameSimilarity(fixture, 0.2, 1.2);
      expect(same.similarity).toBeGreaterThan(0.99);
      expect(changed.similarity).toBeLessThan(same.similarity);
      expect(REPEATED_VIEW_METHOD_VERSION).toBe(
        "u6-downscaled-grayscale-similarity-v1",
      );
    },
  );
});
