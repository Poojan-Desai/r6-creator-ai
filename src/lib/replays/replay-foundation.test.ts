import { describe, expect, it } from "vitest";

import {
  evaluateReplayCapabilities,
  sanitizeParsedReplayRounds,
} from "@/lib/replays/canonical";
import {
  buildReplayPackageFingerprint,
  validateReplayUploadIdentity,
  validateReplayZipEntry,
} from "@/lib/replays/import";
import {
  buildPrivacySafePlayers,
  sanitizeProviderOutput,
} from "@/lib/replays/privacy";
import {
  normalizeR6DissectOutput,
  r6DissectOutputSchema,
} from "@/lib/replays/providers/r6-dissect";
import type { ParsedReplayRound } from "@/lib/replays/providers/types";

function parsedRound(): ParsedReplayRound {
  return {
    sourceFileStableId: "round-1",
    gameVersion: "Y9S1",
    codeVersion: 123,
    matchId: "match",
    timestamp: "2026-07-30T00:00:00Z",
    matchType: "Ranked",
    mapName: "Chalet",
    site: "Kitchen",
    gameMode: "Bomb",
    roundNumber: 1,
    recordingPlayerId: "1",
    recordingProfileId: "profile-user",
    teams: [
      {
        name: "Team A",
        score: 1,
        won: true,
        winCondition: "Eliminated opponents",
        role: "Attack",
      },
      {
        name: "Team B",
        score: 0,
        won: false,
        winCondition: null,
        role: "Defense",
      },
    ],
    players: [
      {
        replayLocalId: "profile-user",
        rawUsername: "ActualUser",
        rawProfileId: "profile-user",
        teamIndex: 0,
        operatorName: "Ash",
        isRecordingPlayer: true,
      },
      {
        replayLocalId: "profile-team",
        rawUsername: "PrivateTeammate",
        rawProfileId: "profile-team",
        teamIndex: 0,
        operatorName: "Thermite",
        isRecordingPlayer: false,
      },
      {
        replayLocalId: "profile-enemy",
        rawUsername: "PrivateOpponent",
        rawProfileId: "profile-enemy",
        teamIndex: 1,
        operatorName: "Mute",
        isRecordingPlayer: false,
      },
    ],
    feedback: [
      {
        type: "Kill",
        username: "ActualUser",
        target: "PrivateOpponent",
        headshot: true,
        timeLabel: "2:14",
        timeInSeconds: 134,
      },
    ],
    rawOutput: {
      recordingProfileID: "profile-user",
      players: [
        { username: "ActualUser", profileID: "profile-user" },
        { username: "PrivateOpponent", profileID: "profile-enemy" },
      ],
      matchFeedback: [
        { username: "ActualUser", target: "PrivateOpponent" },
        { username: "UnknownFixtureName", target: null },
      ],
    },
  };
}

describe("secure replay input validation", () => {
  it("accepts only replay and ZIP identities", () => {
    expect(
      validateReplayUploadIdentity("round.rec", "application/octet-stream"),
    ).toBe(".rec");
    expect(validateReplayUploadIdentity("match.zip", "application/zip")).toBe(
      ".zip",
    );
    expect(() =>
      validateReplayUploadIdentity("video.mp4", "video/mp4"),
    ).toThrow(/Match Replay/);
  });

  it("rejects archive traversal, links, and extreme compression", () => {
    expect(() =>
      validateReplayZipEntry({
        fileName: "../secret.rec",
        compressedSize: 10,
        uncompressedSize: 10,
      }),
    ).toThrow(/unsafe/i);
    expect(() =>
      validateReplayZipEntry({
        fileName: "link.rec",
        compressedSize: 10,
        uncompressedSize: 10,
        externalFileAttributes: 0o120777 << 16,
      }),
    ).toThrow(/symbolic link/i);
    expect(() =>
      validateReplayZipEntry({
        fileName: "round.rec",
        compressedSize: 1,
        uncompressedSize: 1_000,
      }),
    ).toThrow(/large compressed/i);
  });

  it("creates an order-independent package fingerprint", () => {
    expect(buildReplayPackageFingerprint(["a", "b"])).toBe(
      buildReplayPackageFingerprint(["b", "a"]),
    );
  });
});

