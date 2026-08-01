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

describe("U3 deterministic export additive migration", () => {
  it("preserves the timeline and proxy while adding export history", async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "r6-u3-export-migration-"),
    );
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const exportMigration = "20260801065000_short_form_export_jobs";
    const migrationIndex = migrations.indexOf(exportMigration);
    expect(migrationIndex).toBeGreaterThan(0);
    for (const migration of migrations.slice(0, migrationIndex)) {
      applyMigration(databasePath, migration);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        PRAGMA foreign_keys = ON;
        INSERT INTO StudioProject (id, name, outputGoal, inputMode, referenceMode, focusAreasJson, updatedAt)
        VALUES ('studio', 'Preserved export project', 'YOUTUBE_SHORT', 'SCREEN_RECORDING_ONLY', 'NONE', '[]', CURRENT_TIMESTAMP);
        INSERT INTO ShortFormProduction (id, studioProjectId, currentVersion, updatedAt)
        VALUES ('production', 'studio', 1, CURRENT_TIMESTAMP);
        INSERT INTO ShortFormTimeline (id, productionId, currentVersion, updatedAt)
        VALUES ('timeline', 'production', 1, CURRENT_TIMESTAMP);
        INSERT INTO ShortFormTimelineRevision (id, timelineId, version, reason, documentJson)
        VALUES ('revision', 'timeline', 1, 'Preserved edit', '{"version":"u3-short-form-timeline-v1"}');
        INSERT INTO ShortFormProxyJob (id, timelineId, timelineRevisionId, status, pipelineVersion, updatedAt)
        VALUES ('proxy', 'timeline', 'revision', 'COMPLETED', 'u3-proxy-ffmpeg-v1', CURRENT_TIMESTAMP);
      `,
    });
    applyMigration(databasePath, exportMigration);

    const client = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
    await client.shortFormExportJob.create({
      data: {
        id: "export",
        timelineId: "timeline",
        timelineRevisionId: "revision",
        status: "COMPLETED",
        pipelineVersion: "u3-export-ffmpeg-v1",
        outputFilename: "verified-short.mp4",
        relativePath: "short-form-exports/timeline/export.mp4",
        width: 1080,
        height: 1920,
        durationSeconds: 15,
      },
    });
    await client.$disconnect();

    const reopened = new PrismaClient({
      datasourceUrl: `file:${databasePath}`,
    });
    const timeline = await reopened.shortFormTimeline.findUnique({
      where: { id: "timeline" },
      include: { revisions: true, proxyJobs: true, exportJobs: true },
    });
    expect(timeline?.revisions).toHaveLength(1);
    expect(timeline?.proxyJobs[0]?.pipelineVersion).toBe("u3-proxy-ffmpeg-v1");
    expect(timeline?.exportJobs[0]).toMatchObject({
      outputFilename: "verified-short.mp4",
      width: 1080,
      height: 1920,
    });
    await reopened.$disconnect();
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
