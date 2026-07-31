import { createHash, randomUUID } from "node:crypto";

import type {
  CanonicalEventCategory,
  ReplayCapabilityState,
  ReplayPackage,
  ReplayPrivacyMode,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  buildPrivacySafePlayers,
  sanitizeProviderOutput,
  type ReplayPlayerIdentity,
} from "@/lib/replays/privacy";
import type {
  ParsedReplayFeedback,
  ParsedReplayRound,
  ReplayProviderCapability,
} from "@/lib/replays/providers/types";

export const REPLAY_CAPABILITIES: Array<{
  key: ReplayProviderCapability;
  label: string;
}> = [
  { key: "MATCH_METADATA", label: "Match metadata" },
  { key: "MAP", label: "Map" },
  { key: "GAME_MODE", label: "Game mode" },
  { key: "ROUND_METADATA", label: "Round metadata" },
  { key: "PLAYERS", label: "Players" },
  { key: "TEAMS", label: "Teams" },
  { key: "OPERATORS", label: "Operators" },
  { key: "KILLS", label: "Kills" },
  { key: "DEATHS", label: "Deaths" },
  { key: "HEADSHOTS", label: "Headshots" },
  { key: "DBNO", label: "DBNO" },
  { key: "ASSISTS", label: "Assists" },
  { key: "OBJECTIVE_EVENTS", label: "Objective events" },
  { key: "DEFUSER_EVENTS", label: "Defuser events" },
  { key: "SCORES", label: "Scores" },
  { key: "TIMER", label: "Timer" },
  { key: "POSITIONS", label: "Positions" },
  { key: "POSITION_TIMESTAMPS", label: "Position timestamps" },
  { key: "VIEW_YAW", label: "View yaw" },
  { key: "VIEW_PITCH", label: "View pitch" },
  { key: "ORIENTATION", label: "Orientation" },
  { key: "STANCE", label: "Stance" },
  { key: "HEALTH", label: "Health" },
  { key: "WEAPONS", label: "Weapons" },
  { key: "AMMUNITION", label: "Ammunition" },
  { key: "SHOTS", label: "Shots" },
  { key: "DAMAGE", label: "Damage" },
  { key: "GADGETS", label: "Gadgets" },
  { key: "REINFORCEMENTS", label: "Reinforcements" },
  { key: "DRONES", label: "Drones" },
  { key: "DESTRUCTION", label: "Destruction" },
  { key: "CAMERA_TARGET", label: "Camera target" },
  {
    key: "PLAYER_POV_RECONSTRUCTION",
    label: "Player POV reconstruction",
  },
  { key: "ORIGINAL_VIDEO", label: "Original video footage" },
  { key: "ORIGINAL_AUDIO", label: "Original audio" },
];

type CapabilityEvaluation = {
  state: ReplayCapabilityState;
  evidenceSummary: string;
  missingReason?: string;
  populatedCount?: number;
  confidence?: number;
};

