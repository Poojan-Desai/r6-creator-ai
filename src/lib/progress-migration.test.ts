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

describe("U7 player-progress additive migration", () => {
  it("preserves U6 findings and reports while adding immutable progress snapshots", async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "r6-u7-progress-migration-"),
    );
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const progressMigration = "20260801195438_player_progress_foundation";
    const migrationIndex = migrations.indexOf(progressMigration);
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
          'studio', 'Preserved combined project', 'CONTENT_AND_COACHING',
          'SCREEN_RECORDING_AND_REPLAY', 'NONE', '[]', CURRENT_TIMESTAMP
        );
        INSERT INTO CoachingAnalysis (
          id, studioProjectId, inputMode, status, progress, stage,
          analysisVersion, ruleSetVersion, updatedAt
        ) VALUES (
          'analysis', 'studio', 'SCREEN_RECORDING_AND_REPLAY', 'COMPLETED',
          100, 'Complete', 'u6-analysis-v1', 'u6-rules-v1',
          CURRENT_TIMESTAMP
        );
        INSERT INTO CoachingFinding (
          id, studioProjectId, analysisId, originalCategory, category,
          originalSeverity, severity, confidence, explanation, analysisVersion,
          updatedAt
        ) VALUES (
          'finding', 'studio', 'analysis', 'REVIEW_RECOMMENDED',
          'REVIEW_RECOMMENDED', 'LOW', 'LOW', 0.7,
          'Review this bounded observation.', 'u6-analysis-v1',
          CURRENT_TIMESTAMP
        );
        INSERT INTO CoachingReport (
          id, studioProjectId, version, reason, reportVersion, reportJson,
          findingSnapshotJson, sourceSnapshotJson
        ) VALUES (
          'report', 'studio', 1, 'Preserved report', 'u6-report-v1',
          '{}', '[]', '{}'
        );
      `,
    });
    applyMigration(databasePath, progressMigration);

    const client = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
    const profile = await client.playerProfile.create({
      data: { id: "profile", name: "My progress", preferredAlias: "User" },
    });
    await client.playerProgressSnapshot.create({
      data: {
        id: "snapshot",
        playerProfileId: profile.id,
        version: 1,
        reason: "First bounded snapshot",
        metricVersion: "u7-transparent-progress-v1",
        projectLinks: {
          create: {
            studioProjectId: "studio",
            selectedPlayerAlias: "User",
          },
        },
        metrics: {
          create: {
            key: "accepted_findings",
            label: "Accepted findings",
            metricGroup: "COACHING_REVIEW",
            value: 0,
            unit: "findings",
            sampleSize: 1,
            availability: "AVAILABLE",
            explanation: "Explicit review decisions only.",
            evidenceClass: "USER_CONFIRMED_CONTEXT",
          },
        },
      },
    });
    const preserved = await client.studioProject.findUnique({
      where: { id: "studio" },
      include: {
        coachingFindings: true,
        coachingReports: true,
        progressSnapshotLinks: {
          include: { snapshot: { include: { metrics: true } } },
        },
      },
    });
    await client.$disconnect();

    expect(preserved?.coachingFindings).toHaveLength(1);
    expect(preserved?.coachingReports).toHaveLength(1);
    expect(
      preserved?.progressSnapshotLinks[0]?.snapshot.metrics[0],
    ).toMatchObject({
      key: "accepted_findings",
      value: 0,
      sampleSize: 1,
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
