import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdir, readdir, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { appConfig } from "@/lib/config";
import {
  dataPaths,
  ensureDataDirectories,
  resolveDataPath,
  shortFormExportDirectory,
  shortFormExportTemporaryDirectory,
  toDataRelativePath,
} from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  buildShortFormExportPlan,
  SHORT_FORM_EXPORT_PIPELINE_VERSION,
} from "@/lib/short-form-proxy";
import { timelineDocumentSchema } from "@/lib/timeline-document";
import { probeVideo } from "@/lib/video";

type ActiveExportController = {
  child: ChildProcess | null;
  cancelRequested: boolean;
};

const exportGlobal = globalThis as unknown as {
  r6ShortFormExportControllers?: Map<string, ActiveExportController>;
  r6ShortFormExportsReconciled?: boolean;
};
const activeControllers =
  exportGlobal.r6ShortFormExportControllers ??
  new Map<string, ActiveExportController>();
exportGlobal.r6ShortFormExportControllers = activeControllers;

class ExportCancelledError extends Error {}

function safeExportDiagnostic(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown export render error";
  return message
    .replaceAll(dataPaths.root, "[local-data]")
    .replace(/\/Users\/[^/\s]+/g, "/Users/[local-user]")
    .slice(0, 4_000);
}

function outputFilename(
  projectName: string,
  aspectRatio: string,
  revisionVersion: number,
) {
  const projectSlug = projectName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const ratio = aspectRatio.toLowerCase().replaceAll("_", "-");
  return `${projectSlug || "r6-short"}-${ratio}-edit-${revisionVersion}.mp4`;
}

async function cleanupTemporaryDirectory(jobId: string) {
  await rm(shortFormExportTemporaryDirectory(jobId), {
    recursive: true,
    force: true,
  });
}

export async function reconcileShortFormExportJobs() {
  if (exportGlobal.r6ShortFormExportsReconciled) return;
  const interrupted = await db.shortFormExportJob.findMany({
    where: { status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true },
  });
  const now = new Date();
  for (const job of interrupted) {
    await cleanupTemporaryDirectory(job.id);
    await db.shortFormExportJob.update({
      where: { id: job.id },
      data: {
        status: "ERROR",
        stage: "Interrupted",
        errorMessage:
          "Full-resolution export stopped when the application restarted. Start a new export when ready.",
        completedAt: now,
      },
    });
  }
  await mkdir(dataPaths.shortFormExportTemp, { recursive: true });
  const activeIds = new Set(
    (
      await db.shortFormExportJob.findMany({
        where: { status: { in: ["QUEUED", "RUNNING"] } },
        select: { id: true },
      })
    ).map((job) => job.id),
  );
  for (const entry of await readdir(dataPaths.shortFormExportTemp).catch(
    () => [] as string[],
  )) {
    if (!activeIds.has(entry)) {
      await rm(path.join(dataPaths.shortFormExportTemp, entry), {
        recursive: true,
        force: true,
      });
    }
  }
  exportGlobal.r6ShortFormExportsReconciled = true;
}

