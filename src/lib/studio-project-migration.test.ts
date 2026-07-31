import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

function applyMigration(databasePath: string, migrationName: string) {
  execFileSync("sqlite3", [databasePath], {
    input: readFileSync(
      path.join(
        process.cwd(),
        "prisma",
        "migrations",
        migrationName,
        "migration.sql",
      ),
    ),
  });
}

describe("U1 unified-project additive migration", () => {
  it("preserves legacy rows and reopens linked recording and replay inputs", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "r6-studio-migration-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const studioMigration = "20260731075246_unified_project_foundation";
    const studioMigrationIndex = migrations.indexOf(studioMigration);
    expect(studioMigrationIndex).toBeGreaterThan(0);

    for (const migration of migrations.slice(0, studioMigrationIndex)) {
      applyMigration(databasePath, migration);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        INSERT INTO Project (id, name, originalFilename, sourceRelativePath, mimeType, fileSizeBytes, durationSeconds, width, height, frameRate, updatedAt)
        VALUES ('legacy-video', 'Preserved video', 'source.mp4', 'uploads/legacy-video/source.mp4', 'video/mp4', 1000, 60, 1920, 1080, 60, CURRENT_TIMESTAMP);
        INSERT INTO ContentDraft (id, projectId, openingHook, updatedAt)
        VALUES ('legacy-content', 'legacy-video', 'Keep this writing', CURRENT_TIMESTAMP);
        INSERT INTO AudioTrack (id, projectId, streamIndex, codecName, channels, title, analysisRole, updatedAt)
        VALUES ('creator-track', 'legacy-video', 1, 'aac', 1, 'Creator microphone', 'CREATOR_MICROPHONE', CURRENT_TIMESTAMP);
        INSERT INTO ReplayPackage (id, displayName, status, permissionConfirmed, permissionConfirmedAt, privacyMode, retentionPreference, sourceKind, packageFingerprintSha256, updatedAt)
        VALUES ('legacy-replay', 'Preserved replay', 'PARSED', 1, CURRENT_TIMESTAMP, 'ALIASES', 'KEEP_EVERYTHING', 'REC_FILES', 'legacy-package-fingerprint', CURRENT_TIMESTAMP);
        INSERT INTO CanonicalMatch (id, stableId, replayPackageId, mapName, gameMode, sourceProviderId, sourceProviderVersion, confidenceStatus, validationStatus, updatedAt)
        VALUES ('legacy-match', 'legacy-match-stable', 'legacy-replay', 'Lair', 'Bomb', 'fixture', 'fixture-v1', 'HIGH', 'VALIDATED', CURRENT_TIMESTAMP);
        INSERT INTO CanonicalPlayer (id, stableId, matchId, replayLocalPlayerId, privacyAlias, isRecordingPlayer, sourceProviderId, sourceProviderVersion, confidenceStatus, validationStatus, updatedAt)
        VALUES ('legacy-player', 'legacy-player-stable', 'legacy-match', 'local-player', 'Player 01', 1, 'fixture', 'fixture-v1', 'HIGH', 'VALIDATED', CURRENT_TIMESTAMP);
      `,
    });

    applyMigration(databasePath, studioMigration);
    const client = new PrismaClient({
      datasourceUrl: `file:${databasePath}`,
    });
    const studio = await client.studioProject.create({
      data: {
        id: "unified-project",
        name: "Combined creator project",
        status: "READY",
        outputGoal: "CONTENT_AND_COACHING",
        inputMode: "SCREEN_RECORDING_AND_REPLAY",
        referenceMode: "NONE",
        focusAreasJson: JSON.stringify(["Objective play"]),
        selectedAudioTrackId: "creator-track",
        selectedPlayerStableId: "legacy-player-stable",
        selectedPlayerAlias: "Player 01",
        inputs: {
          create: [
            {
              kind: "PRIMARY_RECORDING",
              videoProjectId: "legacy-video",
            },
            {
              kind: "MATCH_REPLAY",
              replayPackageId: "legacy-replay",
            },
          ],
        },
      },
      include: {
        inputs: {
          include: { videoProject: true, replayPackage: true },
        },
        selectedAudioTrack: true,
      },
    });
    await client.$disconnect();

    const reopened = new PrismaClient({
      datasourceUrl: `file:${databasePath}`,
    });
    const [project, unified] = await Promise.all([
      reopened.project.findUnique({
        where: { id: "legacy-video" },
        include: { contentDraft: true },
      }),
      reopened.studioProject.findUnique({
        where: { id: studio.id },
        include: {
          inputs: {
            include: { videoProject: true, replayPackage: true },
          },
          selectedAudioTrack: true,
        },
      }),
    ]);
    expect(project?.contentDraft?.openingHook).toBe("Keep this writing");
    expect(unified?.selectedAudioTrack?.analysisRole).toBe(
      "CREATOR_MICROPHONE",
    );
    expect(unified?.selectedPlayerAlias).toBe("Player 01");
    expect(
      unified?.inputs.find((input) => input.kind === "PRIMARY_RECORDING")
        ?.videoProject?.name,
    ).toBe("Preserved video");
    expect(
      unified?.inputs.find((input) => input.kind === "MATCH_REPLAY")
        ?.replayPackage?.displayName,
    ).toBe("Preserved replay");
    await reopened.$disconnect();
  });
});
