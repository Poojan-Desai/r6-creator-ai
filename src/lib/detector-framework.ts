import type { ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

import type {
  AnalysisJob,
  DetectorDefinition,
  DetectorRun,
  DetectorRunStatus,
  LocalAnalysisStatus,
} from "@prisma/client";

import {
  dataPaths,
  detectorAnalysisDirectory,
  detectorArtifactDirectory,
  ensureDataDirectories,
  resolveDataPath,
} from "@/lib/data-paths";
import { db } from "@/lib/db";
import { detectorRegistry } from "@/lib/detectors";
import type {
  DetectorEventResult,
  DetectorRunContext,
  IsolatedDetectorResult,
  LocalDetector,
} from "@/lib/detectors";
import { AppError } from "@/lib/errors";
import { prepareSignalCurve } from "@/lib/signals/storage";

const ACTIVE_JOB_STATUSES: LocalAnalysisStatus[] = ["QUEUED", "RUNNING"];
const ACTIVE_RUN_STATUSES: DetectorRunStatus[] = ["QUEUED", "RUNNING"];
const ANALYSIS_VERSION = "phase3b2-signals-v1";

type ActiveAnalysisController = {
  cancelRequested: boolean;
  children: Set<ChildProcess>;
};

const detectorFrameworkGlobal = globalThis as unknown as {
  r6AnalysisControllers?: Map<string, ActiveAnalysisController>;
  r6AnalysisReconciled?: boolean;
};

const activeControllers =
  detectorFrameworkGlobal.r6AnalysisControllers ??
  new Map<string, ActiveAnalysisController>();
detectorFrameworkGlobal.r6AnalysisControllers = activeControllers;

export class DetectorCancelledError extends Error {}

export type DetectorDefinitionDto = {
  id: string;
  configurationId: string;
  stableId: string;
  name: string;
  version: string;
  description: string;
  requiredInputs: string[];
  parameterSchema: Record<string, unknown>;
  estimatedCost: "LOW" | "MEDIUM" | "HIGH";
  implementationState: string;
  enabled: boolean;
};

export type DetectorRunDto = {
  id: string;
  detectorStableId: string;
  detectorVersion: string;
  name: string;
  status: DetectorRunStatus;
  progress: number;
  stage: string;
  processingDurationMs: number | null;
  videoDurationSeconds: number | null;
  processedSourceSeconds: number | null;
  processingSpeedRatio: number | null;
  peakMemoryBytes: number | null;
  averageCpuPercent: number | null;
  temporaryDiskUsageBytes: number;
  permanentDataBytes: number;
  rawMeasurementCount: number;
  aggregatedMeasurementCount: number;
  generatedEventCount: number;
  curveCount: number;
  curveChunkCount: number;
  warnings: string[];
  errorMessage: string | null;
  eventCount: number;
};

export type AnalysisJobDto = {
  id: string;
  projectId: string;
  status: LocalAnalysisStatus;
  progress: number;
  stage: string;
  analysisVersion: string;
  detectorSetVersion: string;
  enabledDetectorCount: number;
  completedDetectorCount: number;
  failedDetectorCount: number;
  warnings: string[];
  errorMessage: string | null;
  cancelRequestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  runs: DetectorRunDto[];
};

export type DetectorFrameworkStateDto = {
  phase: "3B.1";
  automaticCandidatesAvailable: false;
  message: string;
  detectors: DetectorDefinitionDto[];
  jobs: AnalysisJobDto[];
};

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function detectorSetVersion(
  values: Array<{ stableId: string; version: string }>,
) {
  const canonical = [...values]
    .sort((left, right) =>
      `${left.stableId}@${left.version}`.localeCompare(
        `${right.stableId}@${right.version}`,
      ),
    )
    .map((value) => `${value.stableId}@${value.version}`)
    .join("|");
  return `detector-set-${createHash("sha256").update(canonical).digest("hex").slice(0, 12)}`;
}

export function validateDetectorEvent(
  event: DetectorEventResult,
  durationSeconds: number,
) {
  const values = [
    event.startSeconds,
    event.peakSeconds,
    event.endSeconds,
    event.confidence,
    event.processingDurationMs,
  ];
  if (!values.every(Number.isFinite)) {
    throw new Error("Detector returned non-finite measurements.");
  }
  if (
    event.startSeconds < 0 ||
    event.endSeconds > durationSeconds + 0.001 ||
    event.peakSeconds < event.startSeconds ||
    event.peakSeconds > event.endSeconds ||
    event.endSeconds <= event.startSeconds
  ) {
    throw new Error("Detector returned timestamps outside the recording.");
  }
  if (event.confidence < 0 || event.confidence > 1) {
    throw new Error("Detector confidence must be between zero and one.");
  }
  if (event.processingDurationMs < 0) {
    throw new Error("Detector processing duration cannot be negative.");
  }
}

export async function runDetectorsWithIsolation(input: {
  detectors: LocalDetector[];
  createContext: (detector: LocalDetector) => DetectorRunContext;
}): Promise<IsolatedDetectorResult[]> {
  const results: IsolatedDetectorResult[] = [];
  for (const detector of input.detectors) {
    const context = input.createContext(detector);
    try {
      context.throwIfCancellationRequested();
      const output = await detector.run(context);
      results.push({
        stableId: detector.stableId,
        version: detector.version,
        status: "COMPLETED",
        output,
        errorMessage: null,
      });
    } catch (error) {
      results.push({
        stableId: detector.stableId,
        version: detector.version,
        status: error instanceof DetectorCancelledError ? "CANCELLED" : "ERROR",
        output: null,
        errorMessage:
          error instanceof Error ? error.message : "Detector failed.",
      });
    } finally {
      await detector.cleanup?.(context).catch(() => undefined);
    }
  }
  return results;
}

export async function syncDetectorDefinitions() {
  const definitions: DetectorDefinition[] = [];
  for (const detector of detectorRegistry.list()) {
    const definition = await db.detectorDefinition.upsert({
      where: {
        stableId_version: {
          stableId: detector.stableId,
          version: detector.version,
        },
      },
      update: {
        name: detector.name,
        description: detector.description,
        requiredInputsJson: JSON.stringify(detector.requiredInputs),
        parameterSchemaJson: JSON.stringify(detector.parameters),
        estimatedCost: detector.estimatedCost,
        implementationState: detector.implementationState,
        enabledByDefault: detector.enabledByDefault,
      },
      create: {
        stableId: detector.stableId,
        name: detector.name,
        version: detector.version,
        description: detector.description,
        requiredInputsJson: JSON.stringify(detector.requiredInputs),
        parameterSchemaJson: JSON.stringify(detector.parameters),
        estimatedCost: detector.estimatedCost,
        implementationState: detector.implementationState,
        enabledByDefault: detector.enabledByDefault,
      },
    });
    definitions.push(definition);
  }
  return definitions;
}

async function ensureProjectConfigurations(projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) {
    throw new AppError(
      "That project no longer exists.",
      404,
      "PROJECT_NOT_FOUND",
    );
  }
  const definitions = await syncDetectorDefinitions();
  for (const definition of definitions) {
    await db.detectorConfiguration.upsert({
      where: {
        projectId_detectorDefinitionId: {
          projectId,
          detectorDefinitionId: definition.id,
        },
      },
      update: {},
      create: {
        projectId,
        detectorDefinitionId: definition.id,
        enabled: definition.enabledByDefault,
        parametersJson: "{}",
      },
    });
  }
  return db.detectorConfiguration.findMany({
    where: { projectId },
    include: { detectorDefinition: true },
    orderBy: { createdAt: "asc" },
  });
}

