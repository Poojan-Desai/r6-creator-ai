import type {
  DetectorCost,
  DetectorSourceSignal,
  GroundTruthCategory,
} from "@prisma/client";
import type { ChildProcess } from "node:child_process";

export const DETECTOR_INPUTS = [
  "VIDEO",
  "AUDIO",
  "CREATOR_MICROPHONE",
  "GAME_AUDIO",
  "TRANSCRIPT",
  "OCR",
  "TEMPLATE_MATCHING",
  "FRAME_DIFFERENCE",
  "MOTION",
  "IMPORTED_TELEMETRY",
  "COMBINED_EVIDENCE",
] as const;

export type DetectorInput = (typeof DETECTOR_INPUTS)[number];

export type DetectorParameterSchema = Record<
  string,
  {
    type: "number" | "boolean" | "string";
    label: string;
    description: string;
    defaultValue: number | boolean | string;
    minimum?: number;
    maximum?: number;
  }
>;

export type DetectorEvidenceInput = {
  kind: "SUPPORTING" | "CONFLICTING";
  sourceSignal: DetectorSourceSignal;
  summary: string;
  timestampSeconds?: number;
  data?: Record<string, unknown>;
  artifactRelativePath?: string;
  containsPersonalData?: boolean;
};

export type DetectorEventResult = {
  category: GroundTruthCategory;
  startSeconds: number;
  peakSeconds: number;
  endSeconds: number;
  confidence: number;
  supportingEvidence: string[];
  conflictingEvidence: string[];
  sourceSignal: DetectorSourceSignal;
  rawMeasurements: Record<string, unknown>;
  thresholds: Record<string, unknown>;
  debugArtifacts?: string[];
  processingDurationMs: number;
  warningMessages?: string[];
  evidence?: DetectorEvidenceInput[];
};

export type DetectorRunOutput = {
  events: DetectorEventResult[];
  warnings: string[];
};

export type DetectorProgress = {
  progress: number;
  stage: string;
};

export type DetectorRunContext = {
  analysisJobId: string;
  detectorRunId: string;
  project: {
    id: string;
    durationSeconds: number;
    width: number;
    height: number;
    frameRate: number;
    sourcePath: string;
  };
  parameters: Record<string, unknown>;
  temporaryDirectory: string;
  artifactDirectory: string;
  reportProgress: (progress: DetectorProgress) => Promise<void>;
  isCancellationRequested: () => boolean;
  throwIfCancellationRequested: () => void;
  registerChildProcess: (child: ChildProcess) => () => void;
};

export type LocalDetector = {
  stableId: string;
  name: string;
  version: string;
  description: string;
  requiredInputs: DetectorInput[];
  parameters: DetectorParameterSchema;
  enabledByDefault: boolean;
  estimatedCost: DetectorCost;
  implementationState: "ACTIVE" | "FRAMEWORK_ONLY";
  run: (context: DetectorRunContext) => Promise<DetectorRunOutput>;
  cleanup?: (context: DetectorRunContext) => Promise<void>;
};

export type IsolatedDetectorResult = {
  stableId: string;
  version: string;
  status: "COMPLETED" | "ERROR" | "CANCELLED" | "SKIPPED";
  output: DetectorRunOutput | null;
  errorMessage: string | null;
};
