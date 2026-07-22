import { mediaIntegrityDetector } from "@/lib/detectors/built-ins";
import { detectorRegistry } from "@/lib/detectors/registry";

if (
  !detectorRegistry.get(
    mediaIntegrityDetector.stableId,
    mediaIntegrityDetector.version,
  )
) {
  detectorRegistry.register(mediaIntegrityDetector);
}

export { detectorRegistry } from "@/lib/detectors/registry";
export * from "@/lib/detectors/types";
