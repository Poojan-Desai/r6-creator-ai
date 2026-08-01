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

describe("U5 Voiceover Studio additive migration", () => {
  it("preserves U4 outputs while adding facts, scripts, and takes", async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "r6-u5-voiceover-migration-"),
    );
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const voiceoverMigration = "20260801173100_voiceover_studio_foundation";
    const migrationIndex = migrations.indexOf(voiceoverMigration);
    expect(migrationIndex).toBeGreaterThan(0);
    for (const migration of migrations.slice(0, migrationIndex)) {
      applyMigration(databasePath, migration);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        PRAGMA foreign_keys = ON;
        INSERT INTO StudioProject (id, name, outputGoal, inputMode, referenceMode, focusAreasJson, updatedAt)
        VALUES ('studio', 'Preserved project', 'LONG_FORM_YOUTUBE', 'SCREEN_RECORDING_ONLY', 'NONE', '[]', CURRENT_TIMESTAMP);
        INSERT INTO LongFormProduction (id, studioProjectId, currentVersion, updatedAt)
        VALUES ('long-production', 'studio', 1, CURRENT_TIMESTAMP);
        INSERT INTO LongFormProductionRevision (
          id, productionId, version, reason, plannerVersion, settingsJson, planJson
        )
        VALUES ('long-plan', 'long-production', 1, 'Plan', 'u4-long-form-planner-v1', '{}', '{}');
      `,
    });
    applyMigration(databasePath, voiceoverMigration);

    const client = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
    const production = await client.voiceoverProduction.create({
      data: {
        id: "voiceover",
        studioProjectId: "studio",
        facts: {
          create: {
            category: "UNKNOWN",
            summary: "Outcome unknown",
          },
        },
        scriptRevisions: {
          create: {
            version: 1,
            reason: "Initial",
            providerId: "local-template",
            providerVersion: "u5-local-voiceover-v1",
            packageJson: "{}",
            factsSnapshotJson: "[]",
          },
        },
        currentScriptVersion: 1,
      },
      include: { facts: true, scriptRevisions: true },
    });
    await client.studioMediaAsset.create({
      data: {
        id: "voiceover-source",
        studioProjectId: "studio",
        kind: "VOICEOVER",
        name: "Opening take",
        originalFilename: "opening.webm",
        mimeType: "audio/webm",
        relativePath: "studio-media/studio/opening.webm",
        fileSizeBytes: 1_024,
        durationSeconds: 12.5,
        permissionConfirmed: true,
      },
    });
    await client.voiceoverTake.create({
      data: {
        id: "take-one",
        productionId: production.id,
        sourceAssetId: "voiceover-source",
        name: "Opening take",
        scriptSectionKey: "opening-teaser",
        trimEndSeconds: 12.5,
        alignmentStartSeconds: 1.25,
        isActive: true,
      },
    });
    const preserved = await client.longFormProduction.findUnique({
      where: { id: "long-production" },
      include: { revisions: true },
    });
    await client.$disconnect();

    const reopened = new PrismaClient({
      datasourceUrl: `file:${databasePath}`,
    });
    const persistedTake = await reopened.voiceoverTake.findUnique({
      where: { id: "take-one" },
      include: { sourceAsset: true },
    });
    await reopened.$disconnect();

    expect(production.facts[0]?.summary).toBe("Outcome unknown");
    expect(production.scriptRevisions).toHaveLength(1);
    expect(persistedTake).toMatchObject({
      name: "Opening take",
      scriptSectionKey: "opening-teaser",
      isActive: true,
      alignmentStartSeconds: 1.25,
      sourceAsset: {
        mimeType: "audio/webm",
        permissionConfirmed: true,
      },
    });
    expect(preserved?.revisions[0]?.plannerVersion).toBe(
      "u4-long-form-planner-v1",
    );
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
