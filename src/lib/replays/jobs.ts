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
import { decideReplayParseOutcome } from "@/lib/replays/outcome";
import {
  sanitizeParsedReplayRounds,
  saveCanonicalReplay,
} from "@/lib/replays/canonical";
import { buildPrivacySafePlayers } from "@/lib/replays/privacy";
import {
  R6_DISSECT_PROVIDER_COMMIT,
  r6DissectReplayProvider,
} from "@/lib/replays/providers/r6-dissect";
import { parseReplayRoundWithFallback } from "@/lib/replays/providers/fallback";
import {
  ReplayProviderExecutionError,
  type ReplayProviderDiagnostics,
} from "@/lib/replays/providers/provider-error";
import type { ParsedReplayRound } from "@/lib/replays/providers/types";

const activeStatuses: ReplayProviderRunStatus[] = ["QUEUED", "RUNNING"];
const integratedReplayProviders = [r6DissectReplayProvider];

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

function diagnosticsFromUnknown(error: unknown): ReplayProviderDiagnostics {
  if (error instanceof ReplayProviderExecutionError) {
    return error.diagnostics;
  }
  const appError = error instanceof AppError ? error : null;
  return {
    failureKind: "UNKNOWN_PROVIDER_FAILURE",
    internalErrorCode: appError?.code ?? "REPLAY_PROVIDER_UNKNOWN_FAILURE",
    safeSummary: safeErrorMessage(error),
    suggestedAction:
      "Inspect the saved diagnostics before retrying. The imported replay files remain safe.",
    stderrPreview: "",
    stdoutPreview: "No safe provider stdout was retained.",
    exitCode: null,
    terminationSignal: null,
    timedOut: false,
    replayReadStarted: false,
    unsupportedVersion: false,
    processingDurationMs: 0,
  };
}

function deduplicateWarnings(
  warnings: Array<{ code: string; message: string }>,
) {
  return [
    ...new Map(
      warnings.map((warning) => [
        `${warning.code}\n${warning.message}`,
        warning,
      ]),
    ).values(),
  ];
}

