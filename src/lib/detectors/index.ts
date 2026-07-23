import { mediaIntegrityDetector } from "@/lib/detectors/built-ins";
import { detectorRegistry } from "@/lib/detectors/registry";
import { generalVideoDetectors } from "@/lib/detectors/video-detectors";

for (const detector of [mediaIntegrityDetector, ...generalVideoDetectors]) {
  if (!detectorRegistry.get(detector.stableId, detector.version)) {
    detectorRegistry.register(detector);
  }
}

export { detectorRegistry } from "@/lib/detectors/registry";
export * from "@/lib/detectors/types";
