import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

function createDatabase() {
  const directory = mkdtempSync(path.join(tmpdir(), "r6-phase3a-"));
  temporaryDirectories.push(directory);
  const databasePath = path.join(directory, "test.db");
  const migrationRoot = path.resolve(process.cwd(), "prisma", "migrations");
  for (const name of [
    "20260722034340_init",
    "20260722042544_phase2_transcription",
  ]) {
    execFileSync("sqlite3", [databasePath], {
      input: readFileSync(path.join(migrationRoot, name, "migration.sql")),
    });
  }
  return { databasePath, directory, migrationRoot };
}

afterEach(() => {
  while (temporaryDirectories.length) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("Phase 3A additive migration and persistence", () => {
  it("keeps Phase 1/2 rows and reopens reference/profile rows", async () => {
    const { databasePath, migrationRoot } = createDatabase();
    const databaseUrl = `file:${databasePath}`;
    let client = new PrismaClient({ datasourceUrl: databaseUrl });
    await client.project.create({
      data: {
        id: "stable-project",
        name: "Preserved Phase 2 project",
        originalFilename: "stable.mp4",
        sourceRelativePath: "uploads/stable/source.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: BigInt(500),
        durationSeconds: 10,
        width: 1920,
        height: 1080,
        frameRate: 60,
        contentDraft: { create: { openingHook: "Preserve me" } },
      },
    });
    await client.$disconnect();
    execFileSync("sqlite3", [databasePath], {
      input: readFileSync(
        path.join(
          migrationRoot,
          "20260722051921_phase3a_reference_library",
          "migration.sql",
        ),
      ),
    });
    client = new PrismaClient({ datasourceUrl: databaseUrl });
    await client.referenceVideo.create({
      data: {
        id: "owned-reference",
        referenceType: "LOCAL_VIDEO",
        title: "Owned reference",
        creatorName: "My channel",
        game: "Rainbow Six Siege",
        platform: "Shorts",
        sourceType: "OWN_CREATION",
        contentCategory: "Funny",
        permissionConfirmed: true,
        permissionConfirmedAt: new Date(),
        originalFilename: "owned.mp4",
        sourceRelativePath: "references/owned-reference/source.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: BigInt(1_000),
        durationSeconds: 20,
        width: 1920,
        height: 1080,
        frameRate: 60,
        audioTracks: {
          create: {
            streamIndex: 2,
            codecName: "aac",
            channels: 1,
            title: "Creator Microphone",
            preferenceScore: 100,
          },
        },
      },
    });
    await client.creatorStyleProfile.create({
      data: {
        id: "profile",
        name: "My Natural Style",
        referenceLinks: {
          create: { referenceId: "owned-reference" },
        },
      },
    });
    await client.$disconnect();

    client = new PrismaClient({ datasourceUrl: databaseUrl });
    const [project, reference, profile] = await Promise.all([
      client.project.findUnique({
        where: { id: "stable-project" },
        include: { contentDraft: true },
      }),
      client.referenceVideo.findUnique({
        where: { id: "owned-reference" },
        include: { audioTracks: true },
      }),
      client.creatorStyleProfile.findUnique({
        where: { id: "profile" },
        include: { referenceLinks: true },
      }),
    ]);
    expect(project?.contentDraft?.openingHook).toBe("Preserve me");
    expect(reference?.permissionConfirmed).toBe(true);
    expect(reference?.audioTracks[0]?.title).toBe("Creator Microphone");
    expect(profile?.referenceLinks[0]?.referenceId).toBe("owned-reference");
    await client.$disconnect();
  });
});
