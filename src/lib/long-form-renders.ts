import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import {
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type { LongFormRenderKind } from "@prisma/client";

import { appConfig } from "@/lib/config";
import {
  dataPaths,
  ensureDataDirectories,
  longFormRenderDirectory,
  longFormRenderTemporaryDirectory,
  resolveDataPath,
  toDataRelativePath,
} from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  buildLongFormConcatArguments,
  buildLongFormFinalizeArguments,
  buildLongFormRenderManifest,
  buildLongFormSoftwareFallbackArguments,
  LONG_FORM_RENDER_PIPELINE_VERSION,
} from "@/lib/long-form-render-plan";
import { longFormTimelineDocumentSchema } from "@/lib/long-form-timeline-document";
import { probeVideo } from "@/lib/video";

type ActiveRenderController = {
  child: ChildProcess | null;
  cancelRequested: boolean;
};

const renderGlobal = globalThis as unknown as {
  r6LongFormRenderControllers?: Map<string, ActiveRenderController>;
  r6LongFormRendersReconciled?: boolean;
};
const activeControllers =
  renderGlobal.r6LongFormRenderControllers ??
  new Map<string, ActiveRenderController>();
renderGlobal.r6LongFormRenderControllers = activeControllers;

class LongFormRenderCancelledError extends Error {}

let videoToolboxSupport: Promise<boolean> | null = null;

function supportsVideoToolbox(executable: string) {
  videoToolboxSupport ??= new Promise<boolean>((resolve) => {
    const child = spawn(
      executable,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=64x64:r=1:d=0.1",
        "-frames:v",
        "1",
        "-c:v",
        "h264_videotoolbox",
        "-f",
        "null",
        "-",
      ],
      { shell: false, stdio: "ignore" },
    );
    child.once("error", () => resolve(false));
    child.once("close", (code) => resolve(code === 0));
  });
  return videoToolboxSupport;
}

function safeDiagnostic(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown long-form render error";
  return message
    .replaceAll(dataPaths.root, "[local-data]")
    .replace(/\/Users\/[^/\s]+/g, "/Users/[local-user]")
    .slice(0, 4_000);
}

function outputFilename(
  projectName: string,
  kind: LongFormRenderKind,
  revisionVersion: number,
) {
  const slug = projectName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = kind === "PREVIEW" ? "preview" : "1080p";
  return `${slug || "r6-long-form"}-${suffix}-edit-${revisionVersion}.mp4`;
}

async function cleanupTemporaryDirectory(jobId: string) {
  await rm(longFormRenderTemporaryDirectory(jobId), {
    recursive: true,
    force: true,
  });
}

export async function reconcileLongFormRenderJobs() {
  if (renderGlobal.r6LongFormRendersReconciled) return;
  const interrupted = await db.longFormRenderJob.findMany({
    where: { status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true, kind: true },
  });
  const now = new Date();
  for (const job of interrupted) {
    await cleanupTemporaryDirectory(job.id);
    await db.longFormRenderJob.update({
      where: { id: job.id },
      data: {
        status: "ERROR",
        stage: "Interrupted",
        errorMessage:
          `${job.kind === "PREVIEW" ? "Preview" : "1080p export"} rendering stopped when the application restarted. ` +
          "The partial output was removed; start a new render when ready.",
        completedAt: now,
      },
    });
  }
  await mkdir(dataPaths.longFormRenderTemp, { recursive: true });
  const activeIds = new Set(
    (
      await db.longFormRenderJob.findMany({
        where: { status: { in: ["QUEUED", "RUNNING"] } },
        select: { id: true },
      })
    ).map((job) => job.id),
  );
  for (const entry of await readdir(dataPaths.longFormRenderTemp).catch(
    () => [] as string[],
  )) {
    if (!activeIds.has(entry)) {
      await rm(path.join(dataPaths.longFormRenderTemp, entry), {
        recursive: true,
        force: true,
      });
    }
  }
  renderGlobal.r6LongFormRendersReconciled = true;
}

export function resetLongFormRenderReconciliationForTests() {
  renderGlobal.r6LongFormRendersReconciled = false;
}

