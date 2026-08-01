import {
  Prisma,
  type SynchronizationAnchorKind,
  type SynchronizationStatus,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  calculateSynchronizationMapping,
  clusterOffsetPairs,
  mapReplayToVideoTime,
  OFFSET_DISCOVERY_ALGORITHM_VERSION,
  type OffsetPair,
  SYNCHRONIZATION_ALGORITHM_VERSION,
} from "@/lib/replay-video-sync-math";

const synchronizationInclude =
  Prisma.validator<Prisma.ReplayVideoSynchronizationInclude>()({
    anchors: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    roundAdjustments: { orderBy: { replayRoundIndex: "asc" } },
    offsetCandidates: { orderBy: { rank: "asc" } },
  });

type SynchronizationWithDetails = Prisma.ReplayVideoSynchronizationGetPayload<{
  include: typeof synchronizationInclude;
}>;

const synchronizationAnchorKindSchema = z.enum([
  "ROUND_START",
  "ROUND_END",
  "KILL",
  "DEATH",
  "HEADSHOT",
  "DEFUSER_PLANT",
  "DEFUSER_DISABLE",
  "SCORE_CHANGE",
  "TIMER_STATE",
  "MATCH_RESULT",
  "LOADING_TRANSITION",
  "DEATH_SCREEN_TRANSITION",
  "AUDIO_PEAK",
  "TRANSCRIPT_PHRASE",
  "OTHER",
]);

const boundedTimestamp = z.coerce
  .number()
  .finite("Enter a valid timestamp.")
  .min(0, "Timestamps cannot be negative.")
  .max(86_400, "Timestamps must be within 24 hours.");

export const synchronizationAnchorInputSchema = z
  .object({
    kind: synchronizationAnchorKindSchema,
    label: z.string().trim().min(1, "Describe this anchor.").max(160),
    videoTimestampSeconds: boundedTimestamp,
    replayTimestampSeconds: boundedTimestamp,
    replayRoundIndex: z.coerce.number().int().min(1).max(100).nullable(),
    replayEventStableId: z.string().trim().max(191).nullable(),
    videoObservation: z
      .string()
      .trim()
      .min(1, "Describe what is directly visible or audible in the video.")
      .max(1_000),
    alignmentInference: z.string().trim().max(1_000).nullable(),
    confidence: z.coerce.number().finite().min(0).max(1),
    userConfirmed: z.boolean(),
  })
  .strict();

export const roundAdjustmentInputSchema = z
  .object({
    replayRoundIndex: z.coerce.number().int().min(1).max(100),
    adjustmentSeconds: z.coerce.number().finite().min(-600).max(600),
    reason: z.string().trim().max(1_000).nullable(),
    confidence: z.coerce.number().finite().min(0).max(1),
    userConfirmed: z.boolean(),
  })
  .strict();

const notesInputSchema = z
  .object({
    notes: z.string().trim().max(5_000).nullable(),
  })
  .strict();

