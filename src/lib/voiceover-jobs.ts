import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import type { VoiceoverJobStatus } from "@prisma/client";
import { z } from "zod";

import { appConfig } from "@/lib/config";
import {
  dataPaths,
  resolveDataPath,
  studioMediaDirectory,
  toDataRelativePath,
  voiceoverTemporaryDirectory,
} from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { probeStudioAudio } from "@/lib/studio-audio";
import {
  buildWhisperArguments,
  getTranscriptionHealth,
  parseFfmpegProgress,
  parseWhisperJson,
  parseWhisperProgress,
} from "@/lib/transcription";

export const VOICEOVER_PROCESSOR_VERSION = "u5-local-audio-v1";
export const VOICEOVER_CAPTION_VERSION = "u5-whisper-captions-v1";

const ACTIVE_JOB_STATUSES: VoiceoverJobStatus[] = ["QUEUED", "RUNNING"];

export const voiceoverProcessingSettingsSchema = z
  .object({
    trimStartSeconds: z.number().finite().min(0).max(14_400),
    trimEndSeconds: z.number().finite().positive().max(14_400),
    normalize: z.boolean(),
    noiseReduction: z.boolean(),
    gainDb: z.number().finite().min(-12).max(12),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.trimEndSeconds <= value.trimStartSeconds + 0.05) {
      context.addIssue({
        code: "custom",
        path: ["trimEndSeconds"],
        message: "The narration end must be after its start.",
      });
    }
  });

type ProcessingSettings = z.infer<typeof voiceoverProcessingSettingsSchema>;

type ActiveController = {
  child: ChildProcess | null;
  cancelRequested: boolean;
};

const voiceoverJobGlobal = globalThis as unknown as {
  r6VoiceoverJobControllers?: Map<string, ActiveController>;
  r6VoiceoverScheduledJobs?: Set<string>;
  r6VoiceoverJobsReconciled?: boolean;
};

const activeControllers =
  voiceoverJobGlobal.r6VoiceoverJobControllers ??
  new Map<string, ActiveController>();
const scheduledJobs =
  voiceoverJobGlobal.r6VoiceoverScheduledJobs ?? new Set<string>();
voiceoverJobGlobal.r6VoiceoverJobControllers = activeControllers;
voiceoverJobGlobal.r6VoiceoverScheduledJobs = scheduledJobs;

class VoiceoverJobCancelledError extends Error {}

function safeDiagnostic(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown local audio error";
  return message
    .replaceAll(dataPaths.root, "[local-data]")
    .replace(/\/Users\/[^/\s]+/g, "/Users/[local-user]")
    .slice(0, 4_000);
}

function activeJobIds() {
  return new Set([...activeControllers.keys(), ...scheduledJobs]);
}

async function cleanupTemporaryDirectory(jobId: string) {
  await rm(voiceoverTemporaryDirectory(jobId), {
    recursive: true,
    force: true,
  });
}

export async function reconcileVoiceoverJobs() {
  if (voiceoverJobGlobal.r6VoiceoverJobsReconciled) return;
  const activeIds = activeJobIds();
  const interrupted = await db.voiceoverJob.findMany({
    where: {
      status: { in: ACTIVE_JOB_STATUSES },
      ...(activeIds.size > 0 ? { id: { notIn: [...activeIds] } } : {}),
    },
    select: {
      id: true,
      takeId: true,
      cancelRequestedAt: true,
    },
  });
  for (const job of interrupted) {
    await cleanupTemporaryDirectory(job.id);
    const cancelled = Boolean(job.cancelRequestedAt);
    await db.$transaction([
      db.voiceoverJob.update({
        where: { id: job.id },
        data: cancelled
          ? {
              status: "CANCELLED",
              progress: 0,
              stage: "Cancelled",
              errorMessage: null,
              completedAt: new Date(),
            }
          : {
              status: "ERROR",
              progress: 0,
              stage: "Interrupted",
              errorMessage:
                "This local narration job stopped when the application restarted. Partial files were removed; start it again when ready.",
              completedAt: new Date(),
            },
      }),
      db.voiceoverTake.update({
        where: { id: job.takeId },
        data: cancelled
          ? { status: "READY", errorMessage: null }
          : {
              status: "ERROR",
              errorMessage:
                "The narration job was interrupted by an application restart.",
            },
      }),
    ]);
  }

  await mkdir(dataPaths.voiceoverTemp, { recursive: true });
  const stillActive = activeJobIds();
  for (const entry of await readdir(dataPaths.voiceoverTemp).catch(
    () => [] as string[],
  )) {
    if (!stillActive.has(entry)) {
      await rm(path.join(dataPaths.voiceoverTemp, entry), {
        recursive: true,
        force: true,
      });
    }
  }
  voiceoverJobGlobal.r6VoiceoverJobsReconciled = true;
}