function normalizeEventType(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function feedbackCategory(event: ParsedReplayFeedback): CanonicalEventCategory {
  const type = normalizeEventType(event.type);
  if (type.includes("kill")) return "KILL";
  if (type.includes("dbno") || type.includes("down")) return "DBNO";
  if (type.includes("locate")) return "OBJECTIVE_LOCATE";
  if (type.includes("plant")) return "DEFUSER_PLANT";
  if (type.includes("disable") || type.includes("defuse"))
    return "DEFUSER_DISABLE";
  if (type.includes("disconnect")) return "PLAYER_DISCONNECT";
  if (type.includes("reconnect")) return "PLAYER_RECONNECT";
  return "OTHER";
}

function countFeedback(rounds: ParsedReplayRound[], matcher: RegExp) {
  return rounds.reduce(
    (count, round) =>
      count +
      round.feedback.filter((event) =>
        matcher.test(normalizeEventType(event.type)),
      ).length,
    0,
  );
}

export function evaluateReplayCapabilities(
  rounds: ParsedReplayRound[],
  options: { expectedRoundCount?: number; failedRoundCount?: number } = {},
): Record<ReplayProviderCapability, CapabilityEvaluation> {
  const first = rounds[0];
  const expectedRoundCount = options.expectedRoundCount ?? rounds.length;
  const failedRoundCount =
    options.failedRoundCount ?? Math.max(0, expectedRoundCount - rounds.length);
  const playerCount = Math.max(
    ...rounds.map((round) => round.players.length),
    0,
  );
  const operatorCount = Math.max(
    ...rounds.map(
      (round) =>
        round.players.filter((player) => Boolean(player.operatorName)).length,
    ),
    0,
  );
  const teamCount = Math.max(...rounds.map((round) => round.teams.length), 0);
  const kills = countFeedback(rounds, /kill/);
  const headshots = rounds.reduce(
    (count, round) =>
      count + round.feedback.filter((event) => event.headshot === true).length,
    0,
  );
  const dbno = countFeedback(rounds, /dbno|down/);
  const objective = countFeedback(rounds, /locate|objective/);
  const defuser = countFeedback(rounds, /plant|disable|defuse/);
  const scoreCount =
    first?.teams.filter((team) => team.score !== null).length ?? 0;
  const timerObservationCount = rounds.reduce(
    (count, round) =>
      count +
      round.feedback.filter(
        (event) => event.timeInSeconds !== null || Boolean(event.timeLabel),
      ).length,
    0,
  );
  const unsupported = (reason: string): CapabilityEvaluation => ({
    state: "UNSUPPORTED_PROVIDER",
    evidenceSummary: "No field was produced by the reviewed provider.",
    missingReason: reason,
  });
  const result = Object.fromEntries(
    REPLAY_CAPABILITIES.map(({ key }) => [
      key,
      unsupported("r6-dissect does not expose this field."),
    ]),
  ) as Record<ReplayProviderCapability, CapabilityEvaluation>;

  result.MATCH_METADATA = {
    state:
      first?.gameVersion && first.mapName && first.gameMode
        ? "AVAILABLE_VERIFIED"
        : "PARTIALLY_AVAILABLE",
    evidenceSummary:
      "Header fields were parsed directly from the replay container and schema validated.",
    populatedCount: [
      first?.gameVersion,
      first?.matchId,
      first?.mapName,
      first?.gameMode,
      first?.matchType,
      first?.timestamp,
    ].filter(Boolean).length,
    confidence: 0.95,
  };
  result.MAP = {
    state: first?.mapName ? "AVAILABLE_VERIFIED" : "EMPTY_IN_REPLAY",
    evidenceSummary: first?.mapName
      ? `The replay header identified map ${first.mapName}.`
      : "No map value was populated in the parsed replay header.",
    populatedCount: first?.mapName ? 1 : 0,
    confidence: first?.mapName ? 0.95 : 0,
  };
  result.GAME_MODE = {
    state: first?.gameMode ? "AVAILABLE_VERIFIED" : "EMPTY_IN_REPLAY",
    evidenceSummary: first?.gameMode
      ? `The replay header identified game mode ${first.gameMode}.`
      : "No game-mode value was populated in the parsed replay header.",
    populatedCount: first?.gameMode ? 1 : 0,
    confidence: first?.gameMode ? 0.95 : 0,
  };
  result.ROUND_METADATA = {
    state: "PARTIALLY_AVAILABLE",
    evidenceSummary: `${rounds.length} of ${expectedRoundCount} round file${expectedRoundCount === 1 ? "" : "s"} supplied header, team, site, and result fields where populated.`,
    missingReason:
      failedRoundCount > 0
        ? `${failedRoundCount} round file${failedRoundCount === 1 ? "" : "s"} failed provider decoding. Stable elapsed round boundaries and a complete match clock were also not produced.`
        : "Stable elapsed round boundaries and a complete match clock were not produced.",
    populatedCount: rounds.length,
    confidence: 0.85,
  };
  result.PLAYERS = {
    state: playerCount > 0 ? "AVAILABLE_VERIFIED" : "EMPTY_IN_REPLAY",
    evidenceSummary: `${playerCount} replay player records were schema validated.`,
    populatedCount: playerCount,
    confidence: playerCount > 0 ? 0.95 : 0,
  };
  result.TEAMS = {
    state: teamCount > 0 ? "AVAILABLE_VERIFIED" : "EMPTY_IN_REPLAY",
    evidenceSummary: `${teamCount} team record${teamCount === 1 ? "" : "s"} were schema validated with roles, scores, and round outcomes where populated.`,
    populatedCount: teamCount,
    confidence: teamCount > 0 ? 0.9 : 0,
  };
  result.OPERATORS = {
    state:
      operatorCount === 0
        ? "EMPTY_IN_REPLAY"
        : operatorCount === playerCount
          ? "AVAILABLE_VERIFIED"
          : "PARTIALLY_AVAILABLE",
    evidenceSummary: `${operatorCount} player records contained an operator name.`,
    populatedCount: operatorCount,
    confidence: operatorCount > 0 ? 0.9 : 0,
  };
  result.KILLS = {
    state: kills > 0 ? "AVAILABLE_VERIFIED" : "EMPTY_IN_REPLAY",
    evidenceSummary: `${kills} direct match-feedback kill record${kills === 1 ? "" : "s"} were parsed.`,
    populatedCount: kills,
    confidence: kills > 0 ? 0.9 : 0,
  };
  result.DEATHS = {
    state: kills > 0 ? "AVAILABLE_UNVERIFIED" : "EMPTY_IN_REPLAY",
    evidenceSummary:
      "Death candidates are represented by the target of direct kill feedback.",
    missingReason:
      "A separate stable death-state stream was not produced by this provider.",
    populatedCount: kills,
    confidence: kills > 0 ? 0.75 : 0,
  };
  result.HEADSHOTS = {
    state: headshots > 0 ? "AVAILABLE_VERIFIED" : "EMPTY_IN_REPLAY",
    evidenceSummary: `${headshots} kill feedback record${headshots === 1 ? "" : "s"} carried a headshot flag.`,
    populatedCount: headshots,
    confidence: headshots > 0 ? 0.9 : 0,
  };
  result.DBNO = {
    state: dbno > 0 ? "AVAILABLE_UNVERIFIED" : "EMPTY_IN_REPLAY",
    evidenceSummary: `${dbno} DBNO-like feedback record${dbno === 1 ? "" : "s"} were present.`,
    missingReason:
      "DBNO semantics remain provider- and replay-version-dependent.",
    populatedCount: dbno,
    confidence: dbno > 0 ? 0.65 : 0,
  };
  result.OBJECTIVE_EVENTS = {
    state: objective > 0 ? "AVAILABLE_VERIFIED" : "EMPTY_IN_REPLAY",
    evidenceSummary: `${objective} objective feedback record${objective === 1 ? "" : "s"} were present.`,
    populatedCount: objective,
    confidence: objective > 0 ? 0.85 : 0,
  };
  result.DEFUSER_EVENTS = {
    state: defuser > 0 ? "AVAILABLE_VERIFIED" : "EMPTY_IN_REPLAY",
    evidenceSummary: `${defuser} defuser feedback record${defuser === 1 ? "" : "s"} were present.`,
    populatedCount: defuser,
    confidence: defuser > 0 ? 0.85 : 0,
  };
  result.SCORES = {
    state: scoreCount > 0 ? "PARTIALLY_AVAILABLE" : "EMPTY_IN_REPLAY",
    evidenceSummary: `${scoreCount} team score value${scoreCount === 1 ? "" : "s"} were populated in the first round output.`,
    missingReason:
      "Score semantics across a multi-round package require cross-round validation.",
    populatedCount: scoreCount,
    confidence: scoreCount > 0 ? 0.75 : 0,
  };
  result.TIMER = {
    state:
      timerObservationCount > 0 ? "PARTIALLY_AVAILABLE" : "EMPTY_IN_REPLAY",
    evidenceSummary: `${timerObservationCount} event record${timerObservationCount === 1 ? "" : "s"} carried a round-clock observation.`,
    missingReason:
      "The provider does not expose a continuous timer stream or elapsed match timestamps.",
    populatedCount: timerObservationCount,
    confidence: timerObservationCount > 0 ? 0.75 : 0,
  };
  result.ORIGINAL_VIDEO = {
    state: "EMPTY_IN_REPLAY",
    evidenceSummary: "Match Replay .rec files are not video containers.",
    missingReason: "Add an optional gameplay recording for original pixels.",
  };
  result.ORIGINAL_AUDIO = {
    state: "EMPTY_IN_REPLAY",
    evidenceSummary:
      "Match Replay .rec files do not provide original game audio.",
    missingReason: "Add an optional gameplay recording for original audio.",
  };
  return result;
}

function playerForName(
  players: ReplayPlayerIdentity[],
  rawName: string | null,
) {
  if (!rawName) return null;
  return (
    players.find((player) => player.rawUsername === rawName) ??
    players.find((player) => player.privacyAlias === rawName) ??
    null
  );
}

function safeDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function stableId(prefix: string, ...values: Array<string | number>) {
  return `${prefix}:${createHash("sha256")
    .update(values.join("\n"))
    .digest("hex")
    .slice(0, 24)}`;
}

export function sanitizeParsedReplayRounds(input: {
  rounds: ParsedReplayRound[];
  players: ReplayPlayerIdentity[];
  privacyMode: ReplayPrivacyMode;
}) {
  return input.rounds.map((round) => ({
    ...round,
    recordingPlayerId: null,
    recordingProfileId: null,
    players: round.players.map((player, playerIndex) => {
      const privacyPlayer =
        input.players.find(
          (candidate) =>
            candidate.rawProfileId &&
            candidate.rawProfileId === player.rawProfileId,
        ) ?? playerForName(input.players, player.rawUsername);
      return {
        ...player,
        replayLocalId:
          privacyPlayer?.replayLocalId ?? `redacted-player-${playerIndex + 1}`,
        rawUsername: privacyPlayer?.privacyAlias ?? null,
        rawProfileId: null,
      };
    }),
    feedback: round.feedback.map((event) => ({
      ...event,
      username:
        playerForName(input.players, event.username)?.privacyAlias ?? null,
      target: playerForName(input.players, event.target)?.privacyAlias ?? null,
    })),
    rawOutput: sanitizeProviderOutput(
      round.rawOutput,
      input.players,
      input.privacyMode,
    ),
  }));
}

export async function saveCanonicalReplay(input: {
  replayPackage: ReplayPackage;
  rounds: ParsedReplayRound[];
  providerId: string;
  providerVersion: string;
  expectedRoundCount?: number;
  failedRoundCount?: number;
}) {
  const first = input.rounds[0];
  if (!first) throw new Error("Cannot save an empty replay parse.");
  const players = buildPrivacySafePlayers({
    rounds: input.rounds,
    packageFingerprint: input.replayPackage.packageFingerprintSha256,
    privacyMode: input.replayPackage.privacyMode,
  });
  const matchId = randomUUID();
  const matchStableId = stableId(
    "canonical-match",
    input.replayPackage.packageFingerprintSha256,
  );
  const recordingPlayer = players.find((player) => player.isRecordingPlayer);
  const expectedRoundCount = input.expectedRoundCount ?? input.rounds.length;
  const failedRoundCount =
    input.failedRoundCount ??
    Math.max(0, expectedRoundCount - input.rounds.length);
  const partial = failedRoundCount > 0;
  const matchMissingEvidence = [
    "Original gameplay pixels are not contained in .rec files.",
    "Original game audio is not contained in .rec files.",
    "Position and orientation were not exposed by this provider.",
    ...(partial
      ? [
          `${failedRoundCount} of ${expectedRoundCount} round files could not be decoded by this provider run.`,
        ]
      : []),
  ];

  await db.$transaction(async (transaction) => {
    await transaction.canonicalMatch.deleteMany({
      where: { replayPackageId: input.replayPackage.id },
    });
    await transaction.replayCapability.deleteMany({
      where: { replayPackageId: input.replayPackage.id },
    });
    await transaction.canonicalMatch.create({
      data: {
        id: matchId,
        stableId: matchStableId,
        replayPackageId: input.replayPackage.id,
        videoProjectId: input.replayPackage.projectId,
        replayLocalMatchId: first.matchId,
        gameVersion: first.gameVersion,
        matchTimestamp: safeDate(first.timestamp),
        mapName: first.mapName,
        gameMode: first.gameMode,
        matchType: first.matchType,
        recordingPlayerStableId: recordingPlayer?.stableHash ?? null,
        sourceProviderId: input.providerId,
        sourceProviderVersion: input.providerVersion,
        confidenceStatus: partial ? "MODERATE" : "HIGH",
        validationStatus: "VALIDATED",
        missingEvidenceJson: JSON.stringify(matchMissingEvidence),
      },
    });
    const canonicalPlayers = await Promise.all(
      players.map((player) =>
        transaction.canonicalPlayer.create({
          data: {
            id: randomUUID(),
            stableId: stableId(
              "canonical-player",
              matchStableId,
              player.stableHash,
            ),
            matchId,
            replayLocalPlayerId: player.replayLocalId,
            privacyAlias: player.privacyAlias,
            localDisplayName: player.localDisplayName,
            profileHash: player.profileHash,
            teamIndex: player.teamIndex,
            operatorName: player.operatorName,
            isRecordingPlayer: player.isRecordingPlayer,
            sourceProviderId: input.providerId,
            sourceProviderVersion: input.providerVersion,
            confidenceStatus: "HIGH",
            validationStatus: "VALIDATED",
            missingEvidenceJson: JSON.stringify([
              "Health state unavailable.",
              "Position and view direction unavailable.",
            ]),
          },
        }),
      ),
    );
    const playerIds = new Map(
      players.map((player, index) => [
        player.stableHash,
        canonicalPlayers[index]!.id,
      ]),
    );
    for (const [index, round] of input.rounds.entries()) {
      const roundIndex = round.roundNumber ?? index + 1;
      const winningTeam = round.teams.find((team) => team.won === true);
      const recordingTeam = round.players.find(
        (player) => player.isRecordingPlayer,
      )?.teamIndex;
      const side =
        recordingTeam === undefined || recordingTeam === null
          ? null
          : (round.teams[recordingTeam]?.role ?? null);
      const canonicalRound = await transaction.canonicalRound.create({
        data: {
          id: randomUUID(),
          stableId: stableId("canonical-round", matchStableId, roundIndex),
          matchId,
          roundIndex,
          side,
          site: round.site,
          winner: winningTeam?.role ?? winningTeam?.name ?? null,
          winCondition: winningTeam?.winCondition ?? null,
          sourceProviderId: input.providerId,
          sourceProviderVersion: input.providerVersion,
          confidenceStatus: "HIGH",
          validationStatus: "VALIDATED",
          missingEvidenceJson: JSON.stringify([
            "Elapsed round start and end timestamps unavailable.",
            "Feedback time values are preserved as round-clock observations.",
          ]),
        },
      });
      for (const [eventIndex, event] of round.feedback.entries()) {
        const actor = playerForName(players, event.username);
        const target = playerForName(players, event.target);
        const category = feedbackCategory(event);
        const eventRecord = await transaction.canonicalEvent.create({
          data: {
            id: randomUUID(),
            stableId: stableId(
              "canonical-event",
              canonicalRound.stableId,
              eventIndex,
              event.type,
            ),
            matchId,
            roundId: canonicalRound.id,
            category,
            timestampSeconds: null,
            actorPlayerId: actor ? playerIds.get(actor.stableHash) : null,
            targetPlayerId: target ? playerIds.get(target.stableHash) : null,
            directObservationJson: JSON.stringify({
              feedbackType: event.type,
              actorAlias: actor?.privacyAlias ?? null,
              targetAlias: target?.privacyAlias ?? null,
              headshot: event.headshot,
              roundClock: event.timeLabel,
              roundClockSecondsRemaining: event.timeInSeconds,
            }),
            inferenceJson: JSON.stringify(
              category === "KILL"
                ? {
                    possibleDeathOfTarget: Boolean(target),
                    note: "The target of kill feedback supports a death event, but no independent death-state stream was parsed.",
                  }
                : {},
            ),
            confidenceStatus: category === "OTHER" ? "MODERATE" : "HIGH",
            validationStatus: category === "OTHER" ? "UNVERIFIED" : "VALIDATED",
            missingEvidenceJson: JSON.stringify([
              "Elapsed match timestamp unavailable; the value shown is the observed round clock.",
            ]),
          },
        });
        await transaction.canonicalEvidence.create({
          data: {
            id: randomUUID(),
            eventId: eventRecord.id,
            evidenceClass: "STABLE_REPLAY_FIELD",
            sourceProviderId: input.providerId,
            sourceProviderVersion: input.providerVersion,
            sourceFileStableId: round.sourceFileStableId,
            sourceReference: `replay-file:${round.sourceFileStableId}:match-feedback:${eventIndex}`,
            directObservationJson: eventRecord.directObservationJson,
            confidenceStatus: eventRecord.confidenceStatus,
            validationStatus: eventRecord.validationStatus,
            missingEvidenceJson: eventRecord.missingEvidenceJson,
          },
        });
      }
    }
    const evaluations = evaluateReplayCapabilities(input.rounds, {
      expectedRoundCount,
      failedRoundCount,
    });
    await transaction.replayCapability.createMany({
      data: REPLAY_CAPABILITIES.map(({ key, label }) => {
        const evaluation = evaluations[key];
        return {
          id: randomUUID(),
          replayPackageId: input.replayPackage.id,
          capabilityKey: key,
          displayName: label,
          state: evaluation.state,
          providerId: input.providerId,
          providerVersion: input.providerVersion,
          evidenceSummary: evaluation.evidenceSummary,
          missingReason: evaluation.missingReason ?? null,
          populatedCount: evaluation.populatedCount ?? null,
          confidence: evaluation.confidence ?? null,
        };
      }),
    });
    await transaction.replayPackage.update({
      where: { id: input.replayPackage.id },
      data: {
        status: partial ? "PARTIALLY_PARSED" : "PARSED",
        detectedReplayVersion: first.gameVersion,
        detectedGameVersion: first.codeVersion
          ? String(first.codeVersion)
          : null,
        activeProviderId: input.providerId,
        activeProviderVersion: input.providerVersion,
        errorMessage: partial
          ? `${input.rounds.length} of ${expectedRoundCount} rounds were recovered. Failed rounds remain available for review and retry.`
          : null,
      },
    });
  });

  return {
    players,
    sanitizedRounds: sanitizeParsedReplayRounds({
      rounds: input.rounds,
      players,
      privacyMode: input.replayPackage.privacyMode as ReplayPrivacyMode,
    }),
  };
}
