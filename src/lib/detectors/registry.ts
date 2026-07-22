import type { LocalDetector } from "@/lib/detectors/types";

export class DetectorRegistry {
  private readonly detectors = new Map<string, LocalDetector>();

  register(detector: LocalDetector) {
    const key = DetectorRegistry.key(detector.stableId, detector.version);
    if (this.detectors.has(key)) {
      throw new Error(
        `Detector ${detector.stableId}@${detector.version} is already registered.`,
      );
    }
    this.detectors.set(key, detector);
    return this;
  }

  get(stableId: string, version: string) {
    return this.detectors.get(DetectorRegistry.key(stableId, version)) ?? null;
  }

  list() {
    return [...this.detectors.values()].sort((left, right) =>
      `${left.stableId}@${left.version}`.localeCompare(
        `${right.stableId}@${right.version}`,
      ),
    );
  }

  listEnabled(parameters: Map<string, boolean> = new Map()) {
    return this.list().filter(
      (detector) =>
        parameters.get(
          DetectorRegistry.key(detector.stableId, detector.version),
        ) ?? detector.enabledByDefault,
    );
  }

  static key(stableId: string, version: string) {
    return `${stableId}@${version}`;
  }
}

export const detectorRegistry = new DetectorRegistry();
