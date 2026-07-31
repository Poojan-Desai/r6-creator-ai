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

describe("U2 replay/video synchronization migration", () => {
  it("preserves U1 sources and reopens versioned anchors after restart", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "r6-sync-migration-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const synchronizationMigration =
      "20260731083310_replay_video_synchronization";
    const synchronizationMigrationIndex = migrations.indexOf(
      synchronizationMigration,
    );
    expect(synchronizationMigrationIndex).toBeGreaterThan(0);

    for (const migration of migrations.slice(
      0,
      synchronizationMigrationIndex,
    )) {
      applyMigration(databasePath, migration);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        INSERT INTO Project (id, name, originalFilename, sourceRelativePath, mimeType, fileSizeBytes, durationSeconds, width, height, frameRate, updatedAt)
        VALUES ('video', 'Preserved video', 'source.mp4', 'uploads/video/source.mp4', 'video/mp4', 1000, 600, 1920, 1080, 60, CURRENT_TIMESTAMP);
        INSERT INTO ReplayPackage (id, displayName, status, permissionConfirmed, permissionConfirmedAt, privacyMode, retentionPreference, sourceKind, packageFingerprintSha256, updatedAt)
        VALUES ('replay', 'Preserved replay', 'PARSED', 1, CURRENT_TIMESTAMP, 'ALIASES', 'KEEP_EVERYTHING', 'REC_FILES', 'sync-package-fingerprint', CURRENT_TIMESTAMP);
        INSERT INTO CanonicalMatch (id, stableId, replayPackageId, sourceProviderId, sourceProviderVersion, confidenceStatus, validationStatus, updatedAt)
        VALUES ('match', 'match-stable', 'replay', 'fixture', 'fixture-v1', 'HIGH', 'VALIDATED', CURRENT_TIMESTAMP);
        INSERT INTO StudioProject (id, name, outputGoal, inputMode, referenceMode, focusAreasJson, updatedAt)
        VALUES ('studio', 'Combined project', 'CONTENT_AND_COACHING', 'SCREEN_RECORDING_AND_REPLAY', 'NONE', '[]', CURRENT_TIMESTAMP);
        INSERT INTO StudioProjectInput (id, studioProjectId, kind, videoProjectId, sortOrder, updatedAt)
        VALUES ('video-input', 'studio', 'PRIMARY_RECORDING', 'video', 0, CURRENT_TIMESTAMP);
        INSERT INTO StudioProjectInput (id, studioProjectId, kind, replayPackageId, sortOrder, updatedAt)
        VALUES ('replay-input', 'studio', 'MATCH_REPLAY', 'replay', 0, CURRENT_TIMESTAMP);
      `,
    });
    applyMigration(databasePath, synchronizationMigration);

    const client = new PrismaClient({
      datasourceUrl: `file:${databasePath}`,
    });
    await client.replayVideoSynchronization.create({
      data: {
        id: "sync-v1",
        studioProjectId: "studio",
        version: 1,
        offsetSeconds: 30,
        confidence: 0.8,
        confidenceLabel: "High",
        anchors: {
          create: [
            {
              id: "anchor-one",
              kind: "ROUND_START",
              label: "Round one begins",
              videoTimestampSeconds: 40,
              replayTimestampSeconds: 10,
              videoObservationJson: JSON.stringify({
                text: "Visible round transition",
              }),
              replayFactJson: JSON.stringify({
                category: "ROUND_START",
              }),
              alignmentInferenceJson: JSON.stringify({
                text: "Likely corresponding points",
              }),
              confidence: 0.9,
              userConfirmed: true,
            },
          ],
        },
      },
    });
    await client.$disconnect();

    const reopened = new PrismaClient({
      datasourceUrl: `file:${databasePath}`,
    });
    const [project, synchronization] = await Promise.all([
      reopened.studioProject.findUnique({
        where: { id: "studio" },
        include: { inputs: true },
      }),
      reopened.replayVideoSynchronization.findUnique({
        where: { id: "sync-v1" },
        include: { anchors: true },
      }),
    ]);
    expect(project?.inputs).toHaveLength(2);
    expect(synchronization?.version).toBe(1);
    expect(synchronization?.anchors[0]?.videoTimestampSeconds).toBe(40);
    expect(
      JSON.parse(synchronization?.anchors[0]?.videoObservationJson ?? "{}"),
    ).toEqual({ text: "Visible round transition" });
    await reopened.$disconnect();
  });
});
