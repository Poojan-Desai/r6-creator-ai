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

describe("U3 short-form production additive migration", () => {
  it("preserves candidate evidence and reopens immutable writing revisions", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "r6-u3-plan-migration-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const productionMigration = "20260801054026_short_form_story_and_writing";
    const migrationIndex = migrations.indexOf(productionMigration);
    expect(migrationIndex).toBeGreaterThan(0);
    for (const migration of migrations.slice(0, migrationIndex)) {
      applyMigration(databasePath, migration);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        INSERT INTO Project (id, name, originalFilename, sourceRelativePath, mimeType, fileSizeBytes, durationSeconds, width, height, frameRate, updatedAt)
        VALUES ('video', 'Preserved video', 'source.mp4', 'uploads/video/source.mp4', 'video/mp4', 1000, 60, 1920, 1080, 60, CURRENT_TIMESTAMP);
        INSERT INTO StudioProject (id, name, outputGoal, inputMode, referenceMode, focusAreasJson, updatedAt)
        VALUES ('studio', 'Preserved studio', 'YOUTUBE_SHORT', 'SCREEN_RECORDING_ONLY', 'NONE', '[]', CURRENT_TIMESTAMP);
        INSERT INTO StudioProjectInput (id, studioProjectId, kind, videoProjectId, sortOrder, updatedAt)
        VALUES ('input', 'studio', 'PRIMARY_RECORDING', 'video', 0, CURRENT_TIMESTAMP);
        INSERT INTO AnalysisJob (id, projectId, status, progress, stage, analysisVersion, detectorSetVersion, completedAt, updatedAt)
        VALUES ('analysis', 'video', 'COMPLETED', 100, 'Complete', 'signals-v1', 'set-v1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO CandidateMoment (id, projectId, studioProjectId, analysisJobId, category, mainEvent, startSeconds, peakSeconds, endSeconds, eventConfidence, contentPotentialScore, scoreBreakdownJson, videoEvidenceJson, explanation, updatedAt)
        VALUES ('candidate', 'video', 'studio', 'analysis', 'HIGH_ACTION_GAMEPLAY', 'High-action gameplay candidate', 10, 15, 20, 0.7, 60, '{"version":"v1"}', '[{"summary":"motion"}]', 'Preserve me', CURRENT_TIMESTAMP);
      `,
    });
    applyMigration(databasePath, productionMigration);

    const client = new PrismaClient({
      datasourceUrl: `file:${databasePath}`,
    });
    const production = await client.shortFormProduction.create({
      data: {
        id: "production",
        studioProjectId: "studio",
        selectedCandidateId: "candidate",
        currentVersion: 1,
        revisions: {
          create: {
            version: 1,
            reason: "Initial",
            providerId: "local-template-v1",
            configurationJson: JSON.stringify({ targetDurationSeconds: 30 }),
            storyPlanJson: JSON.stringify({ premise: "Original plan" }),
            writingPackageJson: JSON.stringify({
              hooks: ["One", "Two", "Three"],
            }),
            factsSnapshotJson: JSON.stringify({
              unknowns: ["Outcome unknown"],
            }),
          },
        },
      },
    });
    await client.$disconnect();

    const reopened = new PrismaClient({
      datasourceUrl: `file:${databasePath}`,
    });
    const saved = await reopened.shortFormProduction.findUnique({
      where: { id: production.id },
      include: {
        studioProject: true,
        selectedCandidate: true,
        revisions: true,
      },
    });
    expect(saved?.studioProject.name).toBe("Preserved studio");
    expect(saved?.selectedCandidate?.explanation).toBe("Preserve me");
    expect(saved?.revisions).toHaveLength(1);
    expect(JSON.parse(saved?.revisions[0]?.factsSnapshotJson ?? "{}")).toEqual({
      unknowns: ["Outcome unknown"],
    });
    await reopened.$disconnect();
  });
});
