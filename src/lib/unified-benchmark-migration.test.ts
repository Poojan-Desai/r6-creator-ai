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

describe("U8 unified review benchmark migration", () => {
  it("preserves U7 profiles and snapshots while adding review labels", async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "r6-u8-review-migration-"),
    );
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const reviewMigration = "20260801204300_unified_review_benchmark";
    const migrationIndex = migrations.indexOf(reviewMigration);
    expect(migrationIndex).toBeGreaterThan(0);
    for (const migration of migrations.slice(0, migrationIndex)) {
      applyMigration(databasePath, migration);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        PRAGMA foreign_keys = ON;
        INSERT INTO StudioProject (
          id, name, outputGoal, inputMode, referenceMode, focusAreasJson,
          updatedAt
        ) VALUES (
          'studio', 'Preserved U7 project', 'CONTENT_AND_COACHING',
          'SCREEN_RECORDING_AND_REPLAY', 'NONE', '[]', CURRENT_TIMESTAMP
        );
        INSERT INTO PlayerProfile (
          id, name, preferredAlias, selectedPlayerStableIds, updatedAt
        ) VALUES (
          'profile', 'Preserved local player', 'User', '[]', CURRENT_TIMESTAMP
        );
        INSERT INTO PlayerProgressSnapshot (
          id, playerProfileId, version, reason, filterJson, metricVersion
        ) VALUES (
          'snapshot', 'profile', 1, 'Preserved U7 snapshot', '{}',
          'u7-transparent-progress-v1'
        );
      `,
    });
    applyMigration(databasePath, reviewMigration);

    const client = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
    await client.unifiedReviewLabel.create({
      data: {
        id: "review",
        studioProjectId: "studio",
        area: "COACHING",
        category: "USEFUL_RECOMMENDATION",
        approvedAsBenchmark: true,
        note: "Explicitly reviewed.",
      },
    });
    const [profile, snapshot, review] = await Promise.all([
      client.playerProfile.findUnique({ where: { id: "profile" } }),
      client.playerProgressSnapshot.findUnique({
        where: { id: "snapshot" },
      }),
      client.unifiedReviewLabel.findUnique({ where: { id: "review" } }),
    ]);
    await client.$disconnect();

    expect(profile?.name).toBe("Preserved local player");
    expect(snapshot?.reason).toBe("Preserved U7 snapshot");
    expect(review).toMatchObject({
      area: "COACHING",
      category: "USEFUL_RECOMMENDATION",
      approvedAsBenchmark: true,
    });
    expect(
      execFileSync("sqlite3", [databasePath, "PRAGMA integrity_check;"], {
        encoding: "utf8",
      }).trim(),
    ).toBe("ok");
    expect(
      execFileSync("sqlite3", [databasePath, "PRAGMA foreign_key_check;"], {
        encoding: "utf8",
      }).trim(),
    ).toBe("");
  });
});