function preservedParsedStatus(replayPackage: {
  roundFileCount: number;
  canonicalMatch: { _count: { rounds: number } } | null;
}) {
  if (!replayPackage.canonicalMatch) return null;
  return replayPackage.canonicalMatch._count.rounds <
    replayPackage.roundFileCount
    ? ("PARTIALLY_PARSED" as const)
    : ("PARSED" as const);
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
        select: {
          roundFileCount: true,
          canonicalMatch: {
            select: { _count: { select: { rounds: true } } },
          },
        },
      },
    },
  });
  for (const run of interrupted) {
    const cancelled = Boolean(run.cancelRequestedAt);
    const preservedStatus = preservedParsedStatus(run.replayPackage);
    await db.$transaction([
      db.replayRoundProviderResult.deleteMany({
        where: { providerRunId: run.id },
      }),
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
          status: preservedStatus
            ? preservedStatus
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
      select: {
        id: true,
        roundFileCount: true,
        files: {
          orderBy: { roundIndex: "asc" },
          select: {
            stableFileId: true,
            safeDisplayName: true,
            fingerprintSha256: true,
            roundIndex: true,
          },
        },
      },
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
      executableLabel: "data/tools/replay-parsers/r6-dissect",
      invocationJson: JSON.stringify({
        strategy: "one-round-file-at-a-time",
        executable: "data/tools/replay-parsers/r6-dissect",
        arguments: ["--format", "json", "<app-managed-round-file>"],
        workingDirectory: "<app-managed-round-directory>",
      }),
      inputFilesJson: JSON.stringify(
        replayPackage.files.map((file) => ({
          stableFileId: file.stableFileId,
          safeDisplayName: file.safeDisplayName,
          fingerprint: file.fingerprintSha256.slice(0, 16),
          roundIndex: file.roundIndex,
        })),
      ),
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
          include: {
            files: { orderBy: { roundIndex: "asc" } },
            canonicalMatch: {
              select: { _count: { select: { rounds: true } } },
            },
          },
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
    const roundFailures: Array<{
      replayFileId: string;
      stableFileId: string;
      safeDisplayName: string;
      roundIndex: number | null;
      diagnostics: ReplayProviderDiagnostics;
    }> = [];
    for (const [index, replayFile] of run.replayPackage.files.entries()) {
      if (active.controller.signal.aborted) {
        throw new AppError(
          "Replay parsing was cancelled.",
          409,
          "REPLAY_PARSE_CANCELLED",
        );
      }
      try {
        const parsed = await parseReplayRoundWithFallback({
          providers: integratedReplayProviders,
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
        const roundResult = parsed.result;
        rounds.push(roundResult.round);
        warnings.push(...roundResult.warnings);
        for (const failedProvider of parsed.failedProviders) {
          warnings.push({
            code: failedProvider.internalErrorCode,
            message: `${failedProvider.providerId} failed before a fallback provider succeeded.`,
          });
        }
        await db.replayRoundProviderResult.create({
          data: {
            id: randomUUID(),
            providerRunId: runId,
            replayFileId: replayFile.id,
            providerId: parsed.provider.id,
            providerVersion: parsed.provider.version,
            status: "SUCCESS",
            safeSummary: "Round output schema validated.",
            suggestedAction: null,
            stderrPreview: roundResult.stderrPreview || null,
            stdoutPreview:
              "Provider output was schema validated and retained only after privacy sanitization.",
            exitCode: roundResult.process.exitCode,
            terminationSignal: roundResult.process.terminationSignal,
            timedOut: roundResult.process.timedOut,
            replayReadStarted: roundResult.process.replayReadStarted,
            processingDurationMs: roundResult.processingDurationMs,
          },
        });
      } catch (error) {
        if (active.controller.signal.aborted || isCancellation(error)) {
          throw error;
        }
        const diagnostics = diagnosticsFromUnknown(error);
        roundFailures.push({
          replayFileId: replayFile.id,
          stableFileId: replayFile.stableFileId,
          safeDisplayName: replayFile.safeDisplayName,
          roundIndex: replayFile.roundIndex,
          diagnostics,
        });
        warnings.push({
          code: diagnostics.internalErrorCode,
          message: `${replayFile.safeDisplayName}: ${diagnostics.safeSummary}`,
        });
        await db.replayRoundProviderResult.create({
          data: {
            id: randomUUID(),
            providerRunId: runId,
            replayFileId: replayFile.id,
            providerId: run.providerId,
            providerVersion: run.providerVersion,
            status: diagnostics.unsupportedVersion ? "UNSUPPORTED" : "FAILED",
            failureKind: diagnostics.failureKind,
            internalErrorCode: diagnostics.internalErrorCode,
            safeSummary: diagnostics.safeSummary,
            suggestedAction: diagnostics.suggestedAction,
            stderrPreview: diagnostics.stderrPreview || null,
            stdoutPreview: diagnostics.stdoutPreview,
            exitCode: diagnostics.exitCode,
            terminationSignal: diagnostics.terminationSignal,
            timedOut: diagnostics.timedOut,
            replayReadStarted: diagnostics.replayReadStarted,
            processingDurationMs: diagnostics.processingDurationMs,
          },
        });
        await updateProgress(
          runId,
          ((index + 1) / run.replayPackage.files.length) * 80,
          `Round ${index + 1} of ${run.replayPackage.files.length}: saved failure diagnostics and continued`,
        );
      }
    }
    if (active.controller.signal.aborted) {
      throw new AppError(
        "Replay parsing was cancelled.",
        409,
        "REPLAY_PARSE_CANCELLED",
      );
    }
    const firstFailure = roundFailures[0]?.diagnostics ?? null;
    const aggregateStderr = roundFailures
      .map(
        (failure) =>
          `${failure.safeDisplayName}:\n${failure.diagnostics.stderrPreview || "No stderr was produced."}`,
      )
      .join("\n\n")
      .slice(0, 16_000);
    const outcome = decideReplayParseOutcome({
      totalRoundCount: run.replayPackage.files.length,
      successfulRoundCount: rounds.length,
      failures: roundFailures.map((failure) => failure.diagnostics),
    });
    if (rounds.length === 0) {
      const allUnsupported = outcome.allFailedRoundsUnsupported;
      const summary = allUnsupported
        ? "No round could be decoded by this reviewed parser version."
        : "The local replay provider could not recover a valid round.";
      const preservedStatus = preservedParsedStatus(run.replayPackage);
      await db.$transaction([
        db.replayProviderRun.update({
          where: { id: runId },
          data: {
            status: "ERROR",
            progress: 100,
            stage: allUnsupported
              ? "Replay version unsupported"
              : "Replay provider failed",
            failureKind:
              firstFailure?.failureKind ?? "UNKNOWN_PROVIDER_FAILURE",
            internalErrorCode:
              firstFailure?.internalErrorCode ??
              "REPLAY_PROVIDER_UNKNOWN_FAILURE",
            stdoutPreview: firstFailure?.stdoutPreview ?? null,
            stderrPreview: aggregateStderr || null,
            exitCode: firstFailure?.exitCode ?? null,
            terminationSignal: firstFailure?.terminationSignal ?? null,
            timedOut: roundFailures.some(
              (failure) => failure.diagnostics.timedOut,
            ),
            replayReadStarted: roundFailures.some(
              (failure) => failure.diagnostics.replayReadStarted,
            ),
            unsupportedVersion: allUnsupported,
            successfulRoundCount: 0,
            failedRoundCount: roundFailures.length,
            warningsJson: JSON.stringify(deduplicateWarnings(warnings)),
            errorMessage: summary,
            completedAt: new Date(),
            processingDurationMs: Math.round(performance.now() - started),
          },
        }),
        db.replayPackage.update({
          where: { id: run.replayPackageId },
          data: {
            status: preservedStatus ?? outcome.packageStatus,
            errorMessage: summary,
          },
        }),
      ]);
      await rm(outputDirectory, { recursive: true, force: true }).catch(
        () => undefined,
      );
      return;
    }
    await db.$transaction(
      rounds.map((round) =>
        db.replayFile.updateMany({
          where: {
            replayPackageId: run.replayPackageId,
            stableFileId: round.sourceFileStableId,
          },
          data: { detectedVersion: round.gameVersion },
        }),
      ),
    );
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
          roundFailures: roundFailures.map((failure) => ({
            stableFileId: failure.stableFileId,
            safeDisplayName: failure.safeDisplayName,
            roundIndex: failure.roundIndex,
            failureKind: failure.diagnostics.failureKind,
            internalErrorCode: failure.diagnostics.internalErrorCode,
            safeSummary: failure.diagnostics.safeSummary,
            suggestedAction: failure.diagnostics.suggestedAction,
          })),
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
      expectedRoundCount: run.replayPackage.files.length,
      failedRoundCount: roundFailures.length,
    });
    const partial = outcome.runStatus === "PARTIAL";
    await db.replayProviderRun.update({
      where: { id: runId },
      data: {
        status: outcome.runStatus,
        progress: 100,
        stage: partial
          ? "Partial canonical replay evidence ready"
          : "Canonical replay evidence ready",
        rawOutputRelativePath: toDataRelativePath(finalOutput),
        stdoutPreview: `${rounds.length} round output${rounds.length === 1 ? "" : "s"} schema validated and privacy sanitized.`,
        stderrPreview: aggregateStderr || null,
        failureKind: firstFailure?.failureKind ?? null,
        internalErrorCode: firstFailure?.internalErrorCode ?? null,
        exitCode: firstFailure?.exitCode ?? 0,
        terminationSignal: firstFailure?.terminationSignal ?? null,
        timedOut: roundFailures.some((failure) => failure.diagnostics.timedOut),
        replayReadStarted: true,
        unsupportedVersion: roundFailures.some(
          (failure) => failure.diagnostics.unsupportedVersion,
        ),
        successfulRoundCount: rounds.length,
        failedRoundCount: roundFailures.length,
        warningsJson: JSON.stringify(deduplicateWarnings(warnings)),
        errorMessage: partial
          ? `${rounds.length} of ${run.replayPackage.files.length} rounds were recovered. Failed rounds remain listed for review.`
          : null,
        completedAt: new Date(),
        processingDurationMs: Math.round(performance.now() - started),
      },
    });
  } catch (error) {
    const cancelled = active.controller.signal.aborted || isCancellation(error);
    const diagnostics = diagnosticsFromUnknown(error);
    await rm(outputDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    );
    if (cancelled) {
      await db.replayRoundProviderResult
        .deleteMany({ where: { providerRunId: runId } })
        .catch(() => undefined);
    }
    const run = await db.replayProviderRun.findUnique({
      where: { id: runId },
      select: {
        replayPackageId: true,
        replayPackage: {
          select: {
            roundFileCount: true,
            canonicalMatch: {
              select: { _count: { select: { rounds: true } } },
            },
          },
        },
      },
    });
    if (run) {
      const preservedStatus = preservedParsedStatus(run.replayPackage);
      await db
        .$transaction([
          db.replayProviderRun.update({
            where: { id: runId },
            data: {
              status: cancelled ? "CANCELLED" : "ERROR",
              progress: cancelled ? 0 : 100,
              stage: cancelled ? "Cancelled" : "Replay parser stopped",
              errorMessage: cancelled ? null : safeErrorMessage(error),
              failureKind: cancelled ? null : diagnostics.failureKind,
              internalErrorCode: cancelled
                ? null
                : diagnostics.internalErrorCode,
              stdoutPreview: cancelled ? null : diagnostics.stdoutPreview,
              stderrPreview: cancelled
                ? null
                : diagnostics.stderrPreview || null,
              exitCode: cancelled ? null : diagnostics.exitCode,
              terminationSignal: cancelled
                ? null
                : diagnostics.terminationSignal,
              timedOut: cancelled ? false : diagnostics.timedOut,
              replayReadStarted: cancelled
                ? false
                : diagnostics.replayReadStarted,
              unsupportedVersion: cancelled
                ? false
                : diagnostics.unsupportedVersion,
              completedAt: new Date(),
              processingDurationMs: Math.round(performance.now() - started),
            },
          }),
          db.replayPackage.update({
            where: { id: run.replayPackageId },
            data: {
              status: preservedStatus
                ? preservedStatus
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
        select: {
          roundFileCount: true,
          canonicalMatch: {
            select: { _count: { select: { rounds: true } } },
          },
        },
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
    const preservedStatus = preservedParsedStatus(run.replayPackage);
    return db.$transaction(async (transaction) => {
      await transaction.replayRoundProviderResult.deleteMany({
        where: { providerRunId: runId },
      });
      await transaction.replayPackage.update({
        where: { id: run.replayPackageId },
        data: {
          status: preservedStatus ?? "READY",
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
