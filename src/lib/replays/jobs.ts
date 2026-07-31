import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ReplayProviderRunStatus } from "@prisma/client";

import {
  ensureDataDirectories,
  replayProviderOutputDirectory,
  resolveDataPath,
  toDataRelativePath,
} from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  sanitizeParsedReplayRounds,
  saveCanonicalReplay,
} from "@/lib/replays/canonical";
import { buildPrivacySafePlayers } from "@/lib/replays/privacy";
import {
  R6_DISSECT_PROVIDER_COMMIT,
  r6DissectReplayProvider,
} from "@/lib/replays/providers/r6-dissect";
import type { ParsedReplayRound } from "@/lib/replays/providers/types";

const activeStatuses: ReplayProviderRunStatus[] = ["QUEUED", "RUNNING"];

type ActiveReplayJob = {
  controller: AbortController;
  children: Set<ChildProcess>;
};

const replayJobsGlobal = globalThis as unknown as {
  activeReplayJobs?: Map<string, ActiveReplayJob>;
  replayJobsReconciled?: boolean;
};

const activeReplayJobs =
  replayJobsGlobal.activeReplayJobs ?? new Map<string, ActiveReplayJob>();
replayJobsGlobal.activeReplayJobs = activeReplayJobs;

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1_000);
  return "The local replay parser could not finish.";
}