export function resetVoiceoverJobReconciliationForTests() {
  voiceoverJobGlobal.r6VoiceoverJobsReconciled = false;
}

function ffmpegNumber(value: number) {
  return (Math.round(value * 1_000) / 1_000).toFixed(3);
}

export function buildVoiceoverProcessingArguments(input: {
  inputPath: string;
  outputPath: string;
  settings: ProcessingSettings;
}) {
  const duration =
    input.settings.trimEndSeconds - input.settings.trimStartSeconds;
  const filters: string[] = [];
  if (input.settings.noiseReduction) {
    filters.push("afftdn=nf=-25:tn=1");
  }
  if (input.settings.normalize) {
    filters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  }
  if (Math.abs(input.settings.gainDb) >= 0.001) {
    filters.push(`volume=${ffmpegNumber(input.settings.gainDb)}dB`);
  }
  filters.push("aresample=48000");
  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-ss",
    ffmpegNumber(input.settings.trimStartSeconds),
    "-t",
    ffmpegNumber(duration),
    "-i",
    input.inputPath,
    "-vn",
    "-af",
    filters.join(","),
    "-ac",
    "2",
    "-ar",
    "48000",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-progress",
    "pipe:1",
    "-nostats",
    "-y",
    input.outputPath,
  ];
}

export function buildVoiceoverCaptionExtractionArguments(input: {
  inputPath: string;
  outputPath: string;
}) {
  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-i",
    input.inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    "-progress",
    "pipe:1",
    "-nostats",
    "-y",
    input.outputPath,
  ];
}

function runManagedProcess(input: {
  jobId: string;
  executable: string;
  arguments: string[];
  onOutput: (output: string) => void;
}) {
  return new Promise<void>((resolve, reject) => {
    const controller = activeControllers.get(input.jobId);
    if (!controller || controller.cancelRequested) {
      reject(new VoiceoverJobCancelledError("Narration job cancelled."));
      return;
    }
    const child = spawn(input.executable, input.arguments, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    controller.child = child;
    let output = "";
    let settled = false;
    function collect(chunk: Buffer) {
      if (output.length < 500_000) output += chunk.toString();
      input.onOutput(output);
    }
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      controller.child = null;
      reject(error);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      controller.child = null;
      if (controller.cancelRequested) {
        reject(new VoiceoverJobCancelledError("Narration job cancelled."));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`The local audio process exited with code ${code}.`));
      }
    });
  });
}

function progressWriter(jobId: string) {
  let lastProgress = -1;
  let pending = Promise.resolve();
  return (progress: number, stage: string) => {
    if (progress <= lastProgress) return;
    lastProgress = progress;
    pending = pending
      .then(() =>
        db.voiceoverJob.updateMany({
          where: { id: jobId, status: { in: ACTIVE_JOB_STATUSES } },
          data: { progress, stage },
        }),
      )
      .then(() => undefined)
      .catch(() => undefined);
  };
}

async function loadJob(jobId: string) {
  return db.voiceoverJob.findUnique({
    where: { id: jobId },
    include: {
      take: {
        include: {
          sourceAsset: true,
          processedAsset: true,
          production: { select: { studioProjectId: true } },
        },
      },
    },
  });
}

