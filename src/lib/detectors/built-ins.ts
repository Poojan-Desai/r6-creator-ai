import { stat } from "node:fs/promises";

import type { LocalDetector } from "@/lib/detectors/types";

export const mediaIntegrityDetector: LocalDetector = {
  stableId: "core.media-integrity",
  name: "Local media integrity check",
  version: "1.0.0",
  description:
    "Confirms the project file is still readable and its saved metadata is usable. It does not detect gameplay moments.",
  requiredInputs: ["VIDEO"],
  parameters: {},
  enabledByDefault: true,
  estimatedCost: "LOW",
  executionOrder: 0,
  implementationState: "FRAMEWORK_ONLY",
  async run(context) {
    context.throwIfCancellationRequested();
    await context.reportProgress({
      progress: 25,
      stage: "Checking local file",
    });
    const source = await stat(context.project.sourcePath);
    context.throwIfCancellationRequested();
    await context.reportProgress({
      progress: 75,
      stage: "Checking saved video metadata",
    });
    if (
      source.size <= 0 ||
      context.project.durationSeconds <= 0 ||
      context.project.width <= 0 ||
      context.project.height <= 0 ||
      context.project.frameRate <= 0
    ) {
      throw new Error("The project's local media metadata is incomplete.");
    }
    return {
      events: [],
      warnings: [
        "The media-integrity check emits no signal events. Review the completed broad detectors separately.",
      ],
    };
  },
};
