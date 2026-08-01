import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

import { createDefaultTimelineDocument } from "@/lib/timeline-document";

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

describe("U3 non-destructive timeline additive migration", () => {
  it("preserves the writing production and reopens timeline revisions", async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "r6-u3-editor-migration-"),
    );
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const timelineMigration = "20260801061000_short_form_timeline_foundation";
    const migrationIndex = migrations.indexOf(timelineMigration);
    expect(migrationIndex).toBeGreaterThan(0);
    for (const migration of migrations.slice(0, migrationIndex)) {
      applyMigration(databasePath, migration);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        INSERT INTO StudioProject (id, name, outputGoal, inputMode, referenceMode, focusAreasJson, updatedAt)
        VALUES ('studio', 'Preserved editor project', 'YOUTUBE_SHORT', 'SCREEN_RECORDING_ONLY', 'NONE', '[]', CURRENT_TIMESTAMP);
        INSERT INTO ShortFormProduction (id, studioProjectId, currentVersion, updatedAt)
        VALUES ('production', 'studio', 1, CURRENT_TIMESTAMP);
        INSERT INTO ShortFormProductionRevision (id, productionId, version, reason, providerId, storyPlanJson, writingPackageJson)
        VALUES ('writing', 'production', 1, 'Initial writing', 'local-template-v1', '{"premise":"Preserve"}', '{"hooks":["One","Two","Three"]}');
      `,
    });
    applyMigration(databasePath, timelineMigration);

    const document = createDefaultTimelineDocument({
      sourceProjectId: "video",
      sourceStartSeconds: 12,
      sourceEndSeconds: 24,
      aspectRatio: "VERTICAL_9_16",
      targetDurationSeconds: 30,
    });
    const client = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
    await client.shortFormTimeline.create({
      data: {
        id: "timeline",
        productionId: "production",
        currentVersion: 1,
        revisions: {
          create: {
            id: "timeline-v1",
            version: 1,
            reason: "Initial edit",
            documentJson: JSON.stringify(document),
          },
        },
      },
    });
    await client.$disconnect();

    const reopened = new PrismaClient({
      datasourceUrl: `file:${databasePath}`,
    });
    const production = await reopened.shortFormProduction.findUnique({
      where: { id: "production" },
      include: {
        revisions: true,
        timeline: { include: { revisions: true } },
      },
    });
    expect(production?.revisions[0]?.providerId).toBe("local-template-v1");
    expect(production?.timeline?.revisions).toHaveLength(1);
    expect(
      JSON.parse(production?.timeline?.revisions[0]?.documentJson ?? "{}")
        .currentDurationSeconds,
    ).toBe(12);
    await reopened.$disconnect();
  });
});