function serializeDetectorRun(
  run: DetectorRun & {
    detectorDefinition: DetectorDefinition;
    _count: { events: number; signalCurves: number };
  },
): DetectorRunDto {
  return {
    id: run.id,
    detectorStableId: run.detectorStableId,
    detectorVersion: run.detectorVersion,
    name: run.detectorDefinition.name,
    status: run.status,
    progress: run.progress,
    stage: run.stage,
    processingDurationMs: run.processingDurationMs,
    videoDurationSeconds: run.videoDurationSeconds,
    processedSourceSeconds: run.processedSourceSeconds,
    processingSpeedRatio: run.processingSpeedRatio,
    peakMemoryBytes:
      run.peakMemoryBytes === null ? null : Number(run.peakMemoryBytes),
    averageCpuPercent: run.averageCpuPercent,
    temporaryDiskUsageBytes: Number(run.temporaryDiskUsageBytes),
    permanentDataBytes: Number(run.permanentDataBytes),
    rawMeasurementCount: run.rawMeasurementCount,
    aggregatedMeasurementCount: run.aggregatedMeasurementCount,
    generatedEventCount: run.generatedEventCount,
    curveCount: run._count.signalCurves,
    curveChunkCount: run.curveChunkCount,
    warnings: parseJsonArray(run.warningsJson),
    errorMessage: run.errorMessage,
    eventCount: run._count.events,
  };
}

