import { createHash } from "node:crypto";

import type { ReplayPrivacyMode } from "@prisma/client";

import type {
  ParsedReplayPlayer,
  ParsedReplayRound,
} from "@/lib/replays/providers/types";

export type ReplayPlayerIdentity = {
  replayLocalId: string;
  stableHash: string;
  privacyAlias: string;
  localDisplayName: string | null;
  profileHash: string | null;
  rawUsername: string | null;
  rawProfileId: string | null;
  teamIndex: number | null;
  operatorName: string | null;
  isRecordingPlayer: boolean;
};

function stableHash(seed: string, value: string) {
  return createHash("sha256").update(`${seed}\n${value}`).digest("hex");
}

function deduplicatePlayers(rounds: ParsedReplayRound[]) {
  const players = new Map<string, ParsedReplayPlayer>();
  for (const round of rounds) {
    for (const player of round.players) {
      const key =
        player.rawProfileId ||
        `${player.rawUsername ?? "unknown"}:${player.teamIndex ?? "unknown"}`;
      const current = players.get(key);
      players.set(key, {
        ...current,
        ...player,
        isRecordingPlayer:
          Boolean(current?.isRecordingPlayer) || player.isRecordingPlayer,
      });
    }
  }
  return [...players.values()];
}

export function buildPrivacySafePlayers(input: {
  rounds: ParsedReplayRound[];
  packageFingerprint: string;
  privacyMode: ReplayPrivacyMode;
}) {
  const players = deduplicatePlayers(input.rounds);
  const recordingPlayer = players.find((player) => player.isRecordingPlayer);
  const recordingTeam = recordingPlayer?.teamIndex ?? null;
  let teammateIndex = 0;
  let opponentIndex = 0;
  let unknownIndex = 0;

  return players.map<ReplayPlayerIdentity>((player) => {
    const identitySeed =
      player.rawProfileId ||
      player.replayLocalId ||
      `${player.rawUsername ?? "unknown"}:${player.teamIndex ?? "unknown"}`;
    const identityHash = stableHash(input.packageFingerprint, identitySeed);
    let privacyAlias: string;
    if (player.isRecordingPlayer) {
      privacyAlias = "User";
    } else if (
      recordingTeam !== null &&
      player.teamIndex !== null &&
      player.teamIndex === recordingTeam
    ) {
      teammateIndex += 1;
      privacyAlias = `Teammate ${teammateIndex}`;
    } else if (
      recordingTeam !== null &&
      player.teamIndex !== null &&
      player.teamIndex !== recordingTeam
    ) {
      opponentIndex += 1;
      privacyAlias = `Opponent ${opponentIndex}`;
    } else {
      unknownIndex += 1;
      privacyAlias = `Player ${unknownIndex}`;
    }
    if (input.privacyMode === "HASHED") {
      privacyAlias = `Player ${identityHash.slice(0, 8)}`;
    } else if (input.privacyMode === "REDACTED") {
      privacyAlias = `Player ${players.indexOf(player) + 1}`;
    }
    return {
      replayLocalId: identityHash.slice(0, 24),
      stableHash: identityHash,
      privacyAlias,
      localDisplayName:
        input.privacyMode === "PRESERVE_LOCAL" ? player.rawUsername : null,
      profileHash: player.rawProfileId
        ? stableHash(input.packageFingerprint, player.rawProfileId)
        : null,
      rawUsername: player.rawUsername,
      rawProfileId: player.rawProfileId,
      teamIndex: player.teamIndex,
      operatorName: player.operatorName,
      isRecordingPlayer: player.isRecordingPlayer,
    };
  });
}

export function sanitizeProviderOutput(
  value: unknown,
  players: ReplayPlayerIdentity[],
  privacyMode: ReplayPrivacyMode,
): unknown {
  if (privacyMode === "PRESERVE_LOCAL") return value;
  const usernameAliases = new Map(
    players
      .filter((player) => player.rawUsername)
      .map((player) => [player.rawUsername!, player.privacyAlias]),
  );
  const profileHashes = new Map(
    players
      .filter((player) => player.rawProfileId)
      .map((player) => [player.rawProfileId!, player.profileHash]),
  );
  const visit = (current: unknown, key = ""): unknown => {
    if (Array.isArray(current)) return current.map((item) => visit(item, key));
    if (current && typeof current === "object") {
      return Object.fromEntries(
        Object.entries(current).flatMap(([childKey, childValue]) => {
          if (/profileid/i.test(childKey)) {
            const hash =
              typeof childValue === "string"
                ? profileHashes.get(childValue)
                : null;
            return hash ? [[`${childKey}Hash`, hash]] : [];
          }
          return [[childKey, visit(childValue, childKey)]];
        }),
      );
    }
    if (
      typeof current === "string" &&
      /(username|target|killer|player)/i.test(key)
    ) {
      return usernameAliases.get(current) ?? "Redacted player";
    }
    return current;
  };
  return visit(value);
}
