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

describe("U4 long-form planner additive migration", () => {
  it("preserves the existing studio and short-form records", async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "r6-u4-planner-migration-"),
    );
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const longFormMigration = "20260801071000_long_form_planner_foundation";
    const migrationIndex = migrations.indexOf(longFormMigration);
    expect(migrationIndex).toBeGreaterThan(0);
    for (const migration of migrations.slice(0, migrationIndex)) {
      applyMigration(databasePath, migration);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        PRAGMA foreign_keys = ON;
        INSERT INTO StudioProject (id, name, outputGoal, inputMode, referenceMode, focusAreasJson, updatedAt)
        VALUES ('studio', 'Preserved U3 project', 'LONG_FORM_YOUTUBE', 'SCREEN_RECORDING_ONLY', 'NONE', '[]', CURRENT_TIMESTAMP);
        INSERT INTO ShortFormProduction (id, studioProjectId, currentVersion, updatedAt)
        VALUES ('short-production', 'studio', 1, CURRENT_TIMESTAMP);
        INSERT INTO ShortFormProductionRevision (
          id, productionId, version, reason, providerId, configurationJson,
          storyPlanJson, writingPackageJson
        )
        VALUES (
          'short-revision', 'short-production', 1, 'Preserved', 'local-template',
          '{}', '{}', '{}'
        );
      `,
    });
    applyMigration(databasePath, longFormMigration);

    const client = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
    const longForm = await client.longFormProduction.create({
      data: {
        id: "long-production",
        studioProjectId: "studio",
        targetDurationSeconds: 1_200,
        currentVersion: 1,
        revisions: {
          create: {
            id: "long-revision",
            version: 1,
            reason: "Initial local plan",
            plannerVersion: "u4-long-form-planner-v1",
            settingsJson: '{"targetDurationSeconds":1200}',
            planJson: '{"version":"u4-long-form-planner-v1"}',
          },
        },
      },
      include: { revisions: true },
    });
    const preserved = await client.studioProject.findUnique({
      where: { id: "studio" },
      include: {
        shortFormProduction: { include: { revisions: true } },
        longFormProduction: { include: { revisions: true } },
      },
    });
    await client.$disconnect();

    expect(longForm.revisions[0]?.plannerVersion).toBe(
      "u4-long-form-planner-v1",
    );
    expect(preserved?.shortFormProduction?.revisions).toHaveLength(1);
    expect(preserved?.longFormProduction?.targetDurationSeconds).toBe(1_200);
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
