import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
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

describe("Phase 3B.2 signal-curve migration", () => {
  it("preserves legacy and map rows while storing chunked curves", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "r6-signals-migration-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const databaseUrl = `file:${databasePath}`;
    const migrationRoot = path.resolve(process.cwd(), "prisma", "migrations");
    for (const name of [
      "20260722034340_init",
      "20260722042544_phase2_transcription",
      "20260722051921_phase3a_reference_library",
      "20260722145757_phase3b1_benchmark_framework",
      "20260722162308_phase3b2m_map_knowledge",
      "20260722162350_phase3b2m_map_lifecycle",
    ]) {
      applyMigration(databasePath, migrationRoot, name);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        INSERT INTO Project (id, name, originalFilename, sourceRelativePath, mimeType, fileSizeBytes, durationSeconds, width, height, frameRate, updatedAt)
        VALUES ('stable-project', 'Preserved project', 'stable.mp4', 'uploads/stable/source.mp4', 'video/mp4', 1000, 60, 1920, 1080, 60, CURRENT_TIMESTAMP);
        INSERT INTO ContentDraft (id, projectId, openingHook, updatedAt)
        VALUES ('stable-content', 'stable-project', 'Keep this hook', CURRENT_TIMESTAMP);
        INSERT INTO AudioTrack (id, projectId, streamIndex, codecName, channels, title, updatedAt)
        VALUES ('creator-track', 'stable-project', 2, 'aac', 1, 'Creator Microphone', CURRENT_TIMESTAMP);
        INSERT INTO ReferenceVideo (id, referenceType, title, creatorName, platform, sourceType, contentCategory, permissionConfirmed, updatedAt)
        VALUES ('stable-reference', 'LOCAL_VIDEO', 'Preserved reference', 'My channel', 'YouTube', 'OWN_CREATION', 'Natural', 1, CURRENT_TIMESTAMP);
        INSERT INTO GroundTruthLabel (id, projectId, category, startSeconds, peakSeconds, endSeconds, humanConfidence, approved, updatedAt)
        VALUES ('stable-label', 'stable-project', 'HIGH_ACTION_GAMEPLAY', 10, 11, 12, 1, 1, CURRENT_TIMESTAMP);
        INSERT INTO SiegeMap (id, stableId, slug, name, officialDescription, releaseLabel, lifecycleStatus, knowledgeStatus, sourceType, officialSourceUrl, officialSourceTitle, retrievedAt, lastVerifiedAt, updatedAt)
        VALUES ('stable-map', 'stable-map', 'stable-map', 'Stable Map', 'Fixture map', 'Fixture release', 'ACTIVE', 'CURRENT', 'MANUAL', 'https://example.com/map', 'Map source', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO MapVersion (id, stableId, mapId, versionKey, versionName, knowledgeStatus, sourceType, sourceUrl, sourceTitle, lastVerifiedAt, updatedAt)
        VALUES ('stable-map-version', 'stable-map:current', 'stable-map', 'current', 'Current', 'CURRENT', 'MANUAL', 'https://example.com/map', 'Map source', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
        INSERT INTO BlueprintAsset (id, stableId, mapVersionId, assetKind, originalFileName, relativePath, mimeType, fileSizeBytes, sha256, sourceType, importedAt)
        VALUES ('stable-blueprint', 'stable-map:blueprint', 'stable-map-version', 'PREVIEW_IMAGE', 'preview.jpg', 'map-knowledge/stable-map-version/previews/preview.jpg', 'image/jpeg', 100, 'hash', 'MANUAL', CURRENT_TIMESTAMP);
        INSERT INTO ProjectMapContext (id, projectId, mapId, mapVersionId, userConfirmed, updatedAt)
        VALUES ('stable-context', 'stable-project', 'stable-map', 'stable-map-version', 1, CURRENT_TIMESTAMP);
        INSERT INTO DetectorDefinition (id, stableId, name, version, description, updatedAt)
        VALUES ('definition', 'video.action', 'Action', '1.0.0', 'Fixture detector', CURRENT_TIMESTAMP);
        INSERT INTO AnalysisJob (id, projectId, detectorSetVersion, updatedAt)
        VALUES ('job', 'stable-project', 'fixture-set', CURRENT_TIMESTAMP);
        INSERT INTO DetectorRun (id, analysisJobId, detectorDefinitionId, detectorStableId, detectorVersion, updatedAt)
        VALUES ('run', 'job', 'definition', 'video.action', '1.0.0', CURRENT_TIMESTAMP);
      `,
    });
    applyMigration(
      databasePath,
      migrationRoot,
      "20260722192333_phase3b2_signal_curves",
    );
    execFileSync("sqlite3", [databasePath], {
      input: `
        INSERT INTO DetectorEvent (id, detectorRunId, category, startSeconds, peakSeconds, endSeconds, confidence, sourceSignal, processingDurationMs)
        VALUES ('legacy-event', 'run', 'HIGH_ACTION_GAMEPLAY', 10, 11, 12, 0.8, 'MOTION', 100);
      `,
    });
    applyMigration(
      databasePath,
      migrationRoot,
      "20260723015420_phase3b2_signal_event_types",
    );
    applyMigration(
      databasePath,
      migrationRoot,
      "20260723021024_phase3b2_audio_track_roles",
    );
    applyMigration(
      databasePath,
      migrationRoot,
      "20260723023746_phase3b2_transcript_rules",
    );
    applyMigration(
      databasePath,
      migrationRoot,
      "20260723091818_phase3b2_benchmark_review_scope",
    );
    applyMigration(
      databasePath,
      migrationRoot,
      "20260723094054_phase3b2o_operator_knowledge",
    );
    execFileSync("sqlite3", [databasePath], {
      input: `
        UPDATE AudioTrack
        SET analysisRole = 'CREATOR_MICROPHONE', roleConfirmedAt = CURRENT_TIMESTAMP
        WHERE id = 'creator-track';
        INSERT INTO TranscriptRule (id, stableId, name, description, category, enabled, isDefault, currentVersion, updatedAt)
        VALUES ('rule', 'fixture.rule', 'Fixture rule', 'Preserved versioned fixture', 'SURPRISE', 1, 0, 2, CURRENT_TIMESTAMP);
        INSERT INTO TranscriptRuleVersion (id, ruleId, version, patternJson, confidence, source)
        VALUES
          ('rule-v1', 'rule', 1, '{"schemaVersion":"r6-transcript-pattern/v1","phrases":["wait"],"regexes":[],"negations":[],"ambiguousPhrases":[],"contextBeforeLines":1,"contextAfterLines":1,"repetitionBoost":true}', 0.5, 'USER'),
          ('rule-v2', 'rule', 2, '{"schemaVersion":"r6-transcript-pattern/v1","phrases":["no way"],"regexes":[],"negations":[],"ambiguousPhrases":["no way"],"contextBeforeLines":1,"contextAfterLines":1,"repetitionBoost":true}', 0.6, 'USER');
      `,
    });

    let client = new PrismaClient({ datasourceUrl: databaseUrl });
    const payload = gzipSync(
      JSON.stringify({ schemaVersion: "r6-signal-curve-chunk/v1", points: [] }),
    );
    const curve = await client.signalCurve.create({
      data: {
        detectorRunId: "run",
        audioTrackId: "creator-track",
        stableId: "creator.loudness",
        kind: "AUDIO_LOUDNESS",
        displayName: "Creator loudness",
        unit: "dBFS",
        sourceSignal: "CREATOR_MICROPHONE",
        sourceTrackRole: "CREATOR_MICROPHONE",
        sourceStreamIndex: 2,
        sampleIntervalSeconds: 0.5,
        aggregation: "EVENT_PRESERVING",
        rawPointCount: 0,
        storedPointCount: 0,
        chunks: {
          create: {
            chunkIndex: 0,
            startSeconds: 0,
            endSeconds: 0,
            pointCount: 0,
            payload,
            rawSizeBytes: 63,
            compressedSizeBytes: payload.byteLength,
          },
        },
      },
    });
    await client.signalExplorerPreference.create({
      data: { projectId: "stable-project", minimumConfidence: 0.25 },
    });
    await client.$disconnect();

    client = new PrismaClient({ datasourceUrl: databaseUrl });
    const [
      project,
      reference,
      label,
      map,
      blueprint,
      context,
      savedCurve,
      event,
      rule,
    ] = await Promise.all([
      client.project.findUnique({
        where: { id: "stable-project" },
        include: { contentDraft: true, signalExplorer: true },
      }),
      client.referenceVideo.findUnique({ where: { id: "stable-reference" } }),
      client.groundTruthLabel.findUnique({ where: { id: "stable-label" } }),
      client.siegeMap.findUnique({ where: { id: "stable-map" } }),
      client.blueprintAsset.findUnique({ where: { id: "stable-blueprint" } }),
      client.projectMapContext.findUnique({
        where: { projectId: "stable-project" },
      }),
      client.signalCurve.findUnique({
        where: { id: curve.id },
        include: { chunks: true, audioTrack: true },
      }),
      client.detectorEvent.findUnique({ where: { id: "legacy-event" } }),
      client.transcriptRule.findUnique({
        where: { id: "rule" },
        include: { versions: { orderBy: { version: "asc" } } },
      }),
    ]);
    expect(project?.contentDraft?.openingHook).toBe("Keep this hook");
    expect(project?.signalExplorer?.minimumConfidence).toBe(0.25);
    expect(reference?.permissionConfirmed).toBe(true);
    expect(label?.approved).toBe(true);
    expect(map?.knowledgeStatus).toBe("CURRENT");
    expect(blueprint?.relativePath).toContain("map-knowledge/");
    expect(context?.userConfirmed).toBe(true);
    expect(savedCurve).toMatchObject({
      stableId: "creator.loudness",
      sourceTrackRole: "CREATOR_MICROPHONE",
      audioTrack: {
        streamIndex: 2,
        analysisRole: "CREATOR_MICROPHONE",
        roleConfirmedAt: expect.any(Date),
      },
    });
    expect(savedCurve?.chunks).toHaveLength(1);
    expect(event).toMatchObject({
      eventType: "BENCHMARK_HIGH_ACTION_GAMEPLAY",
      category: "HIGH_ACTION_GAMEPLAY",
    });
    expect(rule).toMatchObject({ currentVersion: 2, enabled: true });
    expect(rule?.versions.map((version) => version.version)).toEqual([1, 2]);
    await client.signalCurve.delete({ where: { id: curve.id } });
    expect(
      await client.signalCurveChunk.count({
        where: { signalCurveId: curve.id },
      }),
    ).toBe(0);
    await client.$disconnect();
  });
});
