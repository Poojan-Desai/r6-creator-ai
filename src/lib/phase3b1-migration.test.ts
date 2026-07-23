import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

function applyMigration(
  databasePath: string,
  migrationRoot: string,
  name: string,
) {
  execFileSync("sqlite3", [databasePath], {
    input: readFileSync(path.join(migrationRoot, name, "migration.sql")),
  });
}

afterEach(() => {
  while (temporaryDirectories.length) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("Phase 3B.1 additive migration", () => {
  it("preserves Phase 1-3A rows and persists benchmark/framework rows", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "r6-phase3b1-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const databaseUrl = `file:${databasePath}`;
    const migrationRoot = path.resolve(process.cwd(), "prisma", "migrations");
    for (const name of [
      "20260722034340_init",
      "20260722042544_phase2_transcription",
      "20260722051921_phase3a_reference_library",
    ]) {
      applyMigration(databasePath, migrationRoot, name);
    }

    execFileSync("sqlite3", [databasePath], {
      input: `
        INSERT INTO Project (id, name, originalFilename, sourceRelativePath, mimeType, fileSizeBytes, durationSeconds, width, height, frameRate, updatedAt)
        VALUES ('stable-project', 'Preserved Phase 3A project', 'stable.mp4', 'uploads/stable/source.mp4', 'video/mp4', 1000, 60, 1920, 1080, 60, CURRENT_TIMESTAMP);
        INSERT INTO ContentDraft (id, projectId, openingHook, updatedAt)
        VALUES ('stable-content', 'stable-project', 'Keep this hook', CURRENT_TIMESTAMP);
        INSERT INTO ReferenceVideo (id, referenceType, title, creatorName, platform, sourceType, contentCategory, permissionConfirmed, updatedAt)
        VALUES ('stable-reference', 'LOCAL_VIDEO', 'Preserved reference', 'My channel', 'YouTube', 'OWN_CREATION', 'Natural', 1, CURRENT_TIMESTAMP);
        INSERT INTO CreatorStyleProfile (id, name, updatedAt)
        VALUES ('stable-profile', 'Preserved profile', CURRENT_TIMESTAMP);
        INSERT INTO StyleProfileReference (profileId, referenceId)
        VALUES ('stable-profile', 'stable-reference');
      `,
    });

    applyMigration(
      databasePath,
      migrationRoot,
      "20260722145757_phase3b1_benchmark_framework",
    );
    execFileSync("sqlite3", [databasePath], {
      input: `
        INSERT INTO GroundTruthLabel (id, projectId, category, startSeconds, peakSeconds, endSeconds, humanConfidence, approved, updatedAt)
        VALUES ('ground-truth', 'stable-project', 'KILL', 10, 11, 12, 0.9, 1, CURRENT_TIMESTAMP);
        INSERT INTO DetectorDefinition (id, stableId, name, version, description, updatedAt)
        VALUES ('fixture-definition', 'fixture.detector', 'Fixture detector', '1.0.0', 'Migration fixture', CURRENT_TIMESTAMP);
        INSERT INTO AnalysisJob (id, projectId, detectorSetVersion, enabledDetectorCount, updatedAt)
        VALUES ('fixture-job', 'stable-project', 'fixture-set-v1', 1, CURRENT_TIMESTAMP);
        INSERT INTO DetectorRun (id, analysisJobId, detectorDefinitionId, detectorStableId, detectorVersion, updatedAt)
        VALUES ('fixture-run', 'fixture-job', 'fixture-definition', 'fixture.detector', '1.0.0', CURRENT_TIMESTAMP);
      `,
    });
    for (const name of [
      "20260722162308_phase3b2m_map_knowledge",
      "20260722162350_phase3b2m_map_lifecycle",
      "20260722192333_phase3b2_signal_curves",
      "20260723015420_phase3b2_signal_event_types",
      "20260723021024_phase3b2_audio_track_roles",
      "20260723023746_phase3b2_transcript_rules",
      "20260723091818_phase3b2_benchmark_review_scope",
    ]) {
      applyMigration(databasePath, migrationRoot, name);
    }

    const client = new PrismaClient({ datasourceUrl: databaseUrl });
    const [project, reference, profile, label, savedJob] = await Promise.all([
      client.project.findUnique({
        where: { id: "stable-project" },
        include: { contentDraft: true },
      }),
      client.referenceVideo.findUnique({ where: { id: "stable-reference" } }),
      client.creatorStyleProfile.findUnique({
        where: { id: "stable-profile" },
        include: { referenceLinks: true },
      }),
      client.groundTruthLabel.findUnique({ where: { id: "ground-truth" } }),
      client.analysisJob.findUnique({
        where: { id: "fixture-job" },
        include: { detectorRuns: { include: { detectorDefinition: true } } },
      }),
    ]);
    expect(project?.contentDraft?.openingHook).toBe("Keep this hook");
    expect(reference?.permissionConfirmed).toBe(true);
    expect(profile?.referenceLinks).toHaveLength(1);
    expect(label).toMatchObject({ category: "KILL", approved: true });
    expect(savedJob?.detectorRuns[0]).toMatchObject({
      detectorStableId: "fixture.detector",
      detectorVersion: "1.0.0",
    });
    const benchmarkColumns = execFileSync(
      "sqlite3",
      [databasePath, "PRAGMA table_info(BenchmarkDatasetProject);"],
      { encoding: "utf8" },
    );
    expect(benchmarkColumns).toContain("fullyReviewedCategoriesJson");
    expect(benchmarkColumns).toContain("humanReviewMinutes");
    await client.$disconnect();
  });
});
