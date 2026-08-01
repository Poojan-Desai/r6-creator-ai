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

describe("U4 long-form timeline additive migration", () => {
  it("preserves the saved long-form plan while adding timeline revisions", async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "r6-u4-timeline-migration-"),
    );
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const timelineMigration = "20260801073500_long_form_timeline";
    const migrationIndex = migrations.indexOf(timelineMigration);
    expect(migrationIndex).toBeGreaterThan(0);
    for (const migration of migrations.slice(0, migrationIndex)) {
      applyMigration(databasePath, migration);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        PRAGMA foreign_keys = ON;
        INSERT INTO StudioProject (id, name, outputGoal, inputMode, referenceMode, focusAreasJson, updatedAt)
        VALUES ('studio', 'Preserved planner', 'LONG_FORM_YOUTUBE', 'SCREEN_RECORDING_ONLY', 'NONE', '[]', CURRENT_TIMESTAMP);
        INSERT INTO LongFormProduction (id, studioProjectId, currentVersion, updatedAt)
        VALUES ('production', 'studio', 1, CURRENT_TIMESTAMP);
        INSERT INTO LongFormProductionRevision (
          id, productionId, version, reason, plannerVersion, settingsJson, planJson
        )
        VALUES (
          'plan', 'production', 1, 'Initial local plan',
          'u4-long-form-planner-v1', '{}', '{}'
        );
      `,
    });
    applyMigration(databasePath, timelineMigration);

    const client = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
    await client.longFormTimeline.create({
      data: {
        id: "timeline",
        productionId: "production",
        currentVersion: 1,
        revisions: {
          create: {
            id: "timeline-revision",
            version: 1,
            reason: "Initial timeline",
            documentJson: '{"version":"u4-long-form-timeline-v1"}',
          },
        },
      },
    });
    const preserved = await client.longFormProduction.findUnique({
      where: { id: "production" },
      include: { revisions: true, timeline: { include: { revisions: true } } },
    });
    await client.$disconnect();

    expect(preserved?.revisions[0]?.plannerVersion).toBe(
      "u4-long-form-planner-v1",
    );
    expect(preserved?.timeline?.revisions).toHaveLength(1);
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
