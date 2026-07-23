import { describe, expect, it } from "vitest";

import { validateDetectorParameters } from "@/lib/detector-framework";
import type { LocalDetector } from "@/lib/detectors";
import { validateSignalExplorerPreferences } from "@/lib/signal-explorer";

const detector: LocalDetector = {
  stableId: "fixture.settings",
  name: "Fixture settings",
  version: "1.0.0",
  description: "Fixture",
  requiredInputs: ["VIDEO"],
  parameters: {
    sampleRate: {
      type: "number",
      label: "Sample rate",
      description: "Fixture sample rate",
      defaultValue: 2,
      minimum: 0.25,
      maximum: 8,
    },
    enabledFlag: {
      type: "boolean",
      label: "Flag",
      description: "Fixture flag",
      defaultValue: true,
    },
  },
  enabledByDefault: true,
  estimatedCost: "LOW",
  implementationState: "ACTIVE",
  run: async () => ({ events: [], warnings: [] }),
};

describe("detector settings validation", () => {
  it("accepts inspectable typed settings and rejects unknown or unsafe values", () => {
    expect(
      validateDetectorParameters(detector, {
        sampleRate: 4,
        enabledFlag: false,
      }),
    ).toEqual({ sampleRate: 4, enabledFlag: false });
    expect(() =>
      validateDetectorParameters(detector, { sampleRate: 20 }),
    ).toThrow(/allowed range/);
    expect(() =>
      validateDetectorParameters(detector, { hiddenSetting: 1 }),
    ).toThrow(/not a setting/);
  });
});

describe("Signal Explorer preferences", () => {
  const valid = {
    visibleTracks: ["curve-1"],
    hiddenDetectors: ["fixture.hidden"],
    minimumConfidence: 0.45,
    zoomStartSeconds: 10,
    zoomEndSeconds: 20,
  };

  it("accepts a bounded synchronized view", () => {
    expect(validateSignalExplorerPreferences(valid, 60)).toEqual(valid);
  });

  it("rejects reversed, out-of-video, and invalid confidence ranges", () => {
    expect(() =>
      validateSignalExplorerPreferences(
        { ...valid, zoomStartSeconds: 20, zoomEndSeconds: 10 },
        60,
      ),
    ).toThrow(/zoom range/);
    expect(() =>
      validateSignalExplorerPreferences({ ...valid, zoomEndSeconds: 61 }, 60),
    ).toThrow(/zoom range/);
    expect(() =>
      validateSignalExplorerPreferences(
        { ...valid, minimumConfidence: 1.5 },
        60,
      ),
    ).toThrow();
  });
});
