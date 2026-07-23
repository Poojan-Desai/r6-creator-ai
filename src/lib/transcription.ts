import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import type {
  AudioTrackRole,
  AudioTrack,
  TranscriptSegment,
  TranscriptionJob,
  TranscriptionStatus,
} from "@prisma/client";

import { appConfig } from "@/lib/config";
import {
  dataPaths,
  ensureDataDirectories,
  resolveDataPath,
} from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { probeVideo } from "@/lib/video";

const ACTIVE_STATUSES: TranscriptionStatus[] = [
  "QUEUED",
  "EXTRACTING",
  "TRANSCRIBING",
  "SAVING",
];

type ActiveController = {
  child: ChildProcess | null;
  cancelRequested: boolean;
};

const transcriptionGlobal = globalThis as unknown as {
  r6TranscriptionControllers?: Map<string, ActiveController>;
  r6TranscriptionReconciled?: boolean;
};

const activeControllers =
  transcriptionGlobal.r6TranscriptionControllers ??
  new Map<string, ActiveController>();
transcriptionGlobal.r6TranscriptionControllers = activeControllers;

export type AudioTrackDto = {
  id: string;
  streamIndex: number;
  codecName: string;
  channels: number;
  channelLayout: string | null;
  language: string | null;
  title: string | null;
  isDefault: boolean;
  preferenceScore: number;
  preferenceReason: string | null;
  analysisRole: AudioTrackRole | null;
  roleConfirmedAt: string | null;
};

export type TranscriptSegmentDto = {
  id: string;
  segmentOrder: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
  originalText: string;
  updatedAt: string;
};