async function runProcessingJob(
  job: NonNullable<Awaited<ReturnType<typeof loadJob>>>,
  controller: ActiveController,
) {
  if (!appConfig.ffmpegPath) {
    throw new AppError(
      "Local FFmpeg is unavailable. Reinstall dependencies and try again.",
      503,
      "FFMPEG_UNAVAILABLE",
    );
  }
  const settings = voiceoverProcessingSettingsSchema.parse(
    JSON.parse(job.settingsJson) as unknown,
  );
  if (settings.trimEndSeconds > job.take.sourceAsset.durationSeconds + 0.001) {
    throw new AppError(
      "The saved trim range extends beyond the original narration.",
      400,
      "VOICEOVER_TRIM_RANGE_INVALID",
    );
  }
  const temporaryDirectory = voiceoverTemporaryDirectory(job.id);
  const temporaryOutput = path.join(temporaryDirectory, "processed.m4a");
  await mkdir(temporaryDirectory, { recursive: true });
  await db.voiceoverJob.update({
    where: { id: job.id },
    data: {
      status: "RUNNING",
      progress: 2,
      stage: "Processing narration locally",
      startedAt: new Date(),
      errorMessage: null,
    },
  });
  const writeProgress = progressWriter(job.id);
  const expectedDuration = settings.trimEndSeconds - settings.trimStartSeconds;
  await runManagedProcess({
    jobId: job.id,
    executable: appConfig.ffmpegPath,
    arguments: buildVoiceoverProcessingArguments({
      inputPath: resolveDataPath(job.take.sourceAsset.relativePath),
      outputPath: temporaryOutput,
      settings,
    }),
    onOutput: (output) => {
      const value = parseFfmpegProgress(output, expectedDuration);
      if (value !== null) {
        writeProgress(
          5 + Math.round(value * 0.88),
          "Trimming and balancing narration",
        );
      }
    },
  });
  if (controller.cancelRequested) {
    throw new VoiceoverJobCancelledError("Narration job cancelled.");
  }
  await db.voiceoverJob.update({
    where: { id: job.id },
    data: { progress: 95, stage: "Saving processed narration" },
  });
  const metadata = await probeStudioAudio(temporaryOutput);
  const outputStat = await stat(temporaryOutput);
  const assetId = crypto.randomUUID();
  const finalDirectory = studioMediaDirectory(
    job.take.production.studioProjectId,
  );
  const finalPath = path.join(finalDirectory, `${assetId}.m4a`);
  await mkdir(finalDirectory, { recursive: true });
  await rename(temporaryOutput, finalPath);
  try {
    await db.$transaction([
      db.studioMediaAsset.create({
        data: {
          id: assetId,
          studioProjectId: job.take.production.studioProjectId,
          kind: "VOICEOVER",
          name: `${job.take.name} (processed)`,
          originalFilename: `${job.take.name.slice(0, 80)}-processed.m4a`,
          mimeType: "audio/mp4",
          relativePath: toDataRelativePath(finalPath),
          fileSizeBytes: BigInt(outputStat.size),
          durationSeconds: metadata.durationSeconds,
          permissionConfirmed: true,
        },
      }),
      db.voiceoverProcessedAsset.create({
        data: {
          takeId: job.take.id,
          jobId: job.id,
          assetId,
          settingsJson: JSON.stringify(settings),
        },
      }),
      db.voiceoverTake.update({
        where: { id: job.take.id },
        data: {
          processedAssetId: assetId,
          trimStartSeconds: settings.trimStartSeconds,
          trimEndSeconds: settings.trimEndSeconds,
          normalize: settings.normalize,
          noiseReduction: settings.noiseReduction,
          gainDb: settings.gainDb,
          status: "READY",
          errorMessage: null,
        },
      }),
      db.voiceoverJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          progress: 100,
          stage: "Processed narration ready",
          completedAt: new Date(),
          errorMessage: null,
        },
      }),
    ]);
  } catch (error) {
    await unlink(finalPath).catch(() => undefined);
    throw error;
  }
}