function serializeAnalysisJob(
  job: AnalysisJob & {
    detectorRuns: Array<
      DetectorRun & {
        detectorDefinition: DetectorDefinition;
        _count: { events: number; signalCurves: number };
      }
    >;
  },
): AnalysisJobDto {
  return {
    id: job.id,
    projectId: job.projectId,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    analysisVersion: job.analysisVersion,
    detectorSetVersion: job.detectorSetVersion,
    enabledDetectorCount: job.enabledDetectorCount,
    completedDetectorCount: job.completedDetectorCount,
    failedDetectorCount: job.failedDetectorCount,
    warnings: parseJsonArray(job.warningsJson),
    errorMessage: job.errorMessage,
    cancelRequestedAt: job.cancelRequestedAt?.toISOString() ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    runs: job.detectorRuns.map(serializeDetectorRun),
  };
}

export async function reconcileInterruptedAnalysisJobs() {
  if (detectorFrameworkGlobal.r6AnalysisReconciled) return;
  const activeIds = [...activeControllers.keys()];
  const idFilter = activeIds.length > 0 ? { notIn: activeIds } : undefined;
  const cancelled = await db.analysisJob.findMany({
    where: {
      id: idFilter,
      status: { in: ACTIVE_JOB_STATUSES },
      cancelRequestedAt: { not: null },
    },
    select: { id: true },
  });
  const interrupted = await db.analysisJob.findMany({
    where: {
      id: idFilter,
      status: { in: ACTIVE_JOB_STATUSES },
      cancelRequestedAt: null,
    },
    select: { id: true },
  });
  const now = new Date();
  if (cancelled.length > 0) {
    const ids = cancelled.map(({ id }) => id);
    await db.$transaction([
      db.detectorEvent.deleteMany({
        where: {
          detectorRun: {
            analysisJobId: { in: ids },
            status: { in: ACTIVE_RUN_STATUSES },
          },
        },
      }),
      db.signalCurve.deleteMany({
        where: {
          detectorRun: {
            analysisJobId: { in: ids },
            status: { in: ACTIVE_RUN_STATUSES },
          },
        },
      }),
      db.detectorRun.updateMany({
        where: {
          analysisJobId: { in: ids },
          status: { in: ACTIVE_RUN_STATUSES },
        },
        data: { status: "CANCELLED", stage: "Cancelled", completedAt: now },
      }),
      db.analysisJob.updateMany({
        where: { id: { in: ids } },
        data: {
          status: "CANCELLED",
          stage: "Cancelled",
          completedAt: now,
          errorMessage: null,
        },
      }),
    ]);
  }
  if (interrupted.length > 0) {
    const ids = interrupted.map(({ id }) => id);
    await db.$transaction([
      db.detectorEvent.deleteMany({
        where: {
          detectorRun: {
            analysisJobId: { in: ids },
            status: { in: ACTIVE_RUN_STATUSES },
          },
        },
      }),
      db.signalCurve.deleteMany({
        where: {
          detectorRun: {
            analysisJobId: { in: ids },
            status: { in: ACTIVE_RUN_STATUSES },
          },
        },
      }),
      db.detectorRun.updateMany({
        where: {
          analysisJobId: { in: ids },
          status: { in: ACTIVE_RUN_STATUSES },
        },
        data: {
          status: "ERROR",
          stage: "Interrupted",
          errorMessage: "Detector run stopped when the application restarted.",
          completedAt: now,
        },
      }),
      db.analysisJob.updateMany({
        where: { id: { in: ids } },
        data: {
          status: "ERROR",
          stage: "Interrupted",
          errorMessage:
            "Local analysis stopped when the application restarted. Retry it when ready.",
          completedAt: now,
        },
      }),
    ]);
  }
  detectorFrameworkGlobal.r6AnalysisReconciled = true;
  await cleanupDetectorArtifacts();
}