export type TranscriptionJobDto = {
  id: string;
  projectId: string;
  audioTrackId: string;
  status: TranscriptionStatus;
  progress: number;
  stage: string;
  provider: string;
  modelName: string;
  errorMessage: string | null;
  cancelRequestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TranscriptionHealth = {
  ready: boolean;
  engineReady: boolean;
  modelReady: boolean;
  modelName: string;
  message: string;
};

export type TranscriptionStateDto = {
  audioTracks: AudioTrackDto[];
  recommendedTrackId: string | null;
  job: TranscriptionJobDto | null;
  segments: TranscriptSegmentDto[];
  health: TranscriptionHealth;
};

type WhisperJson = {
  transcription?: Array<{
    offsets?: { from?: number; to?: number };
    text?: string;
  }>;
};

type ParsedSegment = {
  segmentOrder: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
};

class TranscriptionCancelledError extends Error {}

export function serializeAudioTrack(track: AudioTrack): AudioTrackDto {
  return {
    id: track.id,
    streamIndex: track.streamIndex,
    codecName: track.codecName,
    channels: track.channels,
    channelLayout: track.channelLayout,
    language: track.language,
    title: track.title,
    isDefault: track.isDefault,
    preferenceScore: track.preferenceScore,
    preferenceReason: track.preferenceReason,
    analysisRole: track.analysisRole,
    roleConfirmedAt: track.roleConfirmedAt?.toISOString() ?? null,
  };
}

export async function updateAudioTrackRole(input: {
  projectId: string;
  audioTrackId: string;
  analysisRole: AudioTrackRole | null;
}) {
  const track = await db.audioTrack.findUnique({
    where: { id: input.audioTrackId },
  });
  if (!track || track.projectId !== input.projectId) {
    throw new AppError(
      "That audio track does not belong to this project.",
      404,
      "AUDIO_TRACK_NOT_FOUND",
    );
  }
  const updated = await db.audioTrack.update({
    where: { id: track.id },
    data: {
      analysisRole: input.analysisRole,
      roleConfirmedAt: input.analysisRole ? new Date() : null,
    },
  });
  return serializeAudioTrack(updated);
}

export function serializeTranscriptionJob(
  job: TranscriptionJob,
): TranscriptionJobDto {
  return {
    id: job.id,
    projectId: job.projectId,
    audioTrackId: job.audioTrackId,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    provider: job.provider,
    modelName: job.modelName,
    errorMessage: job.errorMessage,
    cancelRequestedAt: job.cancelRequestedAt?.toISOString() ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export function serializeTranscriptSegment(
  segment: TranscriptSegment,
): TranscriptSegmentDto {
  return {
    id: segment.id,
    segmentOrder: segment.segmentOrder,
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    text: segment.text,
    originalText: segment.originalText,
    updatedAt: segment.updatedAt.toISOString(),
  };
}

export function getRecommendedTrackId(
  tracks: Array<{ id: string; preferenceScore: number }>,
) {
  if (tracks.length === 1) return tracks[0]?.id ?? null;
  const sorted = [...tracks].sort(
    (left, right) => right.preferenceScore - left.preferenceScore,
  );
  const best = sorted[0];
  const runnerUp = sorted[1];
  if (
    best &&
    best.preferenceScore >= 50 &&
    best.preferenceScore >
      (runnerUp?.preferenceScore ?? Number.NEGATIVE_INFINITY)
  ) {
    return best.id;
  }
  return null;
}

export function getTranscriptionHealth(): TranscriptionHealth {
  const engineReady = Boolean(
    appConfig.whisperCliPath &&
    existsSync(/* turbopackIgnore: true */ appConfig.whisperCliPath),
  );
  const modelReady = existsSync(
    /* turbopackIgnore: true */ appConfig.whisperModelPath,
  );
  const ready = engineReady && modelReady;
  let message = "Local speech transcription is ready.";
  if (!engineReady && !modelReady) {
    message =
      "The local speech engine and model are not installed. Run npm run transcription:setup.";
  } else if (!engineReady) {
    message =
      "The local speech engine is not installed. Run npm run transcription:setup.";
  } else if (!modelReady) {
    message =
      "The local speech model is missing. Run npm run transcription:setup.";
  }
  return {
    ready,
    engineReady,
    modelReady,
    modelName: appConfig.whisperModelName,
    message,
  };
}

export async function ensureProjectAudioTracks(projectId: string) {
  const existing = await db.audioTrack.findMany({
    where: { projectId },
    orderBy: { streamIndex: "asc" },
  });
  if (existing.length > 0) return existing;

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { sourceRelativePath: true },
  });
  if (!project) {
    throw new AppError("That project no longer exists.", 404, "NOT_FOUND");
  }

  const metadata = await probeVideo(
    resolveDataPath(project.sourceRelativePath),
  );
  if (metadata.audioTracks.length === 0) return [];

  await db.audioTrack
    .createMany({
      data: metadata.audioTracks.map((track) => ({
        projectId,
        streamIndex: track.streamIndex,
        codecName: track.codecName,
        channels: track.channels,
        channelLayout: track.channelLayout,
        language: track.language,
        title: track.title,
        isDefault: track.isDefault,
        preferenceScore: track.preferenceScore,
        preferenceReason: track.preferenceReason,
      })),
    })
    .catch(() => undefined);

  return db.audioTrack.findMany({
    where: { projectId },
    orderBy: { streamIndex: "asc" },
  });
}

export async function reconcileInterruptedTranscriptions() {
  if (transcriptionGlobal.r6TranscriptionReconciled) return;
  const activeIds = [...activeControllers.keys()];
  const idFilter = activeIds.length > 0 ? { notIn: activeIds } : undefined;

  await db.transcriptionJob.updateMany({
    where: {
      id: idFilter,
      status: { in: ACTIVE_STATUSES },
      cancelRequestedAt: { not: null },
    },
    data: {
      status: "CANCELLED",
      stage: "Cancelled",
      errorMessage: null,
      completedAt: new Date(),
    },
  });
  await db.transcriptionJob.updateMany({
    where: {
      id: idFilter,
      status: { in: ACTIVE_STATUSES },
    },
    data: {
      status: "ERROR",
      stage: "Interrupted",
      errorMessage:
        "Transcription stopped when the application restarted. Start it again when ready.",
      completedAt: new Date(),
    },
  });
  transcriptionGlobal.r6TranscriptionReconciled = true;
}

export async function getTranscriptionState(
  projectId: string,
): Promise<TranscriptionStateDto> {
  await reconcileInterruptedTranscriptions();
  const audioTracks = await ensureProjectAudioTracks(projectId);
  const [latestJob, latestCompletedJob] = await Promise.all([
    db.transcriptionJob.findFirst({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    }),
    db.transcriptionJob.findFirst({
      where: { projectId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      include: { segments: { orderBy: { segmentOrder: "asc" } } },
    }),
  ]);
  const serializedTracks = audioTracks.map(serializeAudioTrack);
  return {
    audioTracks: serializedTracks,
    recommendedTrackId: getRecommendedTrackId(serializedTracks),
    job: latestJob ? serializeTranscriptionJob(latestJob) : null,
    segments: latestCompletedJob
      ? latestCompletedJob.segments.map(serializeTranscriptSegment)
      : [],
    health: getTranscriptionHealth(),
  };
}

export function buildAudioExtractionArguments(
  inputPath: string,
  outputPath: string,
  streamIndex: number,
) {
  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-map",
    `0:${streamIndex}`,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    "-progress",
    "pipe:2",
    "-nostats",
    "-y",
    outputPath,
  ];
}

export function buildWhisperArguments(
  audioPath: string,
  outputBasePath: string,
) {
  return [
    "-m",
    appConfig.whisperModelPath,
    "-f",
    audioPath,
    "-l",
    "en",
    "-oj",
    "-pp",
    "-ng",
    "-of",
    outputBasePath,
  ];
}

export function parseFfmpegProgress(output: string, durationSeconds: number) {
  const matches = [...output.matchAll(/out_time_(?:us|ms)=(\d+)/g)];
  const latest = matches.at(-1)?.[1];
  if (!latest || durationSeconds <= 0) return null;
  const seconds = Number(latest) / 1_000_000;
  if (!Number.isFinite(seconds)) return null;
  return Math.max(
    0,
    Math.min(100, Math.round((seconds / durationSeconds) * 100)),
  );
}

export function parseWhisperProgress(output: string) {
  const matches = [...output.matchAll(/progress\s*=\s*(\d+)%/g)];
  const latest = Number(matches.at(-1)?.[1]);
  return Number.isFinite(latest)
    ? Math.max(0, Math.min(100, Math.round(latest)))
    : null;
}

export function parseWhisperJson(value: unknown): ParsedSegment[] {
  if (!value || typeof value !== "object") {
    throw new Error("Whisper returned an unreadable transcript.");
  }
  const transcription = (value as WhisperJson).transcription;
  if (!Array.isArray(transcription)) {
    throw new Error("Whisper did not return transcript segments.");
  }

  return transcription.flatMap((segment, index) => {
    const from = Number(segment.offsets?.from);
    const to = Number(segment.offsets?.to);
    const text = segment.text?.trim() ?? "";
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from < 0 ||
      to < from ||
      !text
    ) {
      return [];
    }
    return [
      {
        segmentOrder: index,
        startSeconds: from / 1000,
        endSeconds: to / 1000,
        text,
      },
    ];
  });
}