function isCancellation(error: unknown) {
  return (
    (error instanceof AppError && error.code === "REPLAY_PARSE_CANCELLED") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

async function updateProgress(runId: string, progress: number, stage: string) {
  await db.replayProviderRun.updateMany({
    where: { id: runId, status: "RUNNING" },
    data: {
      progress: Math.max(0, Math.min(99, Math.round(progress))),
      stage,
    },
  });
}

export async function reconcileInterruptedReplayJobs() {
  if (replayJobsGlobal.replayJobsReconciled) return;
  const activeIds = [...activeReplayJobs.keys()];
  const interrupted = await db.replayProviderRun.findMany({
    where: {
      status: { in: activeStatuses },
      ...(activeIds.length > 0 ? { id: { notIn: activeIds } } : {}),
    },
    select: {
      id: true,
      replayPackageId: true,
      cancelRequestedAt: true,
      replayPackage: {
        select: { canonicalMatch: { select: { id: true } } },
      },
    },
  });
  for (const run of interrupted) {
    const cancelled = Boolean(run.cancelRequestedAt);
    await db.$transaction([
      db.replayProviderRun.update({
        where: { id: run.id },
        data: {
          status: cancelled ? "CANCELLED" : "ERROR",
          progress: 0,
          stage: cancelled ? "Cancelled" : "Interrupted by application restart",
          errorMessage: cancelled
            ? null
            : "Replay parsing stopped when the application restarted. Retry when ready.",
          completedAt: new Date(),
        },
      }),
      db.replayPackage.update({
        where: { id: run.replayPackageId },
        data: {
          status: run.replayPackage.canonicalMatch
            ? "PARSED"
            : cancelled
              ? "READY"
              : "ERROR",
          errorMessage: cancelled
            ? null
            : "The previous replay parse was interrupted. Your imported files are safe.",
        },
      }),
    ]);
    await rm(replayProviderOutputDirectory(run.id), {
      recursive: true,
      force: true,
    }).catch(() => undefined);
  }
  replayJobsGlobal.replayJobsReconciled = true;
}

export async function createReplayParseJob(replayPackageId: string) {
  await reconcileInterruptedReplayJobs();
  const [replayPackage, activeRun, readiness] = await Promise.all([
    db.replayPackage.findUnique({
      where: { id: replayPackageId },
      select: { id: true, roundFileCount: true },
    }),
    db.replayProviderRun.findFirst({
      where: { replayPackageId, status: { in: activeStatuses } },
      select: { id: true },
    }),
    r6DissectReplayProvider.inspectReadiness(),
  ]);
  if (!replayPackage) {
    throw new AppError(
      "That Match Replay no longer exists.",
      404,
      "REPLAY_NOT_FOUND",
    );
  }
  if (activeRun) {
    throw new AppError(
      "This Match Replay is already being parsed.",
      409,
      "REPLAY_PARSE_ACTIVE",
    );
  }
  if (replayPackage.roundFileCount < 1) {
    throw new AppError(
      "This replay package has no saved round files.",
      409,
      "REPLAY_ROUNDS_MISSING",
    );
  }
  if (!readiness.ready) {
    throw new AppError(readiness.message, 503, "REPLAY_PROVIDER_UNAVAILABLE");
  }
  const run = await db.replayProviderRun.create({
    data: {
      id: randomUUID(),
      replayPackageId,
      providerId: r6DissectReplayProvider.id,
      providerVersion: r6DissectReplayProvider.version,
      providerCommit: R6_DISSECT_PROVIDER_COMMIT,
      status: "QUEUED",
      progress: 0,
      stage: "Waiting to start local replay parsing",
      warningsJson: "[]",
    },
  });
  await db.replayPackage.update({
    where: { id: replayPackageId },
    data: { status: "PARSING", errorMessage: null },
  });
  scheduleReplayParseJob(run.id);
  return run;
}

export async function runReplayParseJob(runId: string) {
  if (activeReplayJobs.has(runId)) return;
  const active: ActiveReplayJob = {
    controller: new AbortController(),
    children: new Set(),
  };
  activeReplayJobs.set(runId, active);
  const outputDirectory = replayProviderOutputDirectory(runId);
  const temporaryOutput = path.join(outputDirectory, "parsed.json.writing");
  const finalOutput = path.join(outputDirectory, "parsed.json");
  const started = performance.now();
  try {
    const run = await db.replayProviderRun.findUnique({
      where: { id: runId },
      include: {
        replayPackage: {
          include: { files: { orderBy: { roundIndex: "asc" } } },
        },
      },
    });
    if (!run || run.status !== "QUEUED" || run.cancelRequestedAt) return;
    await ensureDataDirectories();
    await mkdir(outputDirectory, { recursive: true });
    await db.replayProviderRun.update({
      where: { id: runId },
      data: {
        status: "RUNNING",
        progress: 1,
        stage: "Starting reviewed local replay parser",
        startedAt: new Date(),
        errorMessage: null,
      },
    });
    const rounds: ParsedReplayRound[] = [];
    const warnings: Array<{ code: string; message: string }> = [];
    for (const [index, replayFile] of run.replayPackage.files.entries()) {
      if (active.controller.signal.aborted) {
        throw new AppError(
          "Replay parsing was cancelled.",
          409,
          "REPLAY_PARSE_CANCELLED",
        );
      }
      const roundResult = await r6DissectReplayProvider.parseRound({
        replayPath: resolveDataPath(replayFile.relativePath),
        sourceFileStableId: replayFile.stableFileId,
        signal: active.controller.signal,
        onChild: (child) => {
          active.children.add(child);
          child.once("close", () => active.children.delete(child));
        },
        onProgress: (roundProgress, stage) => {
          const overall =
            ((index + Math.max(0, Math.min(100, roundProgress)) / 100) /
              run.replayPackage.files.length) *
            80;
          void updateProgress(
            runId,
            overall,
            `Round ${index + 1} of ${run.replayPackage.files.length}: ${stage}`,
          );
        },
      });
      rounds.push(roundResult.round);
      warnings.push(...roundResult.warnings);
      await db.replayFile.update({
        where: { id: replayFile.id },
        data: { detectedVersion: roundResult.round.gameVersion },
      });
    }
    if (active.controller.signal.aborted) {
      throw new AppError(
        "Replay parsing was cancelled.",
        409,
        "REPLAY_PARSE_CANCELLED",
      );
    }
    await updateProgress(runId, 84, "Preparing privacy-safe parser evidence");
    const privacyPlayers = buildPrivacySafePlayers({
      rounds,
      packageFingerprint: run.replayPackage.packageFingerprintSha256,
      privacyMode: run.replayPackage.privacyMode,
    });
    const sanitizedRounds = sanitizeParsedReplayRounds({
      rounds,
      players: privacyPlayers,
      privacyMode: run.replayPackage.privacyMode,
    });
    await writeFile(
      temporaryOutput,
      JSON.stringify(
        {
          schemaVersion: "r6-creator-replay-provider-output/v1",
          providerId: run.providerId,
          providerVersion: run.providerVersion,
          replayPackageId: run.replayPackageId,
          rounds: sanitizedRounds,
        },
        null,
        2,
      ),
      { encoding: "utf8", flag: "wx" },
    );
    await rename(temporaryOutput, finalOutput);
    await updateProgress(runId, 94, "Building privacy-safe canonical evidence");
    await saveCanonicalReplay({
      replayPackage: run.replayPackage,
      rounds,
      providerId: run.providerId,
      providerVersion: run.providerVersion,
    });
    await db.replayProviderRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        progress: 100,
        stage: "Canonical replay evidence ready",
        rawOutputRelativePath: toDataRelativePath(finalOutput),
        stdoutPreview: `${rounds.length} round output${rounds.length === 1 ? "" : "s"} schema validated and privacy sanitized.`,
        stderrPreview: null,
        warningsJson: JSON.stringify(warnings),
        completedAt: new Date(),
        processingDurationMs: Math.round(performance.now() - started),
      },
    });
  } catch (error) {
    const cancelled = active.controller.signal.aborted || isCancellation(error);
    await rm(outputDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    );
    const run = await db.replayProviderRun.findUnique({
      where: { id: runId },
      select: {
        replayPackageId: true,
        replayPackage: {
          select: { canonicalMatch: { select: { id: true } } },
        },
      },
    });
    if (run) {
      await db
        .$transaction([
          db.replayProviderRun.update({
            where: { id: runId },
            data: {
              status: cancelled ? "CANCELLED" : "ERROR",
              progress: 0,
              stage: cancelled ? "Cancelled" : "Replay parser stopped",
              errorMessage: cancelled ? null : safeErrorMessage(error),
              completedAt: new Date(),
              processingDurationMs: Math.round(performance.now() - started),
            },
          }),
          db.replayPackage.update({
            where: { id: run.replayPackageId },
            data: {
              status: run.replayPackage.canonicalMatch
                ? "PARSED"
                : cancelled
                  ? "READY"
                  : "ERROR",
              errorMessage: cancelled ? null : safeErrorMessage(error),
            },
          }),
        ])
        .catch(() => undefined);
    }
  } finally {
    for (const child of active.children) child.kill("SIGTERM");
    activeReplayJobs.delete(runId);
  }
}

