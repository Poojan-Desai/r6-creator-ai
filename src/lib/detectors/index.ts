import { generalAudioDetectors } from "@/lib/detectors/audio-detectors";
import { mediaIntegrityDetector } from "@/lib/detectors/built-ins";
import { detectorRegistry } from "@/lib/detectors/registry";
import { generalTranscriptDetectors } from "@/lib/detectors/transcript-detectors";
import { generalVideoDetectors } from "@/lib/detectors/video-detectors";

for (const detector of [
  mediaIntegrityDetector,
  ...generalVideoDetectors,
  ...generalAudioDetectors,
  ...generalTranscriptDetectors,
]) {
  if (!detectorRegistry.get(detector.stableId, detector.version)) {
    detectorRegistry.register(detector);
  }
}

export { detectorRegistry } from "@/lib/detectors/registry";
export * from "@/lib/detectors/types";