function runManagedProcess(
  jobId: string,
  executable: string,
  args: string[],
  onOutput: (combinedOutput: string) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const controller = activeControllers.get(jobId);
    if (!controller || controller.cancelRequested) {
      reject(new TranscriptionCancelledError("Transcription was cancelled."));
      return;
    }

    const child = spawn(executable, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    controller.child = child;
    let combinedOutput = "";
    let settled = false;

    function collect(chunk: Buffer) {
      if (combinedOutput.length < 500_000) {
        combinedOutput += chunk.toString();
      }
      onOutput(combinedOutput);
    }

    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      controller.child = null;
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      controller.child = null;
      if (controller.cancelRequested) {
        reject(new TranscriptionCancelledError("Transcription was cancelled."));
      } else if (code === 0) {
        resolve();
      } else {
        reject(new Error(`The local speech process exited with code ${code}.`));
      }
    });
  });
}

function createProgressWriter(jobId: string) {
  let lastProgress = -1;
  let pending = Promise.resolve();
  return (progress: number, stage: string) => {
    if (progress <= lastProgress) return;
    lastProgress = progress;
    pending = pending
      .then(() =>
        db.transcriptionJob.updateMany({
          where: { id: jobId, status: { in: ACTIVE_STATUSES } },
          data: { progress, stage },
        }),
      )
      .then(() => undefined)
      .catch(() => undefined);
  };
}

