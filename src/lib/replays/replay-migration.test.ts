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

describe("replay-first additive migration", () => {
  it("preserves existing project data and persists canonical replay evidence", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "r6-replay-migration-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const replayMigration = "20260730213000_replay_first_foundation";
    for (const migration of migrations.filter(
      (name) => name !== replayMigration,
    )) {
      applyMigration(databasePath, migration);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        INSERT INTO Project (id, name, originalFilename, sourceRelativePath, mimeType, fileSizeBytes, durationSeconds, width, height, frameRate, updatedAt)
        VALUES ('stable-project', 'Preserved video project', 'source.mp4', 'uploads/stable/source.mp4', 'video/mp4', 1000, 60, 1920, 1080, 60, CURRENT_TIMESTAMP);
        INSERT INTO ContentDraft (id, projectId, openingHook, updatedAt)
        VALUES ('stable-content', 'stable-project', 'Keep existing writing', CURRENT_TIMESTAMP);
      `,
    });
    applyMigration(databasePath, replayMigration);

    const client = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
    const replay = await client.replayPackage.create({
      data: {
        id: "replay",
        projectId: "stable-project",
        displayName: "Fixture replay",
        status: "PARSED",
        permissionConfirmed: true,
        permissionConfirmedAt: new Date(),
        privacyMode: "ALIASES",
        retentionPreference: "KEEP_EVERYTHING",
        sourceKind: "REC_FILES",
        fileCount: 1,
        roundFileCount: 1,
        totalSizeBytes: 100,
        packageFingerprintSha256: "package-fingerprint",
        files: {
          create: {
            id: "replay-file",
            stableFileId: "round-1",
            safeDisplayName: "Round 1.rec",
            relativePath: "replays/replay/rounds/round-001.rec",
            fileSizeBytes: 100,
            fingerprintSha256: "round-fingerprint",
            roundIndex: 1,
          },
        },
        providerRuns: {
          create: {
            id: "provider-run",
            providerId: "redraskal.r6-dissect",
            providerVersion: "fixture",
            providerCommit: "fixture-commit",
            status: "COMPLETED",
            progress: 100,
            stage: "Complete",
          },
        },
        canonicalMatch: {
          create: {
            id: "match",
            stableId: "canonical-match",
            videoProjectId: "stable-project",
            mapName: "Chalet",
            gameMode: "Bomb",
            sourceProviderId: "redraskal.r6-dissect",
            sourceProviderVersion: "fixture",
            confidenceStatus: "HIGH",
            validationStatus: "VALIDATED",
            rounds: {
              create: {
                id: "round",
                stableId: "canonical-round",
                roundIndex: 1,
                sourceProviderId: "redraskal.r6-dissect",
                sourceProviderVersion: "fixture",
              },
            },
          },
        },
      },
      include: { files: true, providerRuns: true, canonicalMatch: true },
    });
    const project = await client.project.findUnique({
      where: { id: "stable-project" },
      include: {
        contentDraft: true,
        replayPackages: true,
        canonicalMatches: true,
      },
    });
    expect(project?.contentDraft?.openingHook).toBe("Keep existing writing");
    expect(project?.replayPackages).toHaveLength(1);
    expect(project?.canonicalMatches).toHaveLength(1);
    expect(replay.files).toHaveLength(1);
    expect(replay.providerRuns[0]?.status).toBe("COMPLETED");
    await client.$disconnect();
  });
});