async function runCaptionJob(
  job: NonNullable<Awaited<ReturnType<typeof loadJob>>>,
  controller: ActiveController,
) {
  const health = getTranscriptionHealth();
  if (!health.ready || !appConfig.ffmpegPath || !appConfig.whisperCliPath) {
    throw new AppError(health.message, 503, "TRANSCRIPTION_NOT_READY");
  }
  const source = job.take.processedAsset ?? job.take.sourceAsset;
  const temporaryDirectory = voiceoverTemporaryDirectory(job.id);
  const wavPath = path.join(temporaryDirectory, "narration.wav");
  const outputBasePath = path.join(temporaryDirectory, "captions");
  const outputJsonPath = `${outputBasePath}.json`;
  await mkdir(temporaryDirectory, { recursive: true });
  await db.voiceoverJob.update({
    where: { id: job.id },
    data: {
      status: "RUNNING",
      progress: 2,
      stage: "Preparing narration for local speech recognition",
      startedAt: new Date(),
      errorMessage: null,
    },
  });
  const writeProgress = progressWriter(job.id);
  await runManagedProcess({
    jobId: job.id,
    executable: appConfig.ffmpegPath,
    arguments: buildVoiceoverCaptionExtractionArguments({
      inputPath: resolveDataPath(source.relativePath),
      outputPath: wavPath,
    }),
    onOutput: (output) => {
      const value = parseFfmpegProgress(output, source.durationSeconds);
      if (value !== null) {
        writeProgress(
          5 + Math.round(value * 0.2),
          "Preparing narration for captions",
        );
      }
    },
  });
  if (controller.cancelRequested) {
    throw new VoiceoverJobCancelledError("Narration job cancelled.");
  }
  await db.voiceoverJob.update({
    where: { id: job.id },
    data: {
      progress: 25,
      stage: "Generating narration captions locally",
    },
  });
  await runManagedProcess({
    jobId: job.id,
    executable: appConfig.whisperCliPath,
    arguments: buildWhisperArguments(wavPath, outputBasePath),
    onOutput: (output) => {
      const value = parseWhisperProgress(output);
      if (value !== null) {
        writeProgress(
          25 + Math.round(value * 0.7),
          "Generating narration captions locally",
        );
      }
    },
  });
  if (controller.cancelRequested) {
    throw new VoiceoverJobCancelledError("Narration job cancelled.");
  }
  await db.voiceoverJob.update({
    where: { id: job.id },
    data: { progress: 97, stage: "Saving editable captions" },
  });
  const captions = parseWhisperJson(
    JSON.parse(await readFile(outputJsonPath, "utf8")) as unknown,
  );
  await db.$transaction([
    db.voiceoverCaptionSegment.deleteMany({
      where: { takeId: job.take.id },
    }),
    db.voiceoverCaptionSegment.createMany({
      data: captions.map((caption) => ({
        takeId: job.take.id,
        segmentOrder: caption.segmentOrder,
        startSeconds: caption.startSeconds,
        endSeconds: caption.endSeconds,
        text: caption.text,
        originalText: caption.text,
      })),
    }),
    db.voiceoverTake.update({
      where: { id: job.take.id },
      data: { status: "READY", errorMessage: null },
    }),
    db.voiceoverJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        progress: 100,
        stage:
          captions.length > 0 ? "Editable captions ready" : "No speech found",
        completedAt: new Date(),
        errorMessage: null,
      },
    }),
  ]);
}

export async function runVoiceoverJob(jobId: string) {
  scheduledJobs.delete(jobId);
  if (activeControllers.has(jobId)) return;
  const controller: ActiveController = {
    child: null,
    cancelRequested: false,
  };
  activeControllers.set(jobId, controller);
  try {
    const job = await loadJob(jobId);
    if (
      !job ||
      job.status !== "QUEUED" ||
      job.cancelRequestedAt ||
      controller.cancelRequested
    ) {
      return;
    }
    if (job.kind === "PROCESS") {
      await runProcessingJob(job, controller);
    } else {
      await runCaptionJob(job, controller);
    }
  } catch (error) {
    const job = await db.voiceoverJob
      .findUnique({
        where: { id: jobId },
        select: { takeId: true, cancelRequestedAt: true },
      })
      .catch(() => null);
    const cancelled =
      error instanceof VoiceoverJobCancelledError ||
      controller.cancelRequested ||
      Boolean(job?.cancelRequestedAt);
    if (job) {
      await db
        .$transaction([
          db.voiceoverJob.update({
            where: { id: jobId },
            data: cancelled
              ? {
                  status: "CANCELLED",
                  stage: "Cancelled",
                  errorMessage: null,
                  completedAt: new Date(),
                }
              : {
                  status: "ERROR",
                  stage: "Local narration job failed",
                  errorMessage:
                    error instanceof AppError
                      ? error.message
                      : `The local narration job could not finish: ${safeDiagnostic(error)}`,
                  completedAt: new Date(),
                },
          }),
          db.voiceoverTake.update({
            where: { id: job.takeId },
            data: cancelled
              ? { status: "READY", errorMessage: null }
              : {
                  status: "ERROR",
                  errorMessage:
                    error instanceof AppError
                      ? error.message
                      : "The local narration job could not finish. The original audio is safe.",
                },
          }),
        ])
        .catch(() => undefined);
    }
  } finally {
    activeControllers.delete(jobId);
    scheduledJobs.delete(jobId);
    await cleanupTemporaryDirectory(jobId);
  }
}

function scheduleVoiceoverJob(jobId: string) {
  scheduledJobs.add(jobId);
  setImmediate(() => {
    void runVoiceoverJob(jobId);
  });
}