async function loadRenderContext(
  jobId: string,
  temporaryDirectory: string,
  ffmpegPath: string,
) {
  const job = await db.longFormRenderJob.findUnique({
    where: { id: jobId },
    include: {
      timelineRevision: true,
      timeline: {
        include: {
          production: {
            include: {
              studioProject: {
                include: {
                  inputs: {
                    where: {
                      kind: {
                        in: ["PRIMARY_RECORDING", "ADDITIONAL_RECORDING"],
                      },
                      videoProjectId: { not: null },
                    },
                    include: {
                      videoProject: { include: { audioTracks: true } },
                    },
                  },
                  mediaAssets: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!job || job.status !== "QUEUED" || job.cancelRequestedAt) return null;
  const project = job.timeline.production.studioProject;
  const document = longFormTimelineDocumentSchema.parse(
    JSON.parse(job.timelineRevision.documentJson) as unknown,
  );
  const sources = project.inputs
    .filter((input) => input.videoProject)
    .map((input) => {
      const tracks = input.videoProject!.audioTracks;
      const selected =
        tracks.find((track) => track.id === project.selectedAudioTrackId) ??
        (tracks.length === 1 ? tracks[0] : null);
      return {
        id: input.videoProject!.id,
        absolutePath: resolveDataPath(input.videoProject!.sourceRelativePath),
        audioStreamIndex: selected?.streamIndex ?? null,
      };
    });
  const media = project.mediaAssets.map((asset) => ({
    id: asset.id,
    absolutePath: resolveDataPath(asset.relativePath),
    durationSeconds: asset.durationSeconds,
  }));
  return {
    job,
    document,
    media,
    manifest: buildLongFormRenderManifest({
      document,
      kind: job.kind,
      sources,
      media,
      temporaryDirectory,
      preferHardwareEncoder:
        job.kind === "EXPORT" && (await supportsVideoToolbox(ffmpegPath)),
    }),
  };
}

function runFfmpeg(input: {
  executable: string;
  args: string[];
  controller: ActiveRenderController;
  durationSeconds: number;
  onProgress: (progress: number) => void;
}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(input.executable, input.args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    input.controller.child = child;
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        const match = /^out_time_(?:ms|us)=(\d+)$/.exec(line);
        if (!match) continue;
        const seconds = Number(match[1]) / 1_000_000;
        input.onProgress(
          Math.max(
            0,
            Math.min(1, seconds / Math.max(0.1, input.durationSeconds)),
          ),
        );
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 200_000) stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      input.controller.child = null;
      if (input.controller.cancelRequested) {
        reject(new LongFormRenderCancelledError());
      } else if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            stderr.trim() ||
              `FFmpeg stopped with ${signal ? `signal ${signal}` : `code ${code ?? "unknown"}`}.`,
          ),
        );
      }
    });
  });
}

async function updateProgress(jobId: string, progress: number, stage?: string) {
  await db.longFormRenderJob
    .update({
      where: { id: jobId },
      data: {
        progress: Math.max(1, Math.min(99, Math.round(progress))),
        ...(stage ? { stage } : {}),
      },
    })
    .catch(() => undefined);
}

function concatLine(filePath: string) {
  return `file '${filePath.replaceAll("'", "'\\''")}'`;
}

export async function runLongFormRenderJob(jobId: string) {
  if (activeControllers.has(jobId)) return;
  const controller: ActiveRenderController = {
    child: null,
    cancelRequested: false,
  };
  activeControllers.set(jobId, controller);
  const temporaryDirectory = longFormRenderTemporaryDirectory(jobId);
  const concatListPath = path.join(temporaryDirectory, "segments.ffconcat");
  const concatPath = path.join(temporaryDirectory, "concatenated.mp4");
  const temporaryOutputPath = path.join(
    temporaryDirectory,
    "output.processing.mp4",
  );
  let finalPath: string | null = null;
  try {
    const ffmpegPath = appConfig.ffmpegPath;
    if (!ffmpegPath) {
      throw new AppError(
        "FFmpeg is unavailable. Reinstall dependencies and try again.",
        503,
        "FFMPEG_UNAVAILABLE",
      );
    }
    await ensureDataDirectories();
    await mkdir(temporaryDirectory, { recursive: true });
    const context = await loadRenderContext(
      jobId,
      temporaryDirectory,
      ffmpegPath,
    );
    if (!context) {
      if (controller.cancelRequested) {
        throw new LongFormRenderCancelledError();
      }
      return;
    }
    finalPath = path.join(
      longFormRenderDirectory(context.job.timelineId, context.job.kind),
      `${jobId}.mp4`,
    );
    await mkdir(path.dirname(finalPath), { recursive: true });
    await db.longFormRenderJob.update({
      where: { id: jobId },
      data: {
        status: "RUNNING",
        progress: 1,
        stage: `Preparing ${context.manifest.segmentCount} bounded segments`,
        renderSpecJson: JSON.stringify(context.manifest.specification),
        width: context.manifest.width,
        height: context.manifest.height,
        durationSeconds: context.manifest.durationSeconds,
        videoCodec: "h264",
        audioCodec: "aac",
        segmentCount: context.manifest.segmentCount,
        startedAt: new Date(),
        errorMessage: null,
      },
    });

    let lastProgressAt = 0;
    for (const segment of context.manifest.segments) {
      if (controller.cancelRequested) {
        throw new LongFormRenderCancelledError();
      }
      const startProgress =
        2 + (segment.index / context.manifest.segmentCount) * 80;
      const segmentShare = 80 / context.manifest.segmentCount;
      await updateProgress(
        jobId,
        startProgress,
        `Rendering segment ${segment.index + 1} of ${context.manifest.segmentCount}`,
      );
      const onProgress = (fraction: number) => {
        if (Date.now() - lastProgressAt < 700) return;
        lastProgressAt = Date.now();
        void updateProgress(jobId, startProgress + fraction * segmentShare);
      };
      try {
        await runFfmpeg({
          executable: ffmpegPath,
          args: segment.plan.arguments,
          controller,
          durationSeconds: segment.durationSeconds,
          onProgress,
        });
      } catch (error) {
        if (
          !context.manifest.hardwareAccelerated ||
          controller.cancelRequested ||
          error instanceof LongFormRenderCancelledError
        ) {
          throw error;
        }
        await updateProgress(
          jobId,
          startProgress,
          `Hardware encode unavailable for segment ${segment.index + 1}; retrying safely in software`,
        );
        await db.longFormRenderJob.update({
          where: { id: jobId },
          data: {
            renderSpecJson: JSON.stringify({
              ...context.manifest.specification,
              hardwareFallbackUsed: true,
            }),
          },
        });
        await runFfmpeg({
          executable: ffmpegPath,
          args: buildLongFormSoftwareFallbackArguments(segment.plan.arguments),
          controller,
          durationSeconds: segment.durationSeconds,
          onProgress,
        });
      }
    }

    await writeFile(
      concatListPath,
      context.manifest.segments
        .map((segment) => concatLine(segment.outputPath))
        .join("\n")
        .concat("\n"),
      "utf8",
    );
    await updateProgress(jobId, 83, "Joining rendered segments");
    await runFfmpeg({
      executable: ffmpegPath,
      args: buildLongFormConcatArguments({
        listPath: concatListPath,
        outputPath: concatPath,
      }),
      controller,
      durationSeconds: context.manifest.durationSeconds,
      onProgress: (fraction) => {
        if (Date.now() - lastProgressAt < 700) return;
        lastProgressAt = Date.now();
        void updateProgress(jobId, 83 + fraction * 7);
      },
    });

    await updateProgress(jobId, 91, "Finalizing audio and MP4 metadata");
    await runFfmpeg({
      executable: ffmpegPath,
      args: buildLongFormFinalizeArguments({
        document: context.document,
        media: context.media,
        concatPath,
        outputPath: temporaryOutputPath,
        kind: context.job.kind,
      }),
      controller,
      durationSeconds: context.manifest.durationSeconds,
      onProgress: (fraction) => {
        if (Date.now() - lastProgressAt < 700) return;
        lastProgressAt = Date.now();
        void updateProgress(jobId, 91 + fraction * 8);
      },
    });

    if (controller.cancelRequested) {
      throw new LongFormRenderCancelledError();
    }
    await rename(temporaryOutputPath, finalPath);
    const [metadata, outputStat] = await Promise.all([
      probeVideo(finalPath),
      stat(finalPath),
    ]);
    await db.$transaction([
      db.longFormRenderJob.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          progress: 100,
          stage: "Ready",
          relativePath: toDataRelativePath(finalPath),
          fileSizeBytes: BigInt(outputStat.size),
          width: metadata.width,
          height: metadata.height,
          durationSeconds: metadata.durationSeconds,
          videoCodec: "h264",
          audioCodec: metadata.audioTracks.length ? "aac" : null,
          completedAt: new Date(),
        },
      }),
      db.longFormProduction.update({
        where: { id: context.job.timeline.production.id },
        data: { status: "READY_TO_RENDER" },
      }),
    ]);
  } catch (error) {
    await unlink(temporaryOutputPath).catch(() => undefined);
    if (finalPath) await unlink(finalPath).catch(() => undefined);
    if (
      error instanceof LongFormRenderCancelledError ||
      controller.cancelRequested
    ) {
      await db.longFormRenderJob
        .update({
          where: { id: jobId },
          data: {
            status: "CANCELLED",
            progress: 0,
            stage: "Cancelled",
            errorMessage: null,
            completedAt: new Date(),
          },
        })
        .catch(() => undefined);
    } else {
      await db.longFormRenderJob
        .update({
          where: { id: jobId },
          data: {
            status: "ERROR",
            stage: "Render failed",
            errorMessage:
              "The long-form render could not finish. Source recordings were not changed. " +
              safeDiagnostic(error),
            completedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
  } finally {
    activeControllers.delete(jobId);
    await cleanupTemporaryDirectory(jobId);
  }
}

function scheduleRenderJob(jobId: string) {
  setImmediate(() => void runLongFormRenderJob(jobId));
}

export async function startLongFormRenderJob(
  studioProjectId: string,
  kind: LongFormRenderKind,
) {
  await reconcileLongFormRenderJobs();
  const production = await db.longFormProduction.findUnique({
    where: { studioProjectId },
    include: {
      studioProject: { select: { name: true } },
      timeline: {
        include: {
          revisions: { orderBy: { version: "desc" }, take: 1 },
          renderJobs: {
            where: { status: { in: ["QUEUED", "RUNNING"] } },
            take: 1,
          },
        },
      },
    },
  });
  const timeline = production?.timeline;
  const revision = timeline?.revisions[0];
  if (!production || !timeline || !revision) {
    throw new AppError(
      "Create and save a long-form timeline before rendering.",
      409,
      "LONG_FORM_TIMELINE_REQUIRED",
    );
  }
  if (timeline.renderJobs.length > 0) {
    throw new AppError(
      "Wait for the active long-form render to finish, or cancel it first.",
      409,
      "LONG_FORM_RENDER_ALREADY_RUNNING",
    );
  }
  const reusable = await db.longFormRenderJob.findFirst({
    where: {
      timelineId: timeline.id,
      timelineRevisionId: revision.id,
      kind,
      status: "COMPLETED",
      pipelineVersion: LONG_FORM_RENDER_PIPELINE_VERSION,
      relativePath: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (reusable?.relativePath) {
    try {
      const saved = await stat(resolveDataPath(reusable.relativePath));
      if (saved.isFile() && saved.size > 0) return reusable;
    } catch {
      // A missing result should be rendered again.
    }
  }
  const document = longFormTimelineDocumentSchema.parse(
    JSON.parse(revision.documentJson) as unknown,
  );
  if (!document.items.some((item) => item.track === "VIDEO")) {
    throw new AppError(
      "Add at least one source video or card before rendering.",
      400,
      "LONG_FORM_TIMELINE_EMPTY",
    );
  }
  const job = await db.longFormRenderJob.create({
    data: {
      timelineId: timeline.id,
      timelineRevisionId: revision.id,
      kind,
      pipelineVersion: LONG_FORM_RENDER_PIPELINE_VERSION,
      outputFilename: outputFilename(
        production.studioProject.name,
        kind,
        revision.version,
      ),
      renderSpecJson: JSON.stringify({
        timelineVersion: revision.version,
        kind,
      }),
    },
  });
  scheduleRenderJob(job.id);
  return job;
}

export async function cancelLongFormRenderJob(
  jobId: string,
  studioProjectId?: string,
) {
  const job = await db.longFormRenderJob.findUnique({
    where: { id: jobId },
    include: {
      timeline: {
        include: { production: { select: { studioProjectId: true } } },
      },
    },
  });
  if (
    !job ||
    (studioProjectId &&
      job.timeline.production.studioProjectId !== studioProjectId)
  ) {
    throw new AppError(
      "That long-form render job does not exist.",
      404,
      "LONG_FORM_RENDER_NOT_FOUND",
    );
  }
  if (!["QUEUED", "RUNNING"].includes(job.status)) return job;
  await db.longFormRenderJob.update({
    where: { id: jobId },
    data: { cancelRequestedAt: new Date(), stage: "Cancelling render" },
  });
  const controller = activeControllers.get(jobId);
  if (controller) {
    controller.cancelRequested = true;
    const child = controller.child;
    child?.kill("SIGTERM");
    if (child) {
      const forceKill = setTimeout(() => child.kill("SIGKILL"), 2_000);
      child.once("close", () => clearTimeout(forceKill));
    }
  } else {
    await db.longFormRenderJob.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED",
        progress: 0,
        stage: "Cancelled",
        completedAt: new Date(),
      },
    });
    await cleanupTemporaryDirectory(jobId);
  }
  return db.longFormRenderJob.findUniqueOrThrow({ where: { id: jobId } });
}

export async function deleteLongFormRenderJob(
  jobId: string,
  studioProjectId: string,
) {
  const job = await db.longFormRenderJob.findUnique({
    where: { id: jobId },
    include: {
      timeline: {
        include: { production: { select: { studioProjectId: true } } },
      },
    },
  });
  if (!job || job.timeline.production.studioProjectId !== studioProjectId) {
    throw new AppError(
      "That long-form render job does not exist.",
      404,
      "LONG_FORM_RENDER_NOT_FOUND",
    );
  }
  if (["QUEUED", "RUNNING"].includes(job.status)) {
    throw new AppError(
      "Cancel the active long-form render before deleting it.",
      409,
      "LONG_FORM_RENDER_ACTIVE",
    );
  }
  if (job.relativePath) {
    await unlink(resolveDataPath(job.relativePath)).catch(() => undefined);
  }
  await cleanupTemporaryDirectory(job.id);
  await db.longFormRenderJob.delete({ where: { id: job.id } });
}