export async function runTranscriptionJob(jobId: string) {
  if (activeControllers.has(jobId)) return;
  const controller: ActiveController = {
    child: null,
    cancelRequested: false,
  };
  activeControllers.set(jobId, controller);
  const tempDirectory = path.join(dataPaths.transcriptionTemp, jobId);
  const audioPath = path.join(tempDirectory, "selected-track.wav");
  const outputBasePath = path.join(tempDirectory, "transcript");
  const outputJsonPath = `${outputBasePath}.json`;

  try {
    const job = await db.transcriptionJob.findUnique({
      where: { id: jobId },
      include: { project: true, audioTrack: true },
    });
    if (!job || job.status !== "QUEUED" || job.cancelRequestedAt) {
      return;
    }
    const health = getTranscriptionHealth();
    if (!health.ready || !appConfig.ffmpegPath || !appConfig.whisperCliPath) {
      throw new AppError(health.message, 503, "TRANSCRIPTION_NOT_READY");
    }

    await ensureDataDirectories();
    await mkdir(tempDirectory, { recursive: true });
    await db.transcriptionJob.update({
      where: { id: jobId },
      data: {
        status: "EXTRACTING",
        progress: 2,
        stage: "Preparing selected audio track",
        startedAt: new Date(),
        errorMessage: null,
      },
    });

    const writeProgress = createProgressWriter(jobId);
    await runManagedProcess(
      jobId,
      appConfig.ffmpegPath,
      buildAudioExtractionArguments(
        resolveDataPath(job.project.sourceRelativePath),
        audioPath,
        job.audioTrack.streamIndex,
      ),
      (output) => {
        const value = parseFfmpegProgress(output, job.project.durationSeconds);
        if (value !== null) {
          writeProgress(
            5 + Math.round(value * 0.2),
            "Extracting selected audio track",
          );
        }
      },
    );

    if (controller.cancelRequested) {
      throw new TranscriptionCancelledError("Transcription was cancelled.");
    }
    await db.transcriptionJob.update({
      where: { id: jobId },
      data: {
        status: "TRANSCRIBING",
        progress: 25,
        stage: "Turning speech into text locally",
      },
    });

    await runManagedProcess(
      jobId,
      appConfig.whisperCliPath,
      buildWhisperArguments(audioPath, outputBasePath),
      (output) => {
        const value = parseWhisperProgress(output);
        if (value !== null) {
          writeProgress(
            25 + Math.round(value * 0.7),
            "Turning speech into text locally",
          );
        }
      },
    );

    if (controller.cancelRequested) {
      throw new TranscriptionCancelledError("Transcription was cancelled.");
    }
    await db.transcriptionJob.update({
      where: { id: jobId },
      data: { status: "SAVING", progress: 97, stage: "Saving transcript" },
    });
    const parsed = parseWhisperJson(
      JSON.parse(await readFile(outputJsonPath, "utf8")) as unknown,
    );
    await db.$transaction([
      db.transcriptSegment.deleteMany({ where: { jobId } }),
      db.transcriptSegment.createMany({
        data: parsed.map((segment) => ({
          jobId,
          segmentOrder: segment.segmentOrder,
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          text: segment.text,
          originalText: segment.text,
        })),
      }),
      db.transcriptionJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          progress: 100,
          stage: parsed.length > 0 ? "Transcript ready" : "No speech found",
          completedAt: new Date(),
          errorMessage: null,
        },
      }),
    ]);
  } catch (error) {
    const cancelled =
      error instanceof TranscriptionCancelledError ||
      controller.cancelRequested ||
      Boolean(
        await db.transcriptionJob
          .findUnique({
            where: { id: jobId },
            select: { cancelRequestedAt: true },
          })
          .then((job) => job?.cancelRequestedAt)
          .catch(() => null),
      );
    await db.transcriptionJob
      .update({
        where: { id: jobId },
        data: cancelled
          ? {
              status: "CANCELLED",
              stage: "Cancelled",
              completedAt: new Date(),
              errorMessage: null,
            }
          : {
              status: "ERROR",
              stage: "Transcription failed",
              completedAt: new Date(),
              errorMessage:
                error instanceof AppError
                  ? error.message
                  : "The selected audio track could not be transcribed. Check that it contains playable speech and try again.",
            },
      })
      .catch(() => undefined);
  } finally {
    activeControllers.delete(jobId);
    await rm(tempDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}

export function scheduleTranscriptionJob(jobId: string) {
  setImmediate(() => {
    void runTranscriptionJob(jobId);
  });
}

export async function cancelTranscriptionJob(jobId: string) {
  const job = await db.transcriptionJob.findUnique({ where: { id: jobId } });
  if (!job) {
    throw new AppError(
      "That transcription job no longer exists.",
      404,
      "NOT_FOUND",
    );
  }
  if (!ACTIVE_STATUSES.includes(job.status)) return job;

  const controller = activeControllers.get(jobId);
  if (!controller) {
    return db.transcriptionJob.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED",
        stage: "Cancelled",
        cancelRequestedAt: new Date(),
        completedAt: new Date(),
      },
    });
  }

  controller.cancelRequested = true;
  controller.child?.kill("SIGTERM");
  if (controller.child) {
    const child = controller.child;
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 2_000);
    forceKill.unref();
  }
  return db.transcriptionJob.update({
    where: { id: jobId },
    data: {
      stage: "Cancelling local transcription",
      cancelRequestedAt: new Date(),
    },
  });
}
