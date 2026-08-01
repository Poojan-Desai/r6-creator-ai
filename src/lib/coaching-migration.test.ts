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

describe("U6 Coaching Lab additive migration", () => {
  it("preserves U5 projects and voiceover while storing separated coaching evidence", async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "r6-u6-coaching-migration-"),
    );
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    const coachingMigration = "20260801184010_coaching_lab_foundation";
    const correctionMigration = "20260801184058_coaching_finding_corrections";
    const measurementMigration = "20260801185541_coaching_measurements";
    const migrationIndex = migrations.indexOf(coachingMigration);
    expect(migrationIndex).toBeGreaterThan(0);
    for (const migration of migrations.slice(0, migrationIndex)) {
      applyMigration(databasePath, migration);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        PRAGMA foreign_keys = ON;
        INSERT INTO Project (
          id, name, originalFilename, sourceRelativePath, mimeType,
          fileSizeBytes, durationSeconds, width, height, frameRate, updatedAt
        ) VALUES (
          'video', 'Preserved recording', 'source.mp4',
          'uploads/video/source.mp4', 'video/mp4', 1000, 60, 1920, 1080, 60,
          CURRENT_TIMESTAMP
        );
        INSERT INTO StudioProject (
          id, name, outputGoal, inputMode, referenceMode, focusAreasJson,
          updatedAt
        ) VALUES (
          'studio', 'Preserved project', 'CONTENT_AND_COACHING',
          'SCREEN_RECORDING_ONLY', 'NONE', '[]', CURRENT_TIMESTAMP
        );
        INSERT INTO StudioProjectInput (
          id, studioProjectId, kind, videoProjectId, sortOrder, updatedAt
        ) VALUES (
          'input', 'studio', 'PRIMARY_RECORDING', 'video', 0, CURRENT_TIMESTAMP
        );
        INSERT INTO VoiceoverProduction (
          id, studioProjectId, currentScriptVersion, updatedAt
        ) VALUES ('voiceover', 'studio', 0, CURRENT_TIMESTAMP);
      `,
    });
    applyMigration(databasePath, coachingMigration);
    applyMigration(databasePath, correctionMigration);
    applyMigration(databasePath, measurementMigration);

    const client = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
    const calibration = await client.coachingCalibration.create({
      data: {
        id: "calibration",
        studioProjectId: "studio",
        videoProjectId: "video",
        version: 1,
        name: "Centered 1080p",
        sourceWidth: 1920,
        sourceHeight: 1080,
        userConfirmed: true,
      },
    });
    const analysis = await client.coachingAnalysis.create({
      data: {
        id: "analysis",
        studioProjectId: "studio",
        calibrationId: calibration.id,
        inputMode: "SCREEN_RECORDING_ONLY",
        status: "COMPLETED",
        progress: 100,
        stage: "Human-reviewed findings ready",
        analysisVersion: "u6-human-reviewed-v1",
        ruleSetVersion: "u6-inspectable-foundation-v1",
        completedAt: new Date(),
      },
    });
    const finding = await client.coachingFinding.create({
      data: {
        id: "finding",
        studioProjectId: "studio",
        analysisId: analysis.id,
        originalCategory: "CROSSHAIR_PLACEMENT_ISSUE",
        category: "CROSSHAIR_PLACEMENT_ISSUE",
        originalSeverity: "MEDIUM",
        severity: "MEDIUM",
        confidence: 0.7,
        originalVideoTimestampSeconds: 12.5,
        videoTimestampSeconds: 12.5,
        directObservationsJson: JSON.stringify([
          "Crosshair was visibly below the doorway.",
        ]),
        missingContextJson: JSON.stringify([
          "Threat movement before the frame is unknown.",
        ]),
        explanation:
          "This visible measurement is worth review; the cause remains unknown.",
        analysisVersion: "u6-human-reviewed-v1",
        evidence: {
          create: [
            {
              evidenceClass: "DIRECT_VIDEO_OBSERVATION",
              summary: "Crosshair was visibly below the doorway.",
              sourceType: "HUMAN_REVIEWED_RECORDING",
              sourceId: "video",
              videoTimestampSeconds: 12.5,
            },
            {
              evidenceClass: "MISSING_CONTEXT",
              summary: "Threat movement before the frame is unknown.",
              sourceType: "CAPABILITY_BOUNDARY",
            },
          ],
        },
      },
    });
    await client.coachingFinding.update({
      where: { id: finding.id },
      data: {
        decision: "NOT_ENOUGH_CONTEXT",
        videoTimestampSeconds: 12.75,
        feedbackHistory: {
          create: {
            decision: "NOT_ENOUGH_CONTEXT",
            previousDecision: "PENDING",
            correctedVideoTimestamp: 12.75,
            previousVideoTimestamp: 12.5,
            note: "Need the previous angle.",
          },
        },
      },
    });
    await client.coachingMeasurement.create({
      data: {
        id: "measurement",
        studioProjectId: "studio",
        videoProjectId: "video",
        calibrationId: calibration.id,
        findingId: finding.id,
        kind: "CROSSHAIR_OFFSET",
        startSeconds: 12.5,
        peakSeconds: 12.5,
        endSeconds: 12.5,
        confidence: 0.7,
        methodVersion: "u6-local-measurements-v1",
        inputsJson: '{"crosshairNormalizedX":0.5}',
        measurementsJson: '{"pixelDistance":48}',
        thresholdsJson: '{"issueThreshold":0.075}',
        userConfirmed: true,
      },
    });
    await client.$disconnect();

    const reopened = new PrismaClient({
      datasourceUrl: `file:${databasePath}`,
    });
    const persisted = await reopened.studioProject.findUnique({
      where: { id: "studio" },
      include: {
        voiceoverProduction: true,
        coachingCalibrations: true,
        coachingAnalyses: true,
        coachingFindings: {
          include: { evidence: true, feedbackHistory: true },
        },
        coachingMeasurements: true,
      },
    });
    await reopened.$disconnect();

    expect(persisted?.voiceoverProduction?.id).toBe("voiceover");
    expect(persisted?.coachingCalibrations[0]).toMatchObject({
      version: 1,
      sourceWidth: 1920,
      userConfirmed: true,
    });
    expect(persisted?.coachingFindings[0]).toMatchObject({
      originalVideoTimestampSeconds: 12.5,
      videoTimestampSeconds: 12.75,
      decision: "NOT_ENOUGH_CONTEXT",
    });
    expect(persisted?.coachingFindings[0]?.evidence).toHaveLength(2);
    expect(persisted?.coachingFindings[0]?.feedbackHistory[0]).toMatchObject({
      previousDecision: "PENDING",
      correctedVideoTimestamp: 12.75,
    });
    expect(persisted?.coachingMeasurements[0]).toMatchObject({
      kind: "CROSSHAIR_OFFSET",
      methodVersion: "u6-local-measurements-v1",
      userConfirmed: true,
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