async function loadExportContext(jobId: string, temporaryPath: string) {
  const job = await db.shortFormExportJob.findUnique({
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
  const document = timelineDocumentSchema.parse(
    JSON.parse(job.timelineRevision.documentJson) as unknown,
  );
  return {
    job,
    plan: buildShortFormExportPlan({
      document,
      sources: project.inputs
        .filter((input) => input.videoProject)
        .map((input) => {
          const tracks = input.videoProject!.audioTracks;
          const selected =
            tracks.find((track) => track.id === project.selectedAudioTrackId) ??
            (tracks.length === 1 ? tracks[0] : null);
          return {
            id: input.videoProject!.id,
            absolutePath: resolveDataPath(
              input.videoProject!.sourceRelativePath,
            ),
            audioStreamIndex: selected?.streamIndex ?? null,
          };
        }),
      media: project.mediaAssets.map((asset) => ({
        id: asset.id,
        absolutePath: resolveDataPath(asset.relativePath),
        durationSeconds: asset.durationSeconds,
      })),
      outputPath: temporaryPath,
    }),
  };
}

export async function runShortFormExportJob(jobId: string) {
  if (activeControllers.has(jobId)) return;
  const controller: ActiveExportController = {
    child: null,
    cancelRequested: false,
  };
  activeControllers.set(jobId, controller);
  const temporaryDirectory = shortFormExportTemporaryDirectory(jobId);
  const temporaryPath = path.join(temporaryDirectory, "export.processing.mp4");
  let finalPath: string | null = null;
  try {
    if (!appConfig.ffmpegPath) {
      throw new AppError(
        "FFmpeg is unavailable. Reinstall dependencies and try again.",
        503,
        "FFMPEG_UNAVAILABLE",
      );
    }
    await ensureDataDirectories();
    await mkdir(temporaryDirectory, { recursive: true });
    const context = await loadExportContext(jobId, temporaryPath);
    if (!context) {
      if (controller.cancelRequested) throw new ExportCancelledError();
      return;
    }
    finalPath = path.join(
      shortFormExportDirectory(context.job.timelineId),
      `${jobId}.mp4`,
    );
    await mkdir(path.dirname(finalPath), { recursive: true });
    await db.shortFormExportJob.update({
      where: { id: jobId },
      data: {
        status: "RUNNING",
        progress: 1,
        stage: "Rendering full-resolution MP4",
        renderSpecJson: JSON.stringify(context.plan.specification),
        width: context.plan.width,
        height: context.plan.height,
        durationSeconds: context.plan.durationSeconds,
        videoCodec: "h264",
        audioCodec: "aac",
        startedAt: new Date(),
        errorMessage: null,
      },
    });

    await new Promise<void>((resolve, reject) => {
      const child = spawn(appConfig.ffmpegPath!, context.plan.arguments, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      controller.child = child;
      let stdout = "";
      let stderr = "";
      let lastProgressAt = 0;
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        const lines = stdout.split(/\r?\n/);
        stdout = lines.pop() ?? "";
        for (const line of lines) {
          const match = /^out_time_(?:ms|us)=(\d+)$/.exec(line);
          if (!match) continue;
          const seconds = Number(match[1]) / 1_000_000;
          const progress = Math.max(
            1,
            Math.min(
              98,
              Math.round(
                (seconds / Math.max(0.1, context.plan.durationSeconds)) * 100,
              ),
            ),
          );
          if (Date.now() - lastProgressAt > 500) {
            lastProgressAt = Date.now();
            void db.shortFormExportJob
              .update({
                where: { id: jobId },
                data: { progress },
              })
              .catch(() => undefined);
          }
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < 200_000) stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code, signal) => {
        controller.child = null;
        if (controller.cancelRequested) {
          reject(new ExportCancelledError());
        } else if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              stderr.trim() ||
                `FFmpeg stopped with ${signal ?? `code ${code ?? "unknown"}`}.`,
            ),
          );
        }
      });
    });
    if (controller.cancelRequested) throw new ExportCancelledError();
    const output = await stat(temporaryPath);
    if (!output.isFile() || output.size <= 0) {
      throw new Error("FFmpeg produced an empty full-resolution export.");
    }
    await rename(temporaryPath, finalPath);
    const metadata = await probeVideo(finalPath);
    if (
      metadata.width !== context.plan.width ||
      metadata.height !== context.plan.height ||
      Math.abs(metadata.durationSeconds - context.plan.durationSeconds) > 0.2
    ) {
      throw new Error(
        "The rendered export did not match its saved dimensions or duration.",
      );
    }
    await db.shortFormExportJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        progress: 100,
        stage: "Full-resolution MP4 ready",
        relativePath: toDataRelativePath(finalPath),
        fileSizeBytes: BigInt(output.size),
        width: metadata.width,
        height: metadata.height,
        durationSeconds: metadata.durationSeconds,
        videoCodec: "h264",
        audioCodec: "aac",
        completedAt: new Date(),
      },
    });
  } catch (error) {
    if (!(error instanceof ExportCancelledError)) {
      console.error(
        "Short-form export diagnostic:",
        safeExportDiagnostic(error),
      );
    }
    await Promise.all([
      unlink(temporaryPath).catch(() => undefined),
      finalPath ? unlink(finalPath).catch(() => undefined) : Promise.resolve(),
    ]);
    const cancelled =
      error instanceof ExportCancelledError || controller.cancelRequested;
    await db.shortFormExportJob
      .update({
        where: { id: jobId },
        data: {
          status: cancelled ? "CANCELLED" : "ERROR",
          progress: cancelled ? 0 : undefined,
          stage: cancelled ? "Cancelled" : "Export failed",
          errorMessage: cancelled
            ? null
            : "The full-resolution MP4 could not be rendered. Review the timeline and try again.",
          completedAt: new Date(),
        },
      })
      .catch(() => undefined);
  } finally {
    await cleanupTemporaryDirectory(jobId);
    activeControllers.delete(jobId);
  }
}

