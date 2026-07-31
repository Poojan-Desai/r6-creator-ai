import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { Prisma, type ReplayProviderRunStatus } from "@prisma/client";

import { db } from "@/lib/db";
import {
  replayImportDirectory,
  replayPackageDirectory,
  replayProviderOutputDirectory,
} from "@/lib/data-paths";
import { AppError } from "@/lib/errors";
import { reconcileInterruptedReplayJobs } from "@/lib/replays/jobs";

const replayInclude = Prisma.validator<Prisma.ReplayPackageInclude>()({
  files: { orderBy: { roundIndex: "asc" as const } },
  providerRuns: { orderBy: { createdAt: "desc" as const }, take: 20 },
  capabilities: { orderBy: { displayName: "asc" as const } },
  canonicalMatch: {
    include: {
      rounds: { orderBy: { roundIndex: "asc" as const } },
      players: {
        orderBy: [{ teamIndex: "asc" }, { privacyAlias: "asc" }],
      },
      events: {
        include: {
          round: { select: { roundIndex: true } },
          actorPlayer: { select: { privacyAlias: true } },
          targetPlayer: { select: { privacyAlias: true } },
          evidence: true,
        },
        orderBy: { createdAt: "asc" as const },
      },
    },
  },
});

type ReplayWithDetail = Prisma.ReplayPackageGetPayload<{
  include: typeof replayInclude;
}>;