export async function getDetectorFrameworkState(
  projectId: string,
): Promise<DetectorFrameworkStateDto> {
  await reconcileInterruptedAnalysisJobs();
  const configurations = await ensureProjectConfigurations(projectId);
  const jobs = await db.analysisJob.findMany({
    where: { projectId },
    include: {
      detectorRuns: {
        include: {
          detectorDefinition: true,
          _count: { select: { events: true, signalCurves: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return {
    phase: "3B.1",
    automaticCandidatesAvailable: false,
    message:
      "Phase 3B.1 provides labeling and job foundations only. Automatic candidate detectors begin in Phase 3B.2.",
    detectors: configurations.map((configuration) => ({
      id: configuration.detectorDefinition.id,
      configurationId: configuration.id,
      stableId: configuration.detectorDefinition.stableId,
      name: configuration.detectorDefinition.name,
      version: configuration.detectorDefinition.version,
      description: configuration.detectorDefinition.description,
      requiredInputs: parseJsonArray(
        configuration.detectorDefinition.requiredInputsJson,
      ),
      parameterSchema: parseJsonObject(
        configuration.detectorDefinition.parameterSchemaJson,
      ),
      estimatedCost: configuration.detectorDefinition.estimatedCost,
      implementationState: configuration.detectorDefinition.implementationState,
      enabled: configuration.enabled,
    })),
    jobs: jobs.map(serializeAnalysisJob),
  };
}

async function createJobFromConfigurations(
  projectId: string,
  configurations: Awaited<ReturnType<typeof ensureProjectConfigurations>>,
) {
  const enabled = configurations.filter(
    (configuration) => configuration.enabled,
  );
  if (enabled.length === 0) {
    throw new AppError(
      "Enable at least one local detector before starting analysis.",
      400,
      "NO_DETECTORS_ENABLED",
    );
  }
  const existing = await db.analysisJob.findFirst({
    where: { projectId, status: { in: ACTIVE_JOB_STATUSES } },
  });
  if (existing) {
    throw new AppError(
      "This project already has a local analysis in progress.",
      409,
      "ANALYSIS_ALREADY_RUNNING",
    );
  }
  const setVersion = detectorSetVersion(
    enabled.map(({ detectorDefinition }) => detectorDefinition),
  );
  const job = await db.analysisJob.create({
    data: {
      projectId,
      analysisVersion: ANALYSIS_VERSION,
      detectorSetVersion: setVersion,
      enabledDetectorCount: enabled.length,
      estimatedWorkUnits: enabled.reduce(
        (total, configuration) =>
          total +
          (configuration.detectorDefinition.estimatedCost === "HIGH"
            ? 8
            : configuration.detectorDefinition.estimatedCost === "MEDIUM"
              ? 4
              : 1),
        0,
      ),
      detectorRuns: {
        create: enabled.map((configuration) => ({
          detectorDefinitionId: configuration.detectorDefinition.id,
          detectorStableId: configuration.detectorDefinition.stableId,
          detectorVersion: configuration.detectorDefinition.version,
          requiredInputsJson:
            configuration.detectorDefinition.requiredInputsJson,
          parametersJson: configuration.parametersJson,
        })),
      },
    },
  });
  scheduleAnalysisJob(job.id);
  return job;
}

export async function startAnalysisJob(projectId: string) {
  return createJobFromConfigurations(
    projectId,
    await ensureProjectConfigurations(projectId),
  );
}

export async function updateDetectorConfiguration(
  projectId: string,
  detectorDefinitionId: string,
  input: { enabled: boolean; parameters: Record<string, unknown> },
) {
  await ensureProjectConfigurations(projectId);
  const configuration = await db.detectorConfiguration.findUnique({
    where: {
      projectId_detectorDefinitionId: { projectId, detectorDefinitionId },
    },
  });
  if (!configuration) {
    throw new AppError(
      "That detector is not available for this project.",
      404,
      "DETECTOR_NOT_FOUND",
    );
  }
  await db.detectorConfiguration.update({
    where: { id: configuration.id },
    data: {
      enabled: input.enabled,
      parametersJson: JSON.stringify(input.parameters),
    },
  });
  return getDetectorFrameworkState(projectId);
}

export async function runAnalysisJob(jobId: string) {
  if (activeControllers.has(jobId)) return;
  const controller: ActiveAnalysisController = {
    cancelRequested: false,
    children: new Set(),
  };
  activeControllers.set(jobId, controller);
  const temporaryDirectory = detectorAnalysisDirectory(jobId);
  const artifactDirectory = detectorArtifactDirectory(jobId);
  try {
    const job = await db.analysisJob.findUnique({
      where: { id: jobId },
      include: {
        project: true,
        detectorRuns: {
          include: { detectorDefinition: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!job || job.status !== "QUEUED" || job.cancelRequestedAt) return;
    await ensureDataDirectories();
    await mkdir(temporaryDirectory, { recursive: true });
    await db.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "RUNNING",
        progress: 1,
        stage: "Starting local detector framework",
        startedAt: new Date(),
        errorMessage: null,
      },
    });

    let completedCount = 0;
    let failedCount = 0;
    const jobWarnings: string[] = [];
    for (const [index, run] of job.detectorRuns.entries()) {
      if (controller.cancelRequested) break;
      const detector = detectorRegistry.get(
        run.detectorStableId,
        run.detectorVersion,
      );
      if (!detector) {
        failedCount += 1;
        await db.detectorRun.update({
          where: { id: run.id },
          data: {
            status: "ERROR",
            stage: "Detector version unavailable",
            errorMessage: `Detector ${run.detectorStableId}@${run.detectorVersion} is not installed.`,
            completedAt: new Date(),
          },
        });
        continue;
      }
      const runTemporaryDirectory = path.join(temporaryDirectory, run.id);
      await mkdir(runTemporaryDirectory, { recursive: true });
      const started = performance.now();
      const startingMemoryBytes = process.memoryUsage().rss;
      await db.$transaction([
        db.detectorRun.update({
          where: { id: run.id },
          data: {
            status: "RUNNING",
            progress: 1,
            stage: `Running ${detector.name}`,
            startedAt: new Date(),
            errorMessage: null,
          },
        }),
        db.analysisJob.update({
          where: { id: jobId },
          data: {
            currentDetectorStableId: detector.stableId,
            stage: `Running ${detector.name}`,
          },
        }),
      ]);
      const context: DetectorRunContext = {
        analysisJobId: jobId,
        detectorRunId: run.id,
        project: {
          id: job.project.id,
          durationSeconds: job.project.durationSeconds,
          width: job.project.width,
          height: job.project.height,
          frameRate: job.project.frameRate,
          sourcePath: resolveDataPath(job.project.sourceRelativePath),
        },
        parameters: parseJsonObject(run.parametersJson),
        temporaryDirectory: runTemporaryDirectory,
        artifactDirectory,
        isCancellationRequested: () => controller.cancelRequested,
        throwIfCancellationRequested: () => {
          if (controller.cancelRequested) {
            throw new DetectorCancelledError("Analysis was cancelled.");
          }
        },
        registerChildProcess: (child) => {
          controller.children.add(child);
          return () => controller.children.delete(child);
        },
        reportProgress: async ({ progress, stage }) => {
          const bounded = Math.max(0, Math.min(100, Math.round(progress)));
          await db.$transaction([
            db.detectorRun.updateMany({
              where: { id: run.id, status: "RUNNING" },
              data: { progress: bounded, stage },
            }),
            db.analysisJob.updateMany({
              where: { id: jobId, status: "RUNNING" },
              data: {
                progress: Math.min(
                  99,
                  Math.round(
                    ((index + bounded / 100) / job.detectorRuns.length) * 100,
                  ),
                ),
                stage,
              },
            }),
          ]);
        },
      };

      try {
        const output = await detector.run(context);
        context.throwIfCancellationRequested();
        for (const event of output.events) {
          validateDetectorEvent(event, job.project.durationSeconds);
        }
        const processingDurationMs = Math.max(
          0,
          Math.round(performance.now() - started),
        );
        const curveIds = new Set<string>();
        const preparedCurves = (output.curves ?? []).map((curve) => {
          if (curveIds.has(curve.stableId)) {
            throw new Error(
              `Detector returned duplicate signal curve ${curve.stableId}.`,
            );
          }
          curveIds.add(curve.stableId);
          return prepareSignalCurve(
            { ...curve, detectorRunId: run.id },
            job.project.durationSeconds,
          );
        });
        const processedSourceSeconds =
          output.performance?.processedSourceSeconds;
        if (
          processedSourceSeconds !== undefined &&
          (!Number.isFinite(processedSourceSeconds) ||
            processedSourceSeconds < 0 ||
            processedSourceSeconds > job.project.durationSeconds + 0.001)
        ) {
          throw new Error("Detector reported invalid processed source time.");
        }
        const measuredPeakMemoryBytes = Math.max(
          startingMemoryBytes,
          process.memoryUsage().rss,
          output.performance?.peakMemoryBytes ?? 0,
        );
        const wallSeconds = processingDurationMs / 1_000;
        const rawMeasurementCount = preparedCurves.reduce(
          (total, prepared) => total + prepared.curve.rawPointCount,
          0,
        );
        const aggregatedMeasurementCount = preparedCurves.reduce(
          (total, prepared) => total + prepared.curve.storedPointCount,
          0,
        );
        const curveChunkCount = preparedCurves.reduce(
          (total, prepared) => total + prepared.chunks.length,
          0,
        );
        const permanentDataBytes = preparedCurves.reduce(
          (total, prepared) => total + prepared.permanentDataBytes,
          0,
        );
        await db.$transaction(async (transaction) => {
          await transaction.detectorEvent.deleteMany({
            where: { detectorRunId: run.id },
          });
          await transaction.signalCurve.deleteMany({
            where: { detectorRunId: run.id },
          });
          for (const event of output.events) {
            await transaction.detectorEvent.create({
              data: {
                detectorRunId: run.id,
                category: event.category,
                startSeconds: event.startSeconds,
                peakSeconds: event.peakSeconds,
                endSeconds: event.endSeconds,
                confidence: event.confidence,
                supportingEvidenceJson: JSON.stringify(
                  event.supportingEvidence,
                ),
                conflictingEvidenceJson: JSON.stringify(
                  event.conflictingEvidence,
                ),
                sourceSignal: event.sourceSignal,
                rawMeasurementsJson: JSON.stringify(event.rawMeasurements),
                thresholdsJson: JSON.stringify(event.thresholds),
                debugArtifactsJson: JSON.stringify(event.debugArtifacts ?? []),
                processingDurationMs: event.processingDurationMs,
                warningMessagesJson: JSON.stringify(
                  event.warningMessages ?? [],
                ),
                evidence: {
                  create: (event.evidence ?? []).map((evidence) => ({
                    kind: evidence.kind,
                    sourceSignal: evidence.sourceSignal,
                    summary: evidence.summary,
                    timestampSeconds: evidence.timestampSeconds,
                    dataJson: JSON.stringify(evidence.data ?? {}),
                    artifactRelativePath: evidence.artifactRelativePath,
                    containsPersonalData:
                      evidence.containsPersonalData ?? false,
                  })),
                },
              },
            });
          }
          for (const prepared of preparedCurves) {
            await transaction.signalCurve.create({
              data: {
                ...prepared.curve,
                chunks: {
                  create: prepared.chunks.map((chunk) => ({
                    chunkIndex: chunk.chunkIndex,
                    startSeconds: chunk.startSeconds,
                    endSeconds: chunk.endSeconds,
                    pointCount: chunk.pointCount,
                    encoding: chunk.encoding,
                    payload: chunk.payload,
                    rawSizeBytes: chunk.rawSizeBytes,
                    compressedSizeBytes: chunk.compressedSizeBytes,
                    minimumNormalizedValue: chunk.minimumNormalizedValue,
                    maximumNormalizedValue: chunk.maximumNormalizedValue,
                    maximumAbsoluteDeviation: chunk.maximumAbsoluteDeviation,
                  })),
                },
              },
            });
          }
          await transaction.detectorRun.update({
            where: { id: run.id },
            data: {
              status: "COMPLETED",
              progress: 100,
              stage: "Detector complete",
              processingDurationMs,
              videoDurationSeconds: job.project.durationSeconds,
              processedSourceSeconds: processedSourceSeconds ?? null,
              processingSpeedRatio:
                processedSourceSeconds !== undefined && wallSeconds > 0
                  ? processedSourceSeconds / wallSeconds
                  : null,
              peakMemoryBytes: BigInt(measuredPeakMemoryBytes),
              averageCpuPercent: output.performance?.averageCpuPercent ?? null,
              temporaryDiskUsageBytes: BigInt(
                output.performance?.temporaryDiskUsageBytes ?? 0,
              ),
              permanentDataBytes: BigInt(permanentDataBytes),
              rawMeasurementCount,
              aggregatedMeasurementCount,
              generatedEventCount: output.events.length,
              curveChunkCount,
              warningsJson: JSON.stringify(output.warnings),
              completedAt: new Date(),
            },
          });
        });
        completedCount += 1;
        jobWarnings.push(...output.warnings);
      } catch (error) {
        if (
          error instanceof DetectorCancelledError ||
          controller.cancelRequested
        ) {
          break;
        }
        failedCount += 1;
        await db.detectorRun.update({
          where: { id: run.id },
          data: {
            status: "ERROR",
            stage: "Detector failed; remaining detectors will continue",
            processingDurationMs: Math.max(
              0,
              Math.round(performance.now() - started),
            ),
            errorMessage:
              error instanceof Error
                ? error.message.slice(0, 1_000)
                : "Detector failed.",
            completedAt: new Date(),
          },
        });
      } finally {
        await detector.cleanup?.(context).catch(() => undefined);
        await rm(runTemporaryDirectory, { recursive: true, force: true }).catch(
          () => undefined,
        );
      }
      await db.analysisJob.updateMany({
        where: { id: jobId, status: "RUNNING" },
        data: {
          completedDetectorCount: completedCount,
          failedDetectorCount: failedCount,
        },
      });
    }

    if (controller.cancelRequested) {
      const now = new Date();
      await db.$transaction([
        db.detectorEvent.deleteMany({
          where: { detectorRun: { analysisJobId: jobId } },
        }),
        db.signalCurve.deleteMany({
          where: { detectorRun: { analysisJobId: jobId } },
        }),
        db.candidateMoment.deleteMany({ where: { analysisJobId: jobId } }),
        db.detectorRun.updateMany({
          where: { analysisJobId: jobId, status: { in: ACTIVE_RUN_STATUSES } },
          data: { status: "CANCELLED", stage: "Cancelled", completedAt: now },
        }),
        db.analysisJob.update({
          where: { id: jobId },
          data: {
            status: "CANCELLED",
            stage: "Cancelled",
            currentDetectorStableId: null,
            warningsJson: "[]",
            errorMessage: null,
            completedAt: now,
          },
        }),
      ]);
    } else {
      await db.analysisJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          progress: 100,
          stage:
            failedCount > 0
              ? "Framework check complete with isolated detector failures"
              : "Framework check complete",
          currentDetectorStableId: null,
          completedDetectorCount: completedCount,
          failedDetectorCount: failedCount,
          warningsJson: JSON.stringify([...new Set(jobWarnings)]),
          completedAt: new Date(),
          errorMessage: null,
        },
      });
    }
  } catch (error) {
    await db.analysisJob
      .update({
        where: { id: jobId },
        data: {
          status: controller.cancelRequested ? "CANCELLED" : "ERROR",
          stage: controller.cancelRequested
            ? "Cancelled"
            : "Analysis framework failed",
          errorMessage: controller.cancelRequested
            ? null
            : error instanceof Error
              ? error.message.slice(0, 1_000)
              : "The local analysis framework could not finish.",
          completedAt: new Date(),
        },
      })
      .catch(() => undefined);
  } finally {
    for (const child of controller.children) child.kill("SIGTERM");
    activeControllers.delete(jobId);
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}

export function scheduleAnalysisJob(jobId: string) {
  setImmediate(() => void runAnalysisJob(jobId));
}

export async function cancelAnalysisJob(jobId: string) {
  const job = await db.analysisJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new AppError(
      "That analysis job no longer exists.",
      404,
      "ANALYSIS_NOT_FOUND",
    );
  }
  if (!ACTIVE_JOB_STATUSES.includes(job.status)) return job;
  const now = new Date();
  const controller = activeControllers.get(jobId);
  if (!controller) {
    return db.$transaction(async (transaction) => {
      await transaction.detectorEvent.deleteMany({
        where: { detectorRun: { analysisJobId: jobId } },
      });
      await transaction.signalCurve.deleteMany({
        where: { detectorRun: { analysisJobId: jobId } },
      });
      return transaction.analysisJob.update({
        where: { id: jobId },
        data: {
          status: "CANCELLED",
          stage: "Cancelled",
          cancelRequestedAt: now,
          completedAt: now,
        },
      });
    });
  }
  controller.cancelRequested = true;
  for (const child of controller.children) {
    child.kill("SIGTERM");
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 2_000);
    forceKill.unref();
  }
  return db.analysisJob.update({
    where: { id: jobId },
    data: { stage: "Cancelling local analysis", cancelRequestedAt: now },
  });
}

export async function retryAnalysisJob(jobId: string) {
  const job = await db.analysisJob.findUnique({
    where: { id: jobId },
    include: {
      detectorRuns: { include: { detectorDefinition: true } },
    },
  });
  if (!job) {
    throw new AppError(
      "That analysis job no longer exists.",
      404,
      "ANALYSIS_NOT_FOUND",
    );
  }
  if (ACTIVE_JOB_STATUSES.includes(job.status)) {
    throw new AppError(
      "Cancel the active analysis before retrying it.",
      409,
      "ANALYSIS_STILL_ACTIVE",
    );
  }
  const configurations = await ensureProjectConfigurations(job.projectId);
  const selectedIds = new Set(
    job.detectorRuns.map((run) => run.detectorDefinitionId),
  );
  const pinned = configurations
    .filter((configuration) =>
      selectedIds.has(configuration.detectorDefinitionId),
    )
    .map((configuration) => ({ ...configuration, enabled: true }));
  return createJobFromConfigurations(job.projectId, pinned);
}

export async function deleteAnalysisJob(jobId: string) {
  const job = await db.analysisJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new AppError(
      "That analysis job no longer exists.",
      404,
      "ANALYSIS_NOT_FOUND",
    );
  }
  if (ACTIVE_JOB_STATUSES.includes(job.status)) {
    throw new AppError(
      "Cancel the active analysis before deleting it.",
      409,
      "ANALYSIS_STILL_ACTIVE",
    );
  }
  await db.analysisJob.delete({ where: { id: jobId } });
  await Promise.all([
    rm(detectorAnalysisDirectory(jobId), { recursive: true, force: true }),
    rm(detectorArtifactDirectory(jobId), { recursive: true, force: true }),
  ]).catch(() => undefined);
}

export async function cleanupDetectorArtifacts() {
  await ensureDataDirectories();
  const active = new Set(
    (
      await db.analysisJob.findMany({
        where: { status: { in: ACTIVE_JOB_STATUSES } },
        select: { id: true },
      })
    ).map(({ id }) => id),
  );
  const existing = new Set(
    (await db.analysisJob.findMany({ select: { id: true } })).map(
      ({ id }) => id,
    ),
  );
  const [temporaryEntries, artifactEntries] = await Promise.all([
    readdir(dataPaths.detectorAnalysisTemp, { withFileTypes: true }).catch(
      () => [],
    ),
    readdir(dataPaths.detectorArtifacts, { withFileTypes: true }).catch(
      () => [],
    ),
  ]);
  await Promise.all([
    ...temporaryEntries
      .filter((entry) => entry.isDirectory() && !active.has(entry.name))
      .map((entry) =>
        rm(detectorAnalysisDirectory(entry.name), {
          recursive: true,
          force: true,
        }),
      ),
    ...artifactEntries
      .filter((entry) => entry.isDirectory() && !existing.has(entry.name))
      .map((entry) =>
        rm(detectorArtifactDirectory(entry.name), {
          recursive: true,
          force: true,
        }),
      ),
  ]);
}

export function getAnalysisVersion() {
  return ANALYSIS_VERSION;
}
