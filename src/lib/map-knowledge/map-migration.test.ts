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

describe("Phase 3B.2-M additive migration", () => {
  it("preserves Phase 1-3B.1 data and supports versioned map knowledge", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "r6-map-migration-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const databaseUrl = `file:${databasePath}`;
    const migrationRoot = path.resolve(process.cwd(), "prisma", "migrations");
    for (const name of [
      "20260722034340_init",
      "20260722042544_phase2_transcription",
      "20260722051921_phase3a_reference_library",
      "20260722145757_phase3b1_benchmark_framework",
    ]) {
      applyMigration(databasePath, migrationRoot, name);
    }
    execFileSync("sqlite3", [databasePath], {
      input: `
        INSERT INTO Project (id, name, originalFilename, sourceRelativePath, mimeType, fileSizeBytes, durationSeconds, width, height, frameRate, updatedAt)
        VALUES ('stable-project', 'Preserved project', 'stable.mp4', 'uploads/stable/source.mp4', 'video/mp4', 1000, 60, 1920, 1080, 60, CURRENT_TIMESTAMP);
        INSERT INTO ContentDraft (id, projectId, openingHook, updatedAt)
        VALUES ('stable-content', 'stable-project', 'Keep this hook', CURRENT_TIMESTAMP);
        INSERT INTO GroundTruthLabel (id, projectId, category, startSeconds, peakSeconds, endSeconds, humanConfidence, approved, updatedAt)
        VALUES ('stable-label', 'stable-project', 'KILL', 10, 11, 12, 1, 1, CURRENT_TIMESTAMP);
        INSERT INTO ReferenceVideo (id, referenceType, title, creatorName, platform, sourceType, contentCategory, permissionConfirmed, updatedAt)
        VALUES ('stable-reference', 'LOCAL_VIDEO', 'Preserved reference', 'My channel', 'YouTube', 'OWN_CREATION', 'Natural', 1, CURRENT_TIMESTAMP);
      `,
    });

    applyMigration(
      databasePath,
      migrationRoot,
      "20260722162308_phase3b2m_map_knowledge",
    );
    applyMigration(
      databasePath,
      migrationRoot,
      "20260722162350_phase3b2m_map_lifecycle",
    );

    let client = new PrismaClient({ datasourceUrl: databaseUrl });
    const gameVersion = await client.gameDataVersion.create({
      data: {
        stableId: "fixture-y11s2",
        year: 11,
        seasonName: "Fixture season",
        seasonNumber: 2,
        releaseDate: new Date("2026-06-02T00:00:00.000Z"),
        verificationDate: new Date("2026-07-22T00:00:00.000Z"),
        sourceUrl: "https://example.com/official",
        sourceTitle: "Fixture official source",
      },
    });
    const map = await client.siegeMap.create({
      data: {
        stableId: "fixture-map",
        slug: "fixture-map",
        name: "Fixture Map",
        officialDescription: "Test-only map.",
        releaseLabel: "Fixture release",
        lifecycleStatus: "ACTIVE",
        knowledgeStatus: "CURRENT",
        sourceType: "MANUAL",
        officialSourceUrl: "https://example.com/map",
        officialSourceTitle: "Fixture map source",
        retrievedAt: new Date("2026-07-22T00:00:00.000Z"),
        lastVerifiedAt: new Date("2026-07-22T00:00:00.000Z"),
      },
    });
    const oldVersion = await client.mapVersion.create({
      data: {
        stableId: "fixture-map:old",
        mapId: map.id,
        gameDataVersionId: gameVersion.id,
        versionKey: "old",
        versionName: "Historical layout",
        knowledgeStatus: "HISTORICAL",
        sourceType: "MANUAL",
        sourceUrl: "https://example.com/map/old",
        sourceTitle: "Historical fixture",
        lastVerifiedAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    });
    const currentVersion = await client.mapVersion.create({
      data: {
        stableId: "fixture-map:current",
        mapId: map.id,
        gameDataVersionId: gameVersion.id,
        parentVersionId: oldVersion.id,
        versionKey: "current",
        versionName: "Current layout",
        knowledgeStatus: "CURRENT",
        sourceType: "MANUAL",
        sourceUrl: "https://example.com/map/current",
        sourceTitle: "Current fixture",
        lastVerifiedAt: new Date("2026-07-22T00:00:00.000Z"),
      },
    });
    const basement = await client.mapFloor.create({
      data: {
        stableId: "fixture-map:current:basement",
        mapVersionId: currentVersion.id,
        displayName: "Basement",
        sortOrder: 0,
        elevation: -1,
        sourceType: "MANUAL",
      },
    });
    const laundry = await client.mapElement.create({
      data: {
        stableId: "fixture-map:current:laundry",
        mapVersionId: currentVersion.id,
        floorId: basement.id,
        elementType: "OBJECTIVE_ROOM",
        displayName: "Laundry",
        canonicalCallout: "Laundry",
        calloutKind: "COMMUNITY",
        geometryType: "POLYGON",
        geometryJson: JSON.stringify([
          { x: 0.1, y: 0.1 },
          { x: 0.3, y: 0.1 },
          { x: 0.3, y: 0.3 },
        ]),
        sourceType: "MANUAL",
      },
    });
    const hall = await client.mapElement.create({
      data: {
        stableId: "fixture-map:current:hall",
        mapVersionId: currentVersion.id,
        floorId: basement.id,
        elementType: "HALLWAY",
        displayName: "Basement Hall",
        geometryType: "POLYGON",
        geometryJson: JSON.stringify([
          { x: 0.3, y: 0.1 },
          { x: 0.5, y: 0.1 },
          { x: 0.5, y: 0.2 },
        ]),
        sourceType: "MANUAL",
      },
    });
    await client.mapConnection.create({
      data: {
        stableId: "fixture-map:current:door",
        mapVersionId: currentVersion.id,
        fromElementId: hall.id,
        toElementId: laundry.id,
        connectionType: "DOOR",
        sourceType: "MANUAL",
      },
    });
    const site = await client.mapBombSitePair.create({
      data: {
        stableId: "fixture-map:current:site",
        mapVersionId: currentVersion.id,
        floorId: basement.id,
        displayName: "Laundry and Supply",
        siteAName: "Laundry",
        siteBName: "Supply",
        sourceType: "MANUAL",
        elementLinks: {
          create: { elementId: laundry.id, role: "OBJECTIVE_ROOM" },
        },
      },
    });
    await client.projectMapContext.create({
      data: {
        projectId: "stable-project",
        mapId: map.id,
        mapVersionId: currentVersion.id,
        bombSiteId: site.id,
        side: "DEFENSE",
        startingRoomId: laundry.id,
        importantRoomIdsJson: JSON.stringify([laundry.id, hall.id]),
        operator: "Fixture operator",
        roundResult: "Unknown",
        userConfirmed: true,
        sourceType: "MANUAL",
      },
    });
    await client.$disconnect();

    client = new PrismaClient({ datasourceUrl: databaseUrl });
    const [project, reference, label, savedMap, context] = await Promise.all([
      client.project.findUnique({
        where: { id: "stable-project" },
        include: { contentDraft: true },
      }),
      client.referenceVideo.findUnique({ where: { id: "stable-reference" } }),
      client.groundTruthLabel.findUnique({ where: { id: "stable-label" } }),
      client.siegeMap.findUnique({
        where: { id: map.id },
        include: {
          versions: {
            include: {
              floors: true,
              elements: { include: { aliases: true } },
              connections: true,
              bombSites: { include: { elementLinks: true } },
            },
          },
        },
      }),
      client.projectMapContext.findUnique({
        where: { projectId: "stable-project" },
      }),
    ]);
    expect(project?.contentDraft?.openingHook).toBe("Keep this hook");
    expect(reference?.permissionConfirmed).toBe(true);
    expect(label?.approved).toBe(true);
    expect(
      savedMap?.versions.map((version) => version.knowledgeStatus).sort(),
    ).toEqual(["CURRENT", "HISTORICAL"]);
    expect(
      savedMap?.versions.find((version) => version.id === currentVersion.id),
    ).toMatchObject({
      floors: [{ displayName: "Basement" }],
      connections: [{ connectionType: "DOOR" }],
    });
    expect(context).toMatchObject({
      mapId: map.id,
      mapVersionId: currentVersion.id,
      userConfirmed: true,
    });
    await client.$disconnect();
  });
});