function jsonList(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function serializeReplayPackage(replay: ReplayWithDetail) {
  return {
    id: replay.id,
    projectId: replay.projectId,
    displayName: replay.displayName,
    status: replay.status,
    permissionConfirmed: replay.permissionConfirmed,
    privacyMode: replay.privacyMode,
    retentionPreference: replay.retentionPreference,
    notes: replay.notes,
    sourceKind: replay.sourceKind,
    fileCount: replay.fileCount,
    roundFileCount: replay.roundFileCount,
    totalSizeBytes: replay.totalSizeBytes.toString(),
    packageFingerprint: replay.packageFingerprintSha256.slice(0, 16),
    detectedReplayVersion: replay.detectedReplayVersion,
    detectedGameVersion: replay.detectedGameVersion,
    activeProviderId: replay.activeProviderId,
    activeProviderVersion: replay.activeProviderVersion,
    errorMessage: replay.errorMessage,
    createdAt: replay.createdAt.toISOString(),
    updatedAt: replay.updatedAt.toISOString(),
    files: replay.files.map((file) => ({
      id: file.id,
      stableFileId: file.stableFileId,
      safeDisplayName: file.safeDisplayName,
      fileSizeBytes: file.fileSizeBytes.toString(),
      fingerprint: file.fingerprintSha256.slice(0, 16),
      roundIndex: file.roundIndex,
      detectedVersion: file.detectedVersion,
    })),
    providerRuns: replay.providerRuns.map((run) => ({
      id: run.id,
      providerId: run.providerId,
      providerVersion: run.providerVersion,
      providerCommit: run.providerCommit,
      status: run.status,
      progress: run.progress,
      stage: run.stage,
      warnings: jsonList(run.warningsJson),
      errorMessage: run.errorMessage,
      cancelRequestedAt: run.cancelRequestedAt?.toISOString() ?? null,
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      processingDurationMs: run.processingDurationMs,
      createdAt: run.createdAt.toISOString(),
    })),
    capabilities: replay.capabilities.map((capability) => ({
      key: capability.capabilityKey,
      label: capability.displayName,
      state: capability.state,
      providerId: capability.providerId,
      providerVersion: capability.providerVersion,
      evidenceSummary: capability.evidenceSummary,
      missingReason: capability.missingReason,
      populatedCount: capability.populatedCount,
      confidence: capability.confidence,
    })),
    canonicalMatch: replay.canonicalMatch
      ? {
          id: replay.canonicalMatch.id,
          gameVersion: replay.canonicalMatch.gameVersion,
          mapName: replay.canonicalMatch.mapName,
          gameMode: replay.canonicalMatch.gameMode,
          matchType: replay.canonicalMatch.matchType,
          confidenceStatus: replay.canonicalMatch.confidenceStatus,
          validationStatus: replay.canonicalMatch.validationStatus,
          missingEvidence: jsonList(replay.canonicalMatch.missingEvidenceJson),
          rounds: replay.canonicalMatch.rounds.map((round) => ({
            id: round.id,
            roundIndex: round.roundIndex,
            side: round.side,
            site: round.site,
            winner: round.winner,
            winCondition: round.winCondition,
            confidenceStatus: round.confidenceStatus,
          })),
          players: replay.canonicalMatch.players.map((player) => ({
            id: player.id,
            privacyAlias: player.privacyAlias,
            localDisplayName: player.localDisplayName,
            teamIndex: player.teamIndex,
            operatorName: player.operatorName,
            isRecordingPlayer: player.isRecordingPlayer,
          })),
          events: replay.canonicalMatch.events.map((event) => ({
            id: event.id,
            category: event.category,
            roundIndex: event.round?.roundIndex ?? null,
            actorAlias: event.actorPlayer?.privacyAlias ?? null,
            targetAlias: event.targetPlayer?.privacyAlias ?? null,
            directObservation: JSON.parse(
              event.directObservationJson,
            ) as unknown,
            inference: JSON.parse(event.inferenceJson) as unknown,
            confidenceStatus: event.confidenceStatus,
            validationStatus: event.validationStatus,
            missingEvidence: jsonList(event.missingEvidenceJson),
            evidence: event.evidence.map((evidence) => ({
              id: evidence.id,
              evidenceClass: evidence.evidenceClass,
              sourceReference: evidence.sourceReference,
              confidenceStatus: evidence.confidenceStatus,
              validationStatus: evidence.validationStatus,
            })),
          })),
        }
      : null,
  };
}

export type ReplayPackageDto = ReturnType<typeof serializeReplayPackage>;

export async function listReplayPackages() {
  await reconcileInterruptedReplayJobs();
  const replays = await db.replayPackage.findMany({
    orderBy: { createdAt: "desc" },
    include: replayInclude,
  });
  return replays.map(serializeReplayPackage);
}

export async function findReplayPackage(id: string) {
  await reconcileInterruptedReplayJobs();
  const replay = await db.replayPackage.findUnique({
    where: { id },
    include: replayInclude,
  });
  return replay ? serializeReplayPackage(replay) : null;
}

export async function deleteReplayPackage(id: string) {
  const replay = await db.replayPackage.findUnique({
    where: { id },
    select: {
      id: true,
      providerRuns: { select: { id: true, status: true } },
    },
  });
  if (!replay) {
    throw new AppError(
      "That Match Replay no longer exists.",
      404,
      "REPLAY_NOT_FOUND",
    );
  }
  if (
    replay.providerRuns.some((run) =>
      (["QUEUED", "RUNNING"] as ReplayProviderRunStatus[]).includes(run.status),
    )
  ) {
    throw new AppError(
      "Cancel the active replay parse before deleting this package.",
      409,
      "REPLAY_PARSE_ACTIVE",
    );
  }
  const deletionDirectory = replayImportDirectory(`delete-${id}`);
  const staged: Array<{ source: string; destination: string }> = [];
  await rm(deletionDirectory, { recursive: true, force: true });
  await mkdir(deletionDirectory, { recursive: true });
  const stageDirectory = async (source: string, label: string) => {
    try {
      await access(source);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return;
      }
      throw error;
    }
    const destination = path.join(deletionDirectory, label);
    await rename(source, destination);
    staged.push({ source, destination });
  };
  try {
    await stageDirectory(replayPackageDirectory(id), "package");
    for (const run of replay.providerRuns) {
      await stageDirectory(
        replayProviderOutputDirectory(run.id),
        `provider-${run.id}`,
      );
    }
    await db.replayPackage.delete({ where: { id } });
  } catch (error) {
    for (const item of staged.reverse()) {
      await mkdir(path.dirname(item.source), { recursive: true });
      await rename(item.destination, item.source).catch(() => undefined);
    }
    await rm(deletionDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    );
    throw error;
  }
  await rm(deletionDirectory, { recursive: true, force: true });
}
