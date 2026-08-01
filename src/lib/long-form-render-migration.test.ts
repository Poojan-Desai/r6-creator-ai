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

describe("U4 segmented render additive migration", () => {
  it("preserves planner and timeline history while adding render jobs", async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "r6-u4-render-migration-"),
    );
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const renderMigration = "20260801075500_long_form_render_jobs";
    const migrationIndex = migrations.indexOf(renderMigration);
    expect(migrationIndex).toBeGreaterThan(0);
    for (const migration of migrations.slice(0, migrationIndex)) {
      applyMigration(databasePath, migration);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        PRAGMA foreign_keys = ON;
        INSERT INTO StudioProject (id, name, outputGoal, inputMode, referenceMode, focusAreasJson, updatedAt)
        VALUES ('studio', 'Preserved long edit', 'LONG_FORM_YOUTUBE', 'SCREEN_RECORDING_ONLY', 'NONE', '[]', CURRENT_TIMESTAMP);
        INSERT INTO LongFormProduction (id, studioProjectId, currentVersion, updatedAt)
        VALUES ('production', 'studio', 1, CURRENT_TIMESTAMP);
        INSERT INTO LongFormProductionRevision (
          id, productionId, version, reason, plannerVersion, settingsJson, planJson
        )
        VALUES ('plan', 'production', 1, 'Plan', 'u4-long-form-planner-v1', '{}', '{}');
        INSERT INTO LongFormTimeline (id, productionId, currentVersion, updatedAt)
        VALUES ('timeline', 'production', 1, CURRENT_TIMESTAMP);
        INSERT INTO LongFormTimelineRevision (id, timelineId, version, reason, documentJson)
        VALUES ('revision', 'timeline', 1, 'Edit', '{"version":"u4-long-form-timeline-v1"}');
      `,
    });
    applyMigration(databasePath, renderMigration);

    const client = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
    await client.longFormRenderJob.create({
      data: {
        id: "render",
        timelineId: "timeline",
        timelineRevisionId: "revision",
        kind: "EXPORT",
        status: "COMPLETED",
        pipelineVersion: "u4-segmented-ffmpeg-v1",
        outputFilename: "verified-long-form.mp4",
        width: 1920,
        height: 1080,
        durationSeconds: 1_200,
        segmentCount: 10,
      },
    });
    const timeline = await client.longFormTimeline.findUnique({
      where: { id: "timeline" },
      include: {
        revisions: true,
        renderJobs: true,
        production: { include: { revisions: true } },
      },
    });
    await client.$disconnect();

    expect(timeline?.revisions).toHaveLength(1);
    expect(timeline?.production.revisions[0]?.plannerVersion).toBe(
      "u4-long-form-planner-v1",
    );
    expect(timeline?.renderJobs[0]).toMatchObject({
      kind: "EXPORT",
      width: 1920,
      height: 1080,
      segmentCount: 10,
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