function scheduleExportJob(jobId: string) {
  setImmediate(() => void runShortFormExportJob(jobId));
}

export async function startShortFormExportJob(studioProjectId: string) {
  await reconcileShortFormExportJobs();
  const production = await db.shortFormProduction.findUnique({
    where: { studioProjectId },
    include: {
      studioProject: { select: { name: true } },
      timeline: {
        include: {
          revisions: { orderBy: { version: "desc" }, take: 1 },
          exportJobs: {
            where: { status: { in: ["QUEUED", "RUNNING"] } },
            take: 1,
          },
          proxyJobs: {
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
      "Create and save a non-destructive timeline before exporting.",
      409,
      "TIMELINE_REQUIRED",
    );
  }
  if (timeline.exportJobs.length > 0 || timeline.proxyJobs.length > 0) {
    throw new AppError(
      "Wait for the active preview or export to finish, or cancel it first.",
      409,
      "RENDER_ALREADY_RUNNING",
    );
  }
  const reusable = await db.shortFormExportJob.findFirst({
    where: {
      timelineId: timeline.id,
      timelineRevisionId: revision.id,
      status: "COMPLETED",
      pipelineVersion: SHORT_FORM_EXPORT_PIPELINE_VERSION,
      relativePath: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (reusable?.relativePath) {
    try {
      const saved = await stat(resolveDataPath(reusable.relativePath));
      if (saved.isFile() && saved.size > 0) return reusable;
    } catch {
      // A missing saved export should be rendered again.
    }
  }
  const document = timelineDocumentSchema.parse(
    JSON.parse(revision.documentJson) as unknown,
  );
  if (!document.items.some((item) => item.track === "VIDEO")) {
    throw new AppError(
      "Add at least one video or card item before exporting.",
      400,
      "EMPTY_TIMELINE",
    );
  }
  const job = await db.shortFormExportJob.create({
    data: {
      timelineId: timeline.id,
      timelineRevisionId: revision.id,
      pipelineVersion: SHORT_FORM_EXPORT_PIPELINE_VERSION,
      outputFilename: outputFilename(
        production.studioProject.name,
        document.aspectRatio,
        revision.version,
      ),
      renderSpecJson: JSON.stringify({
        timelineVersion: revision.version,
        aspectRatio: document.aspectRatio,
      }),
    },
  });
  scheduleExportJob(job.id);
  return job;
}

export async function cancelShortFormExportJob(
  jobId: string,
  studioProjectId?: string,
) {
  const job = await db.shortFormExportJob.findUnique({
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
      "That export job does not exist.",
      404,
      "EXPORT_JOB_NOT_FOUND",
    );
  }
  if (!["QUEUED", "RUNNING"].includes(job.status)) return job;
  await db.shortFormExportJob.update({
    where: { id: jobId },
    data: { cancelRequestedAt: new Date(), stage: "Cancelling export" },
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
    await db.shortFormExportJob.update({
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
  return db.shortFormExportJob.findUniqueOrThrow({ where: { id: jobId } });
}

export async function deleteShortFormExportJob(
  jobId: string,
  studioProjectId: string,
) {
  const job = await db.shortFormExportJob.findUnique({
    where: { id: jobId },
    include: {
      timeline: {
        include: { production: { select: { studioProjectId: true } } },
      },
    },
  });
  if (!job || job.timeline.production.studioProjectId !== studioProjectId) {
    throw new AppError(
      "That export job does not exist.",
      404,
      "EXPORT_JOB_NOT_FOUND",
    );
  }
  if (["QUEUED", "RUNNING"].includes(job.status)) {
    throw new AppError(
      "Cancel the active export before deleting it.",
      409,
      "EXPORT_ACTIVE",
    );
  }
  if (job.relativePath) {
    await unlink(resolveDataPath(job.relativePath)).catch(() => undefined);
  }
  await cleanupTemporaryDirectory(job.id);
  await db.shortFormExportJob.delete({ where: { id: job.id } });
}