describe("privacy-safe canonical replay foundation", () => {
  it("aliases recording player, teammate, and opponent by default", () => {
    const players = buildPrivacySafePlayers({
      rounds: [parsedRound()],
      packageFingerprint: "package",
      privacyMode: "ALIASES",
    });
    expect(players.map((player) => player.privacyAlias)).toEqual([
      "User",
      "Teammate 1",
      "Opponent 1",
    ]);
    expect(players.every((player) => player.localDisplayName === null)).toBe(
      true,
    );
    expect(players.every((player) => player.profileHash?.length === 64)).toBe(
      true,
    );
  });

  it("removes profile IDs and aliases names in retained provider JSON", () => {
    const round = parsedRound();
    const players = buildPrivacySafePlayers({
      rounds: [round],
      packageFingerprint: "package",
      privacyMode: "ALIASES",
    });
    const sanitized = JSON.stringify(
      sanitizeProviderOutput(round.rawOutput, players, "ALIASES"),
    );
    expect(sanitized).not.toContain("ActualUser");
    expect(sanitized).not.toContain("PrivateOpponent");
    expect(sanitized).not.toContain("profile-user");
    expect(sanitized).not.toContain("UnknownFixtureName");
    expect(sanitized).toContain("User");
    expect(sanitized).toContain("Opponent 1");
  });

  it("removes raw identities from every retained normalized round field", () => {
    const round = parsedRound();
    const players = buildPrivacySafePlayers({
      rounds: [round],
      packageFingerprint: "package",
      privacyMode: "ALIASES",
    });
    const retained = JSON.stringify(
      sanitizeParsedReplayRounds({
        rounds: [round],
        players,
        privacyMode: "ALIASES",
      }),
    );
    for (const identity of [
      "ActualUser",
      "PrivateTeammate",
      "PrivateOpponent",
      "profile-user",
      "profile-team",
      "profile-enemy",
    ]) {
      expect(retained).not.toContain(identity);
    }
    expect(retained).toContain("User");
    expect(retained).toContain("Teammate 1");
    expect(retained).toContain("Opponent 1");
  });
});

describe("reviewed replay provider normalization", () => {
  it("schema validates stable fields without inventing rich telemetry", () => {
    const parsed = r6DissectOutputSchema.parse({
      gameVersion: "Y9S1",
      map: { name: "Chalet" },
      gamemode: { name: "Bomb" },
      roundNumber: 0,
      recordingPlayerID: 7,
      players: [
        {
          id: 7,
          profileID: "profile",
          username: "Recorder",
          teamIndex: 0,
          operator: { name: "Ash" },
        },
      ],
      matchFeedback: [
        {
          type: { name: "Kill" },
          username: "Recorder",
          target: "Opponent",
          headshot: true,
          time: "2:14",
          timeInSeconds: 134,
        },
      ],
    });
    const normalized = normalizeR6DissectOutput(parsed, "round-stable");
    expect(normalized).toMatchObject({
      sourceFileStableId: "round-stable",
      gameVersion: "Y9S1",
      mapName: "Chalet",
      gameMode: "Bomb",
      roundNumber: 1,
    });
    expect(normalized.players[0]).toMatchObject({
      isRecordingPlayer: true,
      operatorName: "Ash",
    });
    expect(normalized.feedback[0]).toMatchObject({
      type: "Kill",
      headshot: true,
      timeInSeconds: 134,
    });
    expect(normalized).not.toHaveProperty("positions");
  });

  it("reports populated, empty, partial, and unsupported capabilities", () => {
    const capabilities = evaluateReplayCapabilities([parsedRound()]);
    expect(capabilities.KILLS).toMatchObject({
      state: "AVAILABLE_VERIFIED",
      populatedCount: 1,
    });
    expect(capabilities.DEATHS.state).toBe("AVAILABLE_UNVERIFIED");
    expect(capabilities.POSITIONS.state).toBe("UNSUPPORTED_PROVIDER");
    expect(capabilities.ORIGINAL_AUDIO.state).toBe("EMPTY_IN_REPLAY");
    expect(capabilities.MATCH_METADATA.state).toBe("AVAILABLE_VERIFIED");
  });
});