async function findTakeForJob(studioProjectId: string, takeId: string) {
  const take = await db.voiceoverTake.findFirst({
    where: {
      id: takeId,
      production: { studioProjectId },
    },
    include: {
      sourceAsset: true,
      processedAsset: true,
      jobs: {
        where: { status: { in: ACTIVE_JOB_STATUSES } },
        take: 1,
      },
    },
  });
  if (!take) {
    throw new AppError(
      "That narration take does not exist.",
      404,
      "VOICEOVER_TAKE_NOT_FOUND",
    );
  }
  if (take.jobs.length > 0) {
    throw new AppError(
      "Wait for the current narration job to finish or cancel it first.",
      409,
      "VOICEOVER_JOB_ACTIVE",
    );
  }
  return take;
}

export async function startVoiceoverProcessingJob(
  studioProjectId: string,
  takeId: string,
  input: unknown,
) {
  await reconcileVoiceoverJobs();
  const take = await findTakeForJob(studioProjectId, takeId);
  const settings = voiceoverProcessingSettingsSchema.parse(input);
  if (settings.trimEndSeconds > take.sourceAsset.durationSeconds + 0.001) {
    throw new AppError(
      "The trim end must stay inside the original narration.",
      400,
      "VOICEOVER_TRIM_RANGE_INVALID",
    );
  }
  const job = await db.$transaction(async (transaction) => {
    await transaction.voiceoverTake.update({
      where: { id: take.id },
      data: {
        status: "PROCESSING",
        trimStartSeconds: settings.trimStartSeconds,
        trimEndSeconds: settings.trimEndSeconds,
        normalize: settings.normalize,
        noiseReduction: settings.noiseReduction,
        gainDb: settings.gainDb,
        errorMessage: null,
      },
    });
    return transaction.voiceoverJob.create({
      data: {
        takeId: take.id,
        kind: "PROCESS",
        processorVersion: VOICEOVER_PROCESSOR_VERSION,
        settingsJson: JSON.stringify(settings),
      },
    });
  });
  scheduleVoiceoverJob(job.id);
  return job;
}

export async function startVoiceoverCaptionJob(
  studioProjectId: string,
  takeId: string,
) {
  await reconcileVoiceoverJobs();
  const take = await findTakeForJob(studioProjectId, takeId);
  const source = take.processedAsset ?? take.sourceAsset;
  const job = await db.$transaction(async (transaction) => {
    await transaction.voiceoverTake.update({
      where: { id: take.id },
      data: { status: "PROCESSING", errorMessage: null },
    });
    return transaction.voiceoverJob.create({
      data: {
        takeId: take.id,
        kind: "TRANSCRIBE",
        processorVersion: VOICEOVER_CAPTION_VERSION,
        settingsJson: JSON.stringify({
          sourceAssetId: source.id,
          modelName: appConfig.whisperModelName,
        }),
      },
    });
  });
  scheduleVoiceoverJob(job.id);
  return job;
}

export async function cancelVoiceoverJob(
  studioProjectId: string,
  jobId: string,
) {
  const job = await db.voiceoverJob.findFirst({
    where: {
      id: jobId,
      take: { production: { studioProjectId } },
    },
  });
  if (!job) {
    throw new AppError(
      "That narration job does not exist.",
      404,
      "VOICEOVER_JOB_NOT_FOUND",
    );
  }
  if (!ACTIVE_JOB_STATUSES.includes(job.status)) return job;
  const controller = activeControllers.get(jobId);
  scheduledJobs.delete(jobId);
  if (controller) {
    controller.cancelRequested = true;
    controller.child?.kill("SIGTERM");
    if (controller.child) {
      const child = controller.child;
      const forceKill = setTimeout(() => child.kill("SIGKILL"), 2_000);
      forceKill.unref();
    }
  }
  const cancelledAt = new Date();
  const [, cancelled] = await db.$transaction([
    db.voiceoverTake.update({
      where: { id: job.takeId },
      data: { status: "READY", errorMessage: null },
    }),
    db.voiceoverJob.update({
      where: { id: job.id },
      data: {
        status: controller ? job.status : "CANCELLED",
        stage: controller ? "Stopping local process" : "Cancelled",
        cancelRequestedAt: cancelledAt,
        completedAt: controller ? null : cancelledAt,
        errorMessage: null,
      },
    }),
  ]);
  if (!controller) await cleanupTemporaryDirectory(job.id);
  return cancelled;
}
