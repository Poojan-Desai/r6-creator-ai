import { describe, expect, it } from "vitest";

import {
  DetectorCancelledError,
  runDetectorsWithIsolation,
  validateDetectorEvent,
} from "@/lib/detector-framework";
import { DetectorRegistry } from "@/lib/detectors/registry";
import type { DetectorRunContext, LocalDetector } from "@/lib/detectors/types";

function detector(
  stableId: string,
  run: LocalDetector["run"],
  options: { version?: string; enabled?: boolean } = {},
): LocalDetector {
  return {
    stableId,
    name: stableId,
    version: options.version ?? "1.0.0",
    description: "Deterministic test detector",
    requiredInputs: ["VIDEO"],
    parameters: {},
    enabledByDefault: options.enabled ?? true,
    estimatedCost: "LOW",
    implementationState: "ACTIVE",
    run,
  };
}

function context(cancelled = false): DetectorRunContext {
  return {
    analysisJobId: "job",
    detectorRunId: "run",
    project: {
      id: "project",
      durationSeconds: 60,
      width: 1920,
      height: 1080,
      frameRate: 60,
      sourcePath: "/safe/test.mp4",
    },
    parameters: {},
    temporaryDirectory: "/safe/temp",
    artifactDirectory: "/safe/artifacts",
    reportProgress: async () => undefined,
    isCancellationRequested: () => cancelled,
    throwIfCancellationRequested: () => {
      if (cancelled) throw new DetectorCancelledError("Cancelled");
    },
    registerChildProcess: () => () => undefined,
  };
}

describe("detector registry", () => {
  it("persists stable IDs and versions without allowing duplicates", () => {
    const registry = new DetectorRegistry();
    registry.register(
      detector("video.scene", async () => ({ events: [], warnings: [] })),
    );
    registry.register(
      detector("video.scene", async () => ({ events: [], warnings: [] }), {
        version: "2.0.0",
      }),
    );
    expect(registry.get("video.scene", "1.0.0")?.version).toBe("1.0.0");
    expect(registry.get("video.scene", "2.0.0")?.version).toBe("2.0.0");
    expect(() =>
      registry.register(
        detector("video.scene", async () => ({ events: [], warnings: [] })),
      ),
    ).toThrow(/already registered/);
  });

  it("honors detector enable and disable state", () => {
    const registry = new DetectorRegistry();
    registry.register(
      detector("enabled", async () => ({ events: [], warnings: [] })),
    );
    registry.register(
      detector("disabled", async () => ({ events: [], warnings: [] }), {
        enabled: false,
      }),
    );
    expect(registry.listEnabled().map((item) => item.stableId)).toEqual([
      "enabled",
    ]);
    expect(
      registry
        .listEnabled(new Map([["disabled@1.0.0", true]]))
        .map((item) => item.stableId),
    ).toEqual(["disabled", "enabled"]);
  });
});

describe("detector failure isolation and cancellation", () => {
  it("continues after one detector fails", async () => {
    const results = await runDetectorsWithIsolation({
      detectors: [
        detector("failure", async () => {
          throw new Error("Controlled failure");
        }),
        detector("success", async () => ({
          events: [],
          warnings: ["Finished after the failure"],
        })),
      ],
      createContext: () => context(false),
    });
    expect(results.map((result) => result.status)).toEqual([
      "ERROR",
      "COMPLETED",
    ]);
    expect(results[0]?.errorMessage).toBe("Controlled failure");
    expect(results[1]?.output?.warnings).toContain(
      "Finished after the failure",
    );
  });

  it("returns a cancelled result without output", async () => {
    const results = await runDetectorsWithIsolation({
      detectors: [
        detector("slow", async (runContext) => {
          runContext.throwIfCancellationRequested();
          return { events: [], warnings: [] };
        }),
      ],
      createContext: () => context(true),
    });
    expect(results[0]).toMatchObject({
      stableId: "slow",
      status: "CANCELLED",
      output: null,
    });
  });

  it("rejects invalid event timestamps and confidence", () => {
    const base = {
      category: "HIGH_ACTION_GAMEPLAY" as const,
      startSeconds: 2,
      peakSeconds: 3,
      endSeconds: 4,
      confidence: 0.7,
      supportingEvidence: [],
      conflictingEvidence: [],
      sourceSignal: "MOTION" as const,
      rawMeasurements: {},
      thresholds: {},
      processingDurationMs: 10,
    };
    expect(() => validateDetectorEvent(base, 10)).not.toThrow();
    expect(() =>
      validateDetectorEvent({ ...base, endSeconds: 12 }, 10),
    ).toThrow(/outside/);
    expect(() =>
      validateDetectorEvent({ ...base, confidence: 1.2 }, 10),
    ).toThrow(/between zero and one/);
  });
});