export function scheduleReplayParseJob(runId: string) {
  setImmediate(() => void runReplayParseJob(runId));
}

export async function cancelReplayParseJob(runId: string) {
  const run = await db.replayProviderRun.findUnique({
    where: { id: runId },
    include: {
      replayPackage: {
        select: { canonicalMatch: { select: { id: true } } },
      },
    },
  });
  if (!run) {
    throw new AppError(
      "That replay parsing job no longer exists.",
      404,
      "REPLAY_RUN_NOT_FOUND",
    );
  }
  if (!activeStatuses.includes(run.status)) return run;
  const now = new Date();
  const active = activeReplayJobs.get(runId);
  if (!active) {
    await rm(replayProviderOutputDirectory(runId), {
      recursive: true,
      force: true,
    }).catch(() => undefined);
    return db.$transaction(async (transaction) => {
      await transaction.replayPackage.update({
        where: { id: run.replayPackageId },
        data: {
          status: run.replayPackage.canonicalMatch ? "PARSED" : "READY",
          errorMessage: null,
        },
      });
      return transaction.replayProviderRun.update({
        where: { id: runId },
        data: {
          status: "CANCELLED",
          progress: 0,
          stage: "Cancelled",
          cancelRequestedAt: now,
          completedAt: now,
          errorMessage: null,
        },
      });
    });
  }
  await db.replayProviderRun.update({
    where: { id: runId },
    data: { cancelRequestedAt: now, stage: "Cancelling local parser" },
  });
  active.controller.abort();
  for (const child of active.children) {
    child.kill("SIGTERM");
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 3_000);
    forceKill.unref();
  }
  return run;
}

export async function retryReplayParseJob(runId: string) {
  const previous = await db.replayProviderRun.findUnique({
    where: { id: runId },
    select: { replayPackageId: true, status: true },
  });
  if (!previous) {
    throw new AppError(
      "That replay parsing job no longer exists.",
      404,
      "REPLAY_RUN_NOT_FOUND",
    );
  }
  if (activeStatuses.includes(previous.status)) {
    throw new AppError(
      "Cancel the active replay parse before retrying it.",
      409,
      "REPLAY_PARSE_ACTIVE",
    );
  }
  return createReplayParseJob(previous.replayPackageId);
}