type TransactionClient = Prisma.TransactionClient;

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function seconds(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

const synchronizationProjectInclude =
  Prisma.validator<Prisma.StudioProjectInclude>()({
    inputs: {
      include: {
        videoProject: {
          select: {
            id: true,
            name: true,
            durationSeconds: true,
            width: true,
            height: true,
          },
        },
        replayPackage: {
          select: {
            id: true,
            displayName: true,
            status: true,
            activeProviderId: true,
            activeProviderVersion: true,
            canonicalMatch: {
              select: {
                id: true,
                stableId: true,
                mapName: true,
                gameMode: true,
                sourceProviderId: true,
                sourceProviderVersion: true,
                rounds: {
                  orderBy: { roundIndex: "asc" },
                  select: {
                    stableId: true,
                    roundIndex: true,
                    side: true,
                    site: true,
                    startSeconds: true,
                    endSeconds: true,
                    winner: true,
                    winCondition: true,
                    confidenceStatus: true,
                    validationStatus: true,
                    missingEvidenceJson: true,
                  },
                },
                events: {
                  orderBy: [{ timestampSeconds: "asc" }, { createdAt: "asc" }],
                  select: {
                    stableId: true,
                    category: true,
                    timestampSeconds: true,
                    directObservationJson: true,
                    inferenceJson: true,
                    confidenceStatus: true,
                    validationStatus: true,
                    conflictingEvidenceJson: true,
                    missingEvidenceJson: true,
                    round: { select: { stableId: true, roundIndex: true } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

async function findSynchronizationProject(
  client: typeof db | TransactionClient,
  studioProjectId: string,
) {
  const project = await client.studioProject.findUnique({
    where: { id: studioProjectId },
    include: synchronizationProjectInclude,
  });
  if (!project) {
    throw new AppError(
      "That unified project no longer exists.",
      404,
      "STUDIO_PROJECT_NOT_FOUND",
    );
  }
  const primaryInput = project.inputs.find(
    (input) => input.kind === "PRIMARY_RECORDING",
  );
  const replayInput = project.inputs.find(
    (input) => input.kind === "MATCH_REPLAY",
  );
  if (
    project.inputMode !== "SCREEN_RECORDING_AND_REPLAY" ||
    !primaryInput?.videoProject ||
    !replayInput?.replayPackage
  ) {
    throw new AppError(
      "Replay/video synchronization requires a combined project with both a primary recording and a Match Replay.",
      409,
      "SYNCHRONIZATION_INPUTS_REQUIRED",
    );
  }
  if (!replayInput.replayPackage.canonicalMatch) {
    throw new AppError(
      "Parse the selected Match Replay before creating synchronization anchors.",
      409,
      "SYNCHRONIZATION_REPLAY_NOT_PARSED",
    );
  }
  return {
    project,
    primaryRecording: primaryInput.videoProject,
    replay: replayInput.replayPackage,
    match: replayInput.replayPackage.canonicalMatch,
  };
}

async function findMutableSynchronization(
  client: typeof db | TransactionClient,
  studioProjectId: string,
  synchronizationId: string,
) {
  const synchronization = await client.replayVideoSynchronization.findUnique({
    where: { id: synchronizationId },
    include: synchronizationInclude,
  });
  if (!synchronization || synchronization.studioProjectId !== studioProjectId) {
    throw new AppError(
      "That synchronization version no longer exists in this project.",
      404,
      "SYNCHRONIZATION_NOT_FOUND",
    );
  }
  if (synchronization.status !== "DRAFT") {
    throw new AppError(
      "Verified synchronization versions are read-only. Create a correction version instead.",
      409,
      "SYNCHRONIZATION_IMMUTABLE",
    );
  }
  return synchronization;
}

function serializeSynchronization(synchronization: SynchronizationWithDetails) {
  return {
    id: synchronization.id,
    studioProjectId: synchronization.studioProjectId,
    version: synchronization.version,
    status: synchronization.status,
    basedOnVersionId: synchronization.basedOnVersionId,
    mappingAlgorithmVersion: synchronization.mappingAlgorithmVersion,
    offsetSeconds: synchronization.offsetSeconds,
    slope: synchronization.slope,
    driftSecondsPerHour: synchronization.driftSecondsPerHour,
    rootMeanSquareErrorSeconds: synchronization.rootMeanSquareErrorSeconds,
    confidence: synchronization.confidence,
    confidenceLabel: synchronization.confidenceLabel,
    supportingEvidence: parseJsonArray(synchronization.supportingEvidenceJson),
    conflictingEvidence: parseJsonArray(
      synchronization.conflictingEvidenceJson,
    ),
    missingEvidence: parseJsonArray(synchronization.missingEvidenceJson),
    notes: synchronization.notes,
    userVerifiedAt: synchronization.userVerifiedAt?.toISOString() ?? null,
    createdAt: synchronization.createdAt.toISOString(),
    updatedAt: synchronization.updatedAt.toISOString(),
    anchors: synchronization.anchors.map((anchor) => ({
      id: anchor.id,
      kind: anchor.kind,
      source: anchor.source,
      matchStatus: anchor.matchStatus,
      label: anchor.label,
      videoTimestampSeconds: anchor.videoTimestampSeconds,
      replayTimestampSeconds: anchor.replayTimestampSeconds,
      replayRoundIndex: anchor.replayRoundIndex,
      replayRoundStableId: anchor.replayRoundStableId,
      replayEventStableId: anchor.replayEventStableId,
      replayEventCategory: anchor.replayEventCategory,
      videoObservation: parseJsonObject(anchor.videoObservationJson),
      replayFact: parseJsonObject(anchor.replayFactJson),
      alignmentInference: parseJsonObject(anchor.alignmentInferenceJson),
      supportingEvidence: parseJsonArray(anchor.supportingEvidenceJson),
      conflictingEvidence: parseJsonArray(anchor.conflictingEvidenceJson),
      missingEvidence: parseJsonArray(anchor.missingEvidenceJson),
      confidence: anchor.confidence,
      userConfirmed: anchor.userConfirmed,
      residualSeconds: anchor.residualSeconds,
      sortOrder: anchor.sortOrder,
      createdAt: anchor.createdAt.toISOString(),
      updatedAt: anchor.updatedAt.toISOString(),
    })),
    roundAdjustments: synchronization.roundAdjustments.map((adjustment) => ({
      id: adjustment.id,
      replayRoundIndex: adjustment.replayRoundIndex,
      adjustmentSeconds: adjustment.adjustmentSeconds,
      reason: adjustment.reason,
      confidence: adjustment.confidence,
      userConfirmed: adjustment.userConfirmed,
      createdAt: adjustment.createdAt.toISOString(),
      updatedAt: adjustment.updatedAt.toISOString(),
    })),
    offsetCandidates: synchronization.offsetCandidates.map((candidate) => ({
      id: candidate.id,
      rank: candidate.rank,
      status: candidate.status,
      offsetSeconds: candidate.offsetSeconds,
      slope: candidate.slope,
      driftSecondsPerHour: candidate.driftSecondsPerHour,
      confidence: candidate.confidence,
      compatiblePairCount: candidate.compatiblePairCount,
      distinctEvidenceTypeCount: candidate.distinctEvidenceTypeCount,
      supportingEvidence: parseJsonArray(candidate.supportingEvidenceJson),
      conflictingEvidence: parseJsonArray(candidate.conflictingEvidenceJson),
      missingEvidence: parseJsonArray(candidate.missingEvidenceJson),
      algorithmVersion: candidate.algorithmVersion,
      createdAt: candidate.createdAt.toISOString(),
    })),
  };
}

export type ReplayVideoSynchronizationDto = ReturnType<
  typeof serializeSynchronization
>;

async function refreshMapping(
  transaction: TransactionClient,
  synchronizationId: string,
) {
  const synchronization =
    await transaction.replayVideoSynchronization.findUniqueOrThrow({
      where: { id: synchronizationId },
      include: { anchors: true },
    });
  const mapping = calculateSynchronizationMapping(
    synchronization.anchors
      .filter((anchor) => anchor.matchStatus === "MATCHED")
      .map((anchor) => ({
        id: anchor.id,
        kind: anchor.kind,
        videoTimestampSeconds: anchor.videoTimestampSeconds,
        replayTimestampSeconds: anchor.replayTimestampSeconds,
        confidence: anchor.confidence,
        userConfirmed: anchor.userConfirmed,
        replayRoundIndex: anchor.replayRoundIndex,
      })),
  );
  const preservedDiscoveryMissing = parseJsonArray(
    synchronization.missingEvidenceJson,
  ).filter(
    (item): item is string =>
      typeof item === "string" &&
      item.startsWith("Automatic offset discovery:"),
  );
  const anchorConflicts = synchronization.anchors.flatMap((anchor, index) =>
    parseJsonArray(anchor.conflictingEvidenceJson).flatMap((item) =>
      typeof item === "string" ? [`Anchor ${index + 1}: ${item}`] : [],
    ),
  );
  const anchorMissing = synchronization.anchors.flatMap((anchor, index) =>
    parseJsonArray(anchor.missingEvidenceJson).flatMap((item) =>
      typeof item === "string" ? [`Anchor ${index + 1}: ${item}`] : [],
    ),
  );
  const uniqueStrings = (values: string[]) => Array.from(new Set(values));

  for (const anchor of synchronization.anchors) {
    const residual = mapping.residuals.find(
      (item) => item.anchorId === anchor.id,
    );
    await transaction.replayVideoSyncAnchor.update({
      where: { id: anchor.id },
      data: { residualSeconds: residual?.residualSeconds ?? null },
    });
  }
  await transaction.replayVideoSynchronization.update({
    where: { id: synchronizationId },
    data: {
      mappingAlgorithmVersion: SYNCHRONIZATION_ALGORITHM_VERSION,
      offsetSeconds: mapping.offsetSeconds,
      slope: mapping.slope,
      driftSecondsPerHour: mapping.driftSecondsPerHour,
      rootMeanSquareErrorSeconds: mapping.rootMeanSquareErrorSeconds,
      confidence: mapping.confidence,
      confidenceLabel: mapping.confidenceLabel,
      supportingEvidenceJson: JSON.stringify(mapping.supportingEvidence),
      conflictingEvidenceJson: JSON.stringify(
        uniqueStrings([...mapping.conflictingEvidence, ...anchorConflicts]),
      ),
      missingEvidenceJson: JSON.stringify(
        uniqueStrings([
          ...mapping.missingEvidence,
          ...anchorMissing,
          ...preservedDiscoveryMissing,
        ]),
      ),
    },
  });
}

export async function createSynchronizationDraft(
  studioProjectId: string,
  basedOnVersionId?: string | null,
) {
  await findSynchronizationProject(db, studioProjectId);
  const id = await db.$transaction(async (transaction) => {
    const latest = await transaction.replayVideoSynchronization.findFirst({
      where: { studioProjectId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;
    const source = basedOnVersionId
      ? await transaction.replayVideoSynchronization.findUnique({
          where: { id: basedOnVersionId },
          include: synchronizationInclude,
        })
      : null;
    if (basedOnVersionId && source?.studioProjectId !== studioProjectId) {
      throw new AppError(
        "The correction source does not belong to this project.",
        400,
        "SYNCHRONIZATION_SOURCE_MISMATCH",
      );
    }
    const created = await transaction.replayVideoSynchronization.create({
      data: {
        studioProjectId,
        version,
        basedOnVersionId: source?.id ?? null,
        notes: source?.notes ?? null,
      },
    });
    if (source) {
      for (const anchor of source.anchors) {
        await transaction.replayVideoSyncAnchor.create({
          data: {
            synchronizationId: created.id,
            kind: anchor.kind,
            source: anchor.source,
            matchStatus: anchor.matchStatus,
            label: anchor.label,
            videoTimestampSeconds: anchor.videoTimestampSeconds,
            replayTimestampSeconds: anchor.replayTimestampSeconds,
            replayRoundIndex: anchor.replayRoundIndex,
            replayRoundStableId: anchor.replayRoundStableId,
            replayEventStableId: anchor.replayEventStableId,
            replayEventCategory: anchor.replayEventCategory,
            videoObservationJson: anchor.videoObservationJson,
            replayFactJson: anchor.replayFactJson,
            alignmentInferenceJson: anchor.alignmentInferenceJson,
            supportingEvidenceJson: anchor.supportingEvidenceJson,
            conflictingEvidenceJson: anchor.conflictingEvidenceJson,
            missingEvidenceJson: anchor.missingEvidenceJson,
            confidence: anchor.confidence,
            userConfirmed: anchor.userConfirmed,
            sortOrder: anchor.sortOrder,
          },
        });
      }
      for (const adjustment of source.roundAdjustments) {
        await transaction.replayVideoSyncRoundAdjustment.create({
          data: {
            synchronizationId: created.id,
            replayRoundIndex: adjustment.replayRoundIndex,
            adjustmentSeconds: adjustment.adjustmentSeconds,
            reason: adjustment.reason,
            confidence: adjustment.confidence,
            userConfirmed: adjustment.userConfirmed,
          },
        });
      }
    }
    await refreshMapping(transaction, created.id);
    return created.id;
  });
  return findSynchronization(studioProjectId, id);
}

export async function addSynchronizationAnchor(
  studioProjectId: string,
  synchronizationId: string,
  rawInput: unknown,
) {
  const input = synchronizationAnchorInputSchema.parse(rawInput);
  const sources = await findSynchronizationProject(db, studioProjectId);
  if (input.videoTimestampSeconds > sources.primaryRecording.durationSeconds) {
    throw new AppError(
      "The video timestamp is past the end of the primary recording.",
      400,
      "SYNCHRONIZATION_VIDEO_TIME_OUT_OF_RANGE",
    );
  }

  const round = input.replayRoundIndex
    ? sources.match.rounds.find(
        (item) => item.roundIndex === input.replayRoundIndex,
      )
    : null;
  if (input.replayRoundIndex && !round) {
    throw new AppError(
      "Choose a round from the selected Match Replay.",
      400,
      "SYNCHRONIZATION_ROUND_MISMATCH",
    );
  }
  const event = input.replayEventStableId
    ? sources.match.events.find(
        (item) => item.stableId === input.replayEventStableId,
      )
    : null;
  if (input.replayEventStableId && !event) {
    throw new AppError(
      "Choose an event from the selected Match Replay.",
      400,
      "SYNCHRONIZATION_EVENT_MISMATCH",
    );
  }
  if (
    event?.round?.roundIndex &&
    input.replayRoundIndex &&
    event.round.roundIndex !== input.replayRoundIndex
  ) {
    throw new AppError(
      "The selected replay event belongs to a different round.",
      400,
      "SYNCHRONIZATION_EVENT_ROUND_MISMATCH",
    );
  }

  const missingEvidence: string[] = [];
  const conflictingEvidence: string[] = [];
  const supportingEvidence = [
    "The video timestamp and replay-relative timestamp were explicitly selected by the user.",
  ];
  if (event) {
    supportingEvidence.push(
      `The selected replay record contains a ${event.category.toLowerCase().replaceAll("_", " ")} event.`,
    );
    if (event.timestampSeconds === null) {
      missingEvidence.push(
        "The replay parser did not provide this event's replay-relative timestamp; the replay time is user-entered.",
      );
    } else if (
      Math.abs(event.timestampSeconds - input.replayTimestampSeconds) > 2
    ) {
      conflictingEvidence.push(
        `The saved replay event time differs from the entered replay time by ${seconds(
          Math.abs(event.timestampSeconds - input.replayTimestampSeconds),
        )} seconds.`,
      );
    }
  } else {
    missingEvidence.push(
      "No specific parsed replay event was attached to this anchor.",
    );
  }
  if (!input.userConfirmed) {
    missingEvidence.push(
      "This anchor has not been marked as visually confirmed by the user.",
    );
  }

  await db.$transaction(async (transaction) => {
    const synchronization = await findMutableSynchronization(
      transaction,
      studioProjectId,
      synchronizationId,
    );
    await transaction.replayVideoSyncAnchor.create({
      data: {
        synchronizationId,
        kind: input.kind,
        label: input.label,
        videoTimestampSeconds: seconds(input.videoTimestampSeconds),
        replayTimestampSeconds: seconds(input.replayTimestampSeconds),
        replayRoundIndex:
          input.replayRoundIndex ?? event?.round?.roundIndex ?? null,
        replayRoundStableId: round?.stableId ?? event?.round?.stableId ?? null,
        replayEventStableId: event?.stableId ?? null,
        replayEventCategory: event?.category ?? null,
        videoObservationJson: JSON.stringify({
          type: "video_observation",
          text: input.videoObservation,
          timestampSeconds: seconds(input.videoTimestampSeconds),
        }),
        replayFactJson: JSON.stringify({
          type: "replay_fact",
          category: event?.category ?? input.kind,
          eventStableId: event?.stableId ?? null,
          roundIndex:
            input.replayRoundIndex ?? event?.round?.roundIndex ?? null,
          enteredReplayTimestampSeconds: seconds(input.replayTimestampSeconds),
          parsedReplayTimestampSeconds: event?.timestampSeconds ?? null,
          timestampSource:
            event?.timestampSeconds === null || !event
              ? "USER_ENTERED"
              : "REPLAY_PARSER",
          sourceProviderId: sources.match.sourceProviderId,
          sourceProviderVersion: sources.match.sourceProviderVersion,
          directObservation: event
            ? parseJsonObject(event.directObservationJson)
            : null,
        }),
        alignmentInferenceJson: JSON.stringify({
          type: "alignment_inference",
          text:
            input.alignmentInference ||
            "The selected video observation may correspond to the selected replay-relative point.",
          algorithmVersion: SYNCHRONIZATION_ALGORITHM_VERSION,
        }),
        supportingEvidenceJson: JSON.stringify(supportingEvidence),
        conflictingEvidenceJson: JSON.stringify(conflictingEvidence),
        missingEvidenceJson: JSON.stringify(missingEvidence),
        confidence: input.confidence,
        userConfirmed: input.userConfirmed,
        sortOrder: synchronization.anchors.length,
      },
    });
    await refreshMapping(transaction, synchronizationId);
  });
  return findSynchronization(studioProjectId, synchronizationId);
}

export async function updateSynchronizationAnchor(
  studioProjectId: string,
  synchronizationId: string,
  anchorId: string,
  rawInput: unknown,
) {
  const input = synchronizationAnchorInputSchema.parse(rawInput);
  const sources = await findSynchronizationProject(db, studioProjectId);
  if (input.videoTimestampSeconds > sources.primaryRecording.durationSeconds) {
    throw new AppError(
      "The video timestamp is past the end of the primary recording.",
      400,
      "SYNCHRONIZATION_VIDEO_TIME_OUT_OF_RANGE",
    );
  }
  const existing = await db.replayVideoSyncAnchor.findUnique({
    where: { id: anchorId },
  });
  if (!existing || existing.synchronizationId !== synchronizationId) {
    throw new AppError(
      "That synchronization anchor no longer exists.",
      404,
      "SYNCHRONIZATION_ANCHOR_NOT_FOUND",
    );
  }
  const event = input.replayEventStableId
    ? sources.match.events.find(
        (item) => item.stableId === input.replayEventStableId,
      )
    : null;
  if (input.replayEventStableId && !event) {
    throw new AppError(
      "Choose an event from the selected Match Replay.",
      400,
      "SYNCHRONIZATION_EVENT_MISMATCH",
    );
  }
  const round = input.replayRoundIndex
    ? sources.match.rounds.find(
        (item) => item.roundIndex === input.replayRoundIndex,
      )
    : null;
  if (input.replayRoundIndex && !round) {
    throw new AppError(
      "Choose a round from the selected Match Replay.",
      400,
      "SYNCHRONIZATION_ROUND_MISMATCH",
    );
  }

  await db.$transaction(async (transaction) => {
    await findMutableSynchronization(
      transaction,
      studioProjectId,
      synchronizationId,
    );
    const missingEvidence: string[] = [];
    const conflictingEvidence: string[] = [];
    if (!event) {
      missingEvidence.push(
        "No specific parsed replay event was attached to this anchor.",
      );
    } else if (event.timestampSeconds === null) {
      missingEvidence.push(
        "The replay parser did not provide this event's replay-relative timestamp; the replay time is user-entered.",
      );
    } else if (
      Math.abs(event.timestampSeconds - input.replayTimestampSeconds) > 2
    ) {
      conflictingEvidence.push(
        `The saved replay event time differs from the entered replay time by ${seconds(
          Math.abs(event.timestampSeconds - input.replayTimestampSeconds),
        )} seconds.`,
      );
    }
    if (!input.userConfirmed) {
      missingEvidence.push(
        "This anchor has not been marked as visually confirmed by the user.",
      );
    }
    await transaction.replayVideoSyncAnchor.update({
      where: { id: anchorId },
      data: {
        kind: input.kind,
        label: input.label,
        videoTimestampSeconds: seconds(input.videoTimestampSeconds),
        replayTimestampSeconds: seconds(input.replayTimestampSeconds),
        replayRoundIndex:
          input.replayRoundIndex ?? event?.round?.roundIndex ?? null,
        replayRoundStableId: round?.stableId ?? event?.round?.stableId ?? null,
        replayEventStableId: event?.stableId ?? null,
        replayEventCategory: event?.category ?? null,
        videoObservationJson: JSON.stringify({
          type: "video_observation",
          text: input.videoObservation,
          timestampSeconds: seconds(input.videoTimestampSeconds),
        }),
        replayFactJson: JSON.stringify({
          type: "replay_fact",
          category: event?.category ?? input.kind,
          eventStableId: event?.stableId ?? null,
          roundIndex:
            input.replayRoundIndex ?? event?.round?.roundIndex ?? null,
          enteredReplayTimestampSeconds: seconds(input.replayTimestampSeconds),
          parsedReplayTimestampSeconds: event?.timestampSeconds ?? null,
          timestampSource:
            event?.timestampSeconds === null || !event
              ? "USER_ENTERED"
              : "REPLAY_PARSER",
          sourceProviderId: sources.match.sourceProviderId,
          sourceProviderVersion: sources.match.sourceProviderVersion,
          directObservation: event
            ? parseJsonObject(event.directObservationJson)
            : null,
        }),
        alignmentInferenceJson: JSON.stringify({
          type: "alignment_inference",
          text:
            input.alignmentInference ||
            "The selected video observation may correspond to the selected replay-relative point.",
          algorithmVersion: SYNCHRONIZATION_ALGORITHM_VERSION,
        }),
        supportingEvidenceJson: JSON.stringify([
          "The video timestamp and replay-relative timestamp were explicitly selected by the user.",
        ]),
        conflictingEvidenceJson: JSON.stringify(conflictingEvidence),
        missingEvidenceJson: JSON.stringify(missingEvidence),
        confidence: input.confidence,
        userConfirmed: input.userConfirmed,
      },
    });
    await refreshMapping(transaction, synchronizationId);
  });
  return findSynchronization(studioProjectId, synchronizationId);
}

export async function deleteSynchronizationAnchor(
  studioProjectId: string,
  synchronizationId: string,
  anchorId: string,
) {
  await db.$transaction(async (transaction) => {
    await findMutableSynchronization(
      transaction,
      studioProjectId,
      synchronizationId,
    );
    const deleted = await transaction.replayVideoSyncAnchor.deleteMany({
      where: { id: anchorId, synchronizationId },
    });
    if (!deleted.count) {
      throw new AppError(
        "That synchronization anchor no longer exists.",
        404,
        "SYNCHRONIZATION_ANCHOR_NOT_FOUND",
      );
    }
    await refreshMapping(transaction, synchronizationId);
  });
  return findSynchronization(studioProjectId, synchronizationId);
}

export async function upsertRoundAdjustment(
  studioProjectId: string,
  synchronizationId: string,
  rawInput: unknown,
) {
  const input = roundAdjustmentInputSchema.parse(rawInput);
  const sources = await findSynchronizationProject(db, studioProjectId);
  if (
    !sources.match.rounds.some(
      (round) => round.roundIndex === input.replayRoundIndex,
    )
  ) {
    throw new AppError(
      "Choose a round from the selected Match Replay.",
      400,
      "SYNCHRONIZATION_ROUND_MISMATCH",
    );
  }
  await db.$transaction(async (transaction) => {
    await findMutableSynchronization(
      transaction,
      studioProjectId,
      synchronizationId,
    );
    await transaction.replayVideoSyncRoundAdjustment.upsert({
      where: {
        synchronizationId_replayRoundIndex: {
          synchronizationId,
          replayRoundIndex: input.replayRoundIndex,
        },
      },
      create: {
        synchronizationId,
        replayRoundIndex: input.replayRoundIndex,
        adjustmentSeconds: input.adjustmentSeconds,
        reason: input.reason,
        confidence: input.confidence,
        userConfirmed: input.userConfirmed,
      },
      update: {
        adjustmentSeconds: input.adjustmentSeconds,
        reason: input.reason,
        confidence: input.confidence,
        userConfirmed: input.userConfirmed,
      },
    });
  });
  return findSynchronization(studioProjectId, synchronizationId);
}

export async function deleteRoundAdjustment(
  studioProjectId: string,
  synchronizationId: string,
  replayRoundIndex: number,
) {
  await db.$transaction(async (transaction) => {
    await findMutableSynchronization(
      transaction,
      studioProjectId,
      synchronizationId,
    );
    await transaction.replayVideoSyncRoundAdjustment.deleteMany({
      where: { synchronizationId, replayRoundIndex },
    });
  });
  return findSynchronization(studioProjectId, synchronizationId);
}

export async function updateSynchronizationNotes(
  studioProjectId: string,
  synchronizationId: string,
  rawInput: unknown,
) {
  const input = notesInputSchema.parse(rawInput);
  await findMutableSynchronization(db, studioProjectId, synchronizationId);
  await db.replayVideoSynchronization.update({
    where: { id: synchronizationId },
    data: { notes: input.notes },
  });
  return findSynchronization(studioProjectId, synchronizationId);
}

export async function deleteSynchronizationDraft(
  studioProjectId: string,
  synchronizationId: string,
) {
  await findMutableSynchronization(db, studioProjectId, synchronizationId);
  await db.replayVideoSynchronization.delete({
    where: { id: synchronizationId },
  });
}

export async function verifySynchronization(
  studioProjectId: string,
  synchronizationId: string,
) {
  const sources = await findSynchronizationProject(db, studioProjectId);
  await db.$transaction(async (transaction) => {
    await findMutableSynchronization(
      transaction,
      studioProjectId,
      synchronizationId,
    );
    await refreshMapping(transaction, synchronizationId);
    const refreshed =
      await transaction.replayVideoSynchronization.findUniqueOrThrow({
        where: { id: synchronizationId },
        include: { anchors: true, roundAdjustments: true },
      });
    const confirmedAnchors = refreshed.anchors.filter(
      (anchor) => anchor.matchStatus === "MATCHED" && anchor.userConfirmed,
    );
    const distinctReplayTimes = new Set(
      confirmedAnchors.map((anchor) => seconds(anchor.replayTimestampSeconds)),
    ).size;
    if (confirmedAnchors.length < 2 || distinctReplayTimes < 2) {
      throw new AppError(
        "Add and confirm at least two anchors at different replay times before verifying this mapping.",
        409,
        "SYNCHRONIZATION_TWO_ANCHORS_REQUIRED",
      );
    }
    if (refreshed.confidence < 0.6) {
      throw new AppError(
        "This mapping is still low confidence. Correct the anchors and visually preview them before verification.",
        409,
        "SYNCHRONIZATION_LOW_CONFIDENCE",
      );
    }
    if (Math.abs(refreshed.driftSecondsPerHour) > 120) {
      throw new AppError(
        "The calculated drift is outside the conservative verification limit. Correct the anchor points.",
        409,
        "SYNCHRONIZATION_DRIFT_OUT_OF_RANGE",
      );
    }
    if ((refreshed.rootMeanSquareErrorSeconds ?? 0) > 5) {
      throw new AppError(
        "The anchor error is too large to verify. Correct the alignment points.",
        409,
        "SYNCHRONIZATION_RESIDUAL_TOO_HIGH",
      );
    }
    for (const anchor of confirmedAnchors) {
      const adjustment =
        refreshed.roundAdjustments.find(
          (item) => item.replayRoundIndex === anchor.replayRoundIndex,
        )?.adjustmentSeconds ?? 0;
      const mapped = mapReplayToVideoTime({
        replayTimestampSeconds: anchor.replayTimestampSeconds,
        offsetSeconds: refreshed.offsetSeconds,
        slope: refreshed.slope,
        roundAdjustmentSeconds: adjustment,
      });
      if (mapped < 0 || mapped > sources.primaryRecording.durationSeconds) {
        throw new AppError(
          "At least one mapped replay point falls outside the source recording. Correct the anchors before verification.",
          409,
          "SYNCHRONIZATION_MAPPING_OUT_OF_RANGE",
        );
      }
    }

    await transaction.replayVideoSynchronization.updateMany({
      where: {
        studioProjectId,
        status: "VERIFIED",
        id: { not: synchronizationId },
      },
      data: { status: "SUPERSEDED" },
    });
    await transaction.replayVideoSynchronization.update({
      where: { id: synchronizationId },
      data: {
        status: "VERIFIED",
        userVerifiedAt: new Date(),
      },
    });
  });
  return findSynchronization(studioProjectId, synchronizationId);
}

function eventKindFromCategory(category: string | null, eventType: string) {
  const normalized = category ?? eventType;
  if (normalized.includes("DEFUSER_PLANT")) return "DEFUSER_PLANT";
  if (normalized.includes("DEFUSER_DISABLE")) return "DEFUSER_DISABLE";
  if (normalized.includes("HEADSHOT")) return "HEADSHOT";
  if (normalized.includes("MULTI_KILL") || normalized.includes("KILL"))
    return "KILL";
  if (normalized.includes("DEATH")) return "DEATH";
  if (
    normalized.includes("ROUND_WIN") ||
    normalized.includes("ROUND_LOSS") ||
    normalized.includes("ROUND_END")
  )
    return "ROUND_END";
  if (normalized.includes("MATCH_END")) return "MATCH_RESULT";
  return null;
}

function replayKind(category: string) {
  if (category === "ROUND_END") return "ROUND_END";
  if (category === "MATCH_END") return "MATCH_RESULT";
  if (category === "KILL") return "KILL";
  if (category === "DEATH") return "DEATH";
  if (category === "HEADSHOT") return "HEADSHOT";
  if (category === "DEFUSER_PLANT") return "DEFUSER_PLANT";
  if (category === "DEFUSER_DISABLE") return "DEFUSER_DISABLE";
  return null;
}

export async function discoverSynchronizationOffsetCandidates(
  studioProjectId: string,
  synchronizationId: string,
) {
  const sources = await findSynchronizationProject(db, studioProjectId);
  await findMutableSynchronization(db, studioProjectId, synchronizationId);
  const replayEvents = sources.match.events.flatMap((event) => {
    const kind = replayKind(event.category);
    if (!kind || event.timestampSeconds === null) return [];
    return [
      {
        kind,
        timestampSeconds: event.timestampSeconds,
        label: `${event.category.toLowerCase().replaceAll("_", " ")}${
          event.round?.roundIndex ? ` in round ${event.round.roundIndex}` : ""
        }`,
      },
    ];
  });
  const replayRounds = sources.match.rounds.flatMap((round) => {
    const items: Array<{
      kind: string;
      timestampSeconds: number;
      label: string;
    }> = [];
    if (round.startSeconds !== null) {
      items.push({
        kind: "ROUND_START",
        timestampSeconds: round.startSeconds,
        label: `round ${round.roundIndex} start`,
      });
    }
    if (round.endSeconds !== null) {
      items.push({
        kind: "ROUND_END",
        timestampSeconds: round.endSeconds,
        label: `round ${round.roundIndex} end`,
      });
    }
    return items;
  });
  const replayEvidence = [...replayEvents, ...replayRounds];

  const detectorEvents = await db.detectorEvent.findMany({
    where: {
      detectorRun: {
        analysisJob: { projectId: sources.primaryRecording.id },
        status: "COMPLETED",
      },
    },
    orderBy: { peakSeconds: "asc" },
    take: 500,
    select: {
      eventType: true,
      category: true,
      peakSeconds: true,
      confidence: true,
      sourceSignal: true,
      evidence: {
        where: { kind: "SUPPORTING" },
        take: 3,
        select: { summary: true },
      },
    },
  });
  const videoEvidence = detectorEvents.flatMap((event) => {
    const kind = eventKindFromCategory(event.category, event.eventType);
    if (!kind) return [];
    return [
      {
        kind,
        timestampSeconds: event.peakSeconds,
        confidence: event.confidence,
        label:
          event.evidence[0]?.summary ??
          `${event.eventType.toLowerCase().replaceAll("_", " ")} from ${event.sourceSignal.toLowerCase().replaceAll("_", " ")}`,
      },
    ];
  });

  const pairs: OffsetPair[] = [];
  for (const video of videoEvidence) {
    for (const replay of replayEvidence) {
      if (video.kind !== replay.kind) continue;
      pairs.push({
        videoTimestampSeconds: video.timestampSeconds,
        replayTimestampSeconds: replay.timestampSeconds,
        evidenceType: video.kind,
        confidence: video.confidence,
        videoEvidence: video.label,
        replayEvidence: replay.label,
      });
    }
  }
  const clusters = clusterOffsetPairs(pairs);
  const missingEvidence: string[] = [];
  if (!replayEvidence.length) {
    missingEvidence.push(
      "The parsed Match Replay contains no replay-relative event or round timestamps, so automatic offset discovery cannot compare the timelines.",
    );
  }
  if (!videoEvidence.length) {
    missingEvidence.push(
      "The primary recording has no compatible completed local detector events for automatic anchor discovery.",
    );
  }
  if (replayEvidence.length && videoEvidence.length && !clusters.length) {
    missingEvidence.push(
      "Timestamped evidence exists on both timelines, but no offset had at least two compatible supporting pairs.",
    );
  }

  await db.$transaction(async (transaction) => {
    await findMutableSynchronization(
      transaction,
      studioProjectId,
      synchronizationId,
    );
    await transaction.replayVideoSyncOffsetCandidate.deleteMany({
      where: { synchronizationId },
    });
    for (const [index, cluster] of clusters.entries()) {
      await transaction.replayVideoSyncOffsetCandidate.create({
        data: {
          synchronizationId,
          rank: index + 1,
          offsetSeconds: cluster.offsetSeconds,
          confidence: cluster.confidence,
          compatiblePairCount: cluster.compatiblePairCount,
          distinctEvidenceTypeCount: cluster.distinctEvidenceTypeCount,
          supportingEvidenceJson: JSON.stringify(cluster.evidence),
          missingEvidenceJson: JSON.stringify([
            "This is an unaccepted offset suggestion. It does not measure drift and must be checked with manual anchors.",
          ]),
          algorithmVersion: OFFSET_DISCOVERY_ALGORITHM_VERSION,
        },
      });
    }
    if (!clusters.length) {
      const current =
        await transaction.replayVideoSynchronization.findUniqueOrThrow({
          where: { id: synchronizationId },
        });
      const existingMissing = parseJsonArray(
        current.missingEvidenceJson,
      ).filter(
        (item) =>
          typeof item !== "string" ||
          !item.startsWith("Automatic offset discovery:"),
      );
      await transaction.replayVideoSynchronization.update({
        where: { id: synchronizationId },
        data: {
          missingEvidenceJson: JSON.stringify([
            ...existingMissing,
            ...missingEvidence.map(
              (item) => `Automatic offset discovery: ${item}`,
            ),
          ]),
        },
      });
    }
  });
  return {
    synchronization: await findSynchronization(
      studioProjectId,
      synchronizationId,
    ),
    discovery: {
      algorithmVersion: OFFSET_DISCOVERY_ALGORITHM_VERSION,
      replayTimestampedEvidenceCount: replayEvidence.length,
      videoTimestampedEvidenceCount: videoEvidence.length,
      compatiblePairCount: pairs.length,
      candidateCount: clusters.length,
      missingEvidence,
    },
  };
}

export async function findSynchronization(
  studioProjectId: string,
  synchronizationId: string,
) {
  const synchronization = await db.replayVideoSynchronization.findUnique({
    where: { id: synchronizationId },
    include: synchronizationInclude,
  });
  if (!synchronization || synchronization.studioProjectId !== studioProjectId) {
    return null;
  }
  return serializeSynchronization(synchronization);
}

export async function getSynchronizationWorkspace(
  studioProjectId: string,
  selectedVersion?: number | null,
) {
  const sources = await findSynchronizationProject(db, studioProjectId);
  const versions = await db.replayVideoSynchronization.findMany({
    where: { studioProjectId },
    orderBy: { version: "desc" },
    include: synchronizationInclude,
  });
  const selected =
    (selectedVersion
      ? versions.find((version) => version.version === selectedVersion)
      : versions[0]) ?? null;
  const duration = sources.primaryRecording.durationSeconds;
  return {
    studioProject: {
      id: sources.project.id,
      name: sources.project.name,
      inputMode: sources.project.inputMode,
    },
    primaryRecording: sources.primaryRecording,
    replay: {
      id: sources.replay.id,
      displayName: sources.replay.displayName,
      status: sources.replay.status,
      providerId: sources.match.sourceProviderId,
      providerVersion: sources.match.sourceProviderVersion,
      mapName: sources.match.mapName,
      gameMode: sources.match.gameMode,
      rounds: sources.match.rounds.map((round) => ({
        stableId: round.stableId,
        roundIndex: round.roundIndex,
        side: round.side,
        site: round.site,
        startSeconds: round.startSeconds,
        endSeconds: round.endSeconds,
        winner: round.winner,
        winCondition: round.winCondition,
        confidenceStatus: round.confidenceStatus,
        validationStatus: round.validationStatus,
        missingEvidence: parseJsonArray(round.missingEvidenceJson),
      })),
      events: sources.match.events.map((event) => ({
        stableId: event.stableId,
        category: event.category,
        timestampSeconds: event.timestampSeconds,
        roundIndex: event.round?.roundIndex ?? null,
        confidenceStatus: event.confidenceStatus,
        validationStatus: event.validationStatus,
        conflictingEvidence: parseJsonArray(event.conflictingEvidenceJson),
        missingEvidence: parseJsonArray(event.missingEvidenceJson),
      })),
      timingSummary: {
        timestampedRoundBoundaryCount: sources.match.rounds.reduce(
          (sum, round) =>
            sum +
            Number(round.startSeconds !== null) +
            Number(round.endSeconds !== null),
          0,
        ),
        timestampedEventCount: sources.match.events.filter(
          (event) => event.timestampSeconds !== null,
        ).length,
        totalEventCount: sources.match.events.length,
      },
    },
    versions: versions.map((version) => ({
      id: version.id,
      version: version.version,
      status: version.status,
      confidence: version.confidence,
      confidenceLabel: version.confidenceLabel,
      anchorCount: version.anchors.length,
      createdAt: version.createdAt.toISOString(),
      userVerifiedAt: version.userVerifiedAt?.toISOString() ?? null,
    })),
    selectedSynchronization: selected
      ? {
          ...serializeSynchronization(selected),
          anchors: serializeSynchronization(selected).anchors.map((anchor) => {
            const adjustment =
              selected.roundAdjustments.find(
                (item) => item.replayRoundIndex === anchor.replayRoundIndex,
              )?.adjustmentSeconds ?? 0;
            const rawMappedVideoSeconds = mapReplayToVideoTime({
              replayTimestampSeconds: anchor.replayTimestampSeconds,
              offsetSeconds: selected.offsetSeconds,
              slope: selected.slope,
              roundAdjustmentSeconds: adjustment,
            });
            return {
              ...anchor,
              rawMappedVideoSeconds,
              previewVideoSeconds: Math.min(
                duration,
                Math.max(0, rawMappedVideoSeconds),
              ),
              mappedOutsideVideo:
                rawMappedVideoSeconds < 0 || rawMappedVideoSeconds > duration,
            };
          }),
        }
      : null,
  };
}

export type SynchronizationWorkspaceDto = Awaited<
  ReturnType<typeof getSynchronizationWorkspace>
>;

export const SYNCHRONIZATION_ANCHOR_OPTIONS: ReadonlyArray<{
  value: SynchronizationAnchorKind;
  label: string;
}> = [
  { value: "ROUND_START", label: "Round start" },
  { value: "ROUND_END", label: "Round ending" },
  { value: "KILL", label: "Kill" },
  { value: "DEATH", label: "Death" },
  { value: "HEADSHOT", label: "Headshot" },
  { value: "DEFUSER_PLANT", label: "Defuser plant" },
  { value: "DEFUSER_DISABLE", label: "Defuser disable" },
  { value: "SCORE_CHANGE", label: "Score change" },
  { value: "TIMER_STATE", label: "Timer state" },
  { value: "MATCH_RESULT", label: "Match result" },
  { value: "LOADING_TRANSITION", label: "Loading transition" },
  { value: "DEATH_SCREEN_TRANSITION", label: "Death-screen transition" },
  { value: "AUDIO_PEAK", label: "Audio peak" },
  { value: "TRANSCRIPT_PHRASE", label: "Transcript phrase" },
  { value: "OTHER", label: "Other matched point" },
];

export function canEditSynchronization(status: SynchronizationStatus) {
  return status === "DRAFT";
}
