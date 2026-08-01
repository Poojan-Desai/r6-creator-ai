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

describe("U3 short-form candidate additive migration", () => {
  it("preserves a U2 project and links new inspectable candidate evidence", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "r6-u3-migration-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const candidateMigration = "20260801051635_short_form_candidate_foundation";
    const candidateMigrationIndex = migrations.indexOf(candidateMigration);
    expect(candidateMigrationIndex).toBeGreaterThan(0);
    for (const migration of migrations.slice(0, candidateMigrationIndex)) {
      applyMigration(databasePath, migration);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        INSERT INTO Project (id, name, originalFilename, sourceRelativePath, mimeType, fileSizeBytes, durationSeconds, width, height, frameRate, updatedAt)
        VALUES ('video', 'Preserved recording', 'source.mp4', 'uploads/video/source.mp4', 'video/mp4', 1000, 600, 1920, 1080, 60, CURRENT_TIMESTAMP);
        INSERT INTO StudioProject (id, name, outputGoal, inputMode, referenceMode, focusAreasJson, updatedAt)
        VALUES ('studio', 'Preserved combined project', 'YOUTUBE_SHORT', 'SCREEN_RECORDING_ONLY', 'NONE', '[]', CURRENT_TIMESTAMP);
        INSERT INTO StudioProjectInput (id, studioProjectId, kind, videoProjectId, sortOrder, updatedAt)
        VALUES ('video-input', 'studio', 'PRIMARY_RECORDING', 'video', 0, CURRENT_TIMESTAMP);
        INSERT INTO AnalysisJob (id, projectId, status, progress, stage, analysisVersion, detectorSetVersion, completedAt, updatedAt)
        VALUES ('analysis', 'video', 'COMPLETED', 100, 'Complete', 'signals-v1', 'set-v1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      `,
    });
    applyMigration(databasePath, candidateMigration);

    const client = new PrismaClient({
      datasourceUrl: `file:${databasePath}`,
    });
    await client.candidateMoment.create({
      data: {
        id: "candidate",
        projectId: "video",
        studioProjectId: "studio",
        analysisJobId: "analysis",
        category: "HIGH_ACTION_GAMEPLAY",
        mainEvent: "High-action gameplay candidate",
        startSeconds: 10,
        peakSeconds: 15,
        endSeconds: 22,
        eventConfidence: 0.7,
        contentPotentialScore: 64,
        scoreBreakdownJson: JSON.stringify({
          disclaimer: "Not a view prediction.",
        }),
        videoEvidenceJson: JSON.stringify([
          { summary: "Motion rose above baseline." },
        ]),
        explanation: "Two local signals overlap.",
      },
    });
    await client.$disconnect();

    const reopened = new PrismaClient({
      datasourceUrl: `file:${databasePath}`,
    });
    const project = await reopened.studioProject.findUnique({
      where: { id: "studio" },
      include: { inputs: true, candidateMoments: true },
    });
    expect(project?.name).toBe("Preserved combined project");
    expect(project?.inputs).toHaveLength(1);
    expect(project?.candidateMoments[0]?.mainEvent).toBe(
      "High-action gameplay candidate",
    );
    expect(project?.candidateMoments[0]?.fusionVersion).toBe(
      "u3-candidate-fusion-v1",
    );
    await reopened.$disconnect();
  });
});
