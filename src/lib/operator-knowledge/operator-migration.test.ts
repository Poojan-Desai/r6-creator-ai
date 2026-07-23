import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

function migrate(databasePath: string, name: string) {
  execFileSync("sqlite3", [databasePath], {
    input: readFileSync(
      path.join(process.cwd(), "prisma", "migrations", name, "migration.sql"),
    ),
  });
}

afterEach(() => {
  while (temporaryDirectories.length) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("Phase 3B.2-O additive migration", () => {
  it("preserves existing data and stores versioned operator relationships", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "r6-operators-"));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const databaseUrl = `file:${databasePath}`;
    for (const name of [
      "20260722034340_init",
      "20260722042544_phase2_transcription",
      "20260722051921_phase3a_reference_library",
      "20260722145757_phase3b1_benchmark_framework",
      "20260722162308_phase3b2m_map_knowledge",
      "20260722162350_phase3b2m_map_lifecycle",
      "20260722192333_phase3b2_signal_curves",
      "20260723015420_phase3b2_signal_event_types",
      "20260723021024_phase3b2_audio_track_roles",
      "20260723023746_phase3b2_transcript_rules",
      "20260723091818_phase3b2_benchmark_review_scope",
      "20260723094054_phase3b2o_operator_knowledge",
    ]) {
      migrate(databasePath, name);
    }
    let client = new PrismaClient({ datasourceUrl: databaseUrl });
    const project = await client.project.create({
      data: {
        id: "project",
        name: "Preserved project",
        originalFilename: "source.mp4",
        sourceRelativePath: "uploads/project/source.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 1_000,
        durationSeconds: 60,
        width: 1920,
        height: 1080,
        frameRate: 60,
        contentDraft: { create: { openingHook: "Keep this hook" } },
      },
    });
    const map = await client.siegeMap.create({
      data: {
        stableId: "map",
        slug: "map",
        name: "Map",
        officialDescription: "Fixture",
        releaseLabel: "Fixture",
        knowledgeStatus: "CURRENT",
        sourceType: "MANUAL",
        officialSourceUrl: "https://example.com/map",
        officialSourceTitle: "Map source",
        retrievedAt: new Date(),
        lastVerifiedAt: new Date(),
        versions: {
          create: {
            stableId: "map:v1",
            versionKey: "v1",
            versionName: "Version 1",
            knowledgeStatus: "CURRENT",
            sourceType: "MANUAL",
            sourceUrl: "https://example.com/map",
            sourceTitle: "Map source",
            lastVerifiedAt: new Date(),
            bombSites: {
              create: {
                stableId: "map:v1:site",
                displayName: "A / B",
                siteAName: "A",
                siteBName: "B",
              },
            },
          },
        },
      },
      include: { versions: { include: { bombSites: true } } },
    });
    const attacker = await client.siegeOperator.create({
      data: {
        stableId: "operator:attacker",
        slug: "attacker",
        canonicalName: "Attacker",
        displayName: "Attacker",
        side: "ATTACKER",
        sourceType: "OFFICIAL",
        officialSourceUrl: "https://example.com/attacker",
        officialSourceTitle: "Attacker source",
        retrievedAt: new Date(),
        lastVerifiedAt: new Date(),
      },
    });
    const defender = await client.siegeOperator.create({
      data: {
        stableId: "operator:defender",
        slug: "defender",
        canonicalName: "Defender",
        displayName: "Defender",
        side: "DEFENDER",
        sourceType: "OFFICIAL",
        officialSourceUrl: "https://example.com/defender",
        officialSourceTitle: "Defender source",
        retrievedAt: new Date(),
        lastVerifiedAt: new Date(),
      },
    });
    const historical = await client.operatorVersion.create({
      data: {
        stableId: "operator:attacker:v0",
        operatorId: attacker.id,
        versionKey: "v0",
        versionName: "Historical",
        knowledgeStatus: "HISTORICAL",
        sourceType: "OFFICIAL",
        sourceUrl: "https://example.com/attacker",
        sourceTitle: "Attacker source",
        lastVerifiedAt: new Date(),
      },
    });
    const current = await client.operatorVersion.create({
      data: {
        stableId: "operator:attacker:v1",
        operatorId: attacker.id,
        parentVersionId: historical.id,
        versionKey: "v1",
        versionName: "Current",
        isCurrent: true,
        officialSpecialtiesJson: '["breach"]',
        officialAbilityName: "Test ability",
        knowledgeStatus: "CURRENT",
        sourceType: "OFFICIAL",
        sourceUrl: "https://example.com/attacker",
        sourceTitle: "Attacker source",
        lastVerifiedAt: new Date(),
        roles: {
          create: [
            {
              roleKey: "breach",
              displayName: "Breach",
              roleSource: "OFFICIAL_SPECIALTY",
              sourceType: "OFFICIAL",
            },
            {
              roleKey: "hard-breach",
              displayName: "Hard breach",
              roleSource: "COMMUNITY_ROLE",
              sourceType: "COMMUNITY_DERIVED",
            },
          ],
        },
        loadout: {
          create: {
            slot: "PRIMARY_WEAPON",
            displayName: "Fixture rifle",
          },
        },
      },
    });
    const gadget = await client.operatorGadget.create({
      data: {
        stableId: "gadget:fixture",
        name: "Fixture gadget",
        gadgetCategory: "support",
        side: "ATTACKER",
        primaryPurpose: "Deterministic migration fixture",
        sourceType: "USER_ENTERED",
        versionKey: "v1",
      },
    });
    await client.operatorLoadoutItem.updateMany({
      where: { operatorVersionId: current.id },
      data: { gadgetId: gadget.id },
    });
    const alias = await client.operatorAlias.create({
      data: {
        operatorId: attacker.id,
        displayName: "Fixture alias",
        normalizedName: "fixture alias",
        sourceType: "USER_ENTERED",
      },
    });
    const defenderVersion = await client.operatorVersion.create({
      data: {
        stableId: "operator:defender:v1",
        operatorId: defender.id,
        versionKey: "v1",
        versionName: "Current",
        isCurrent: true,
        knowledgeStatus: "CURRENT",
        sourceType: "OFFICIAL",
        sourceUrl: "https://example.com/defender",
        sourceTitle: "Defender source",
        lastVerifiedAt: new Date(),
      },
    });
    const ability = await client.operatorAbility.create({
      data: {
        stableId: "operator:attacker:ability",
        operatorId: attacker.id,
        canonicalName: "Test ability",
        versions: {
          create: {
            stableId: "operator:attacker:ability:v1",
            operatorVersionId: current.id,
            versionKey: "v1",
            effectsJson: '{"effect":"test"}',
            sourceType: "OFFICIAL",
            sourceUrl: "https://example.com/attacker",
            sourceTitle: "Attacker source",
            lastVerifiedAt: new Date(),
          },
        },
      },
    });
    await client.operatorInteraction.create({
      data: {
        stableId: "interaction",
        sourceOperatorId: attacker.id,
        sourceOperatorVersionId: current.id,
        targetOperatorId: defender.id,
        targetOperatorVersionId: defenderVersion.id,
        targetAbilityId: ability.id,
        category: "CONDITIONAL_COUNTER",
        conditions: "Only while the target is active.",
        outcome: "Temporarily interrupts the target.",
        sourceType: "USER_ENTERED",
      },
    });
    await client.operatorMapLink.create({
      data: {
        stableId: "map-link",
        operatorVersionId: current.id,
        mapVersionId: map.versions[0]!.id,
        bombSiteId: map.versions[0]!.bombSites[0]!.id,
        tacticalPurpose: "User-confirmed setup support.",
      },
    });
    await client.projectOperatorContext.create({
      data: {
        projectId: project.id,
        playerOperatorId: attacker.id,
        operatorVersionId: current.id,
        side: "ATTACK",
        userConfirmed: true,
      },
    });
    await client.$disconnect();

    client = new PrismaClient({ datasourceUrl: databaseUrl });
    const saved = await client.siegeOperator.findUnique({
      where: { id: attacker.id },
      include: {
        aliases: true,
        versions: {
          include: {
            roles: true,
            loadout: true,
            abilityVersions: true,
            sourceInteractions: true,
            mapLinks: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    expect(saved?.side).toBe("ATTACKER");
    expect(saved?.versions).toHaveLength(2);
    expect(saved?.versions[0]).toMatchObject({
      versionName: "Historical",
      knowledgeStatus: "HISTORICAL",
    });
    expect(saved?.versions[1]?.roles.map((role) => role.roleSource)).toEqual(
      expect.arrayContaining(["OFFICIAL_SPECIALTY", "COMMUNITY_ROLE"]),
    );
    expect(saved?.versions[1]?.loadout[0]?.displayName).toBe("Fixture rifle");
    expect(saved?.versions[1]?.loadout[0]?.gadgetId).toBe(gadget.id);
    expect(saved?.versions[1]?.abilityVersions).toHaveLength(1);
    expect(saved?.versions[1]?.sourceInteractions).toHaveLength(1);
    expect(saved?.versions[1]?.mapLinks[0]?.bombSiteId).toBe(
      map.versions[0]!.bombSites[0]!.id,
    );
    expect(
      await client.project.findUnique({
        where: { id: project.id },
        include: { contentDraft: true, operatorContext: true },
      }),
    ).toMatchObject({
      contentDraft: { openingHook: "Keep this hook" },
      operatorContext: { userConfirmed: true },
    });
    expect(await client.siegeMap.count()).toBe(1);
    await client.operatorAlias.delete({ where: { id: alias.id } });
    expect(await client.operatorAlias.count()).toBe(0);
    await client.$disconnect();
  });
});
