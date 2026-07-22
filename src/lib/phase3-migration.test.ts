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
    execFileSync("sqlite3", [databasePath], {
      input: `
        INSERT INTO Project (id, name, originalFilename, sourceRelativePath, mimeType, fileSizeBytes, durationSeconds, width, height, frameRate, updatedAt)
        VALUES ('stable-project', 'Preserved Phase 2 project', 'stable.mp4', 'uploads/stable/source.mp4', 'video/mp4', 500, 10, 1920, 1080, 60, CURRENT_TIMESTAMP);
        INSERT INTO ContentDraft (id, projectId, openingHook, updatedAt)
        VALUES ('stable-content', 'stable-project', 'Preserve me', CURRENT_TIMESTAMP);
      `,
    });
    execFileSync("sqlite3", [databasePath], {
      input: readFileSync(
        path.join(
          migrationRoot,
          "20260722051921_phase3a_reference_library",
          "migration.sql",
        ),
      ),
    });
    execFileSync("sqlite3", [databasePath], {
      input: `
        INSERT INTO ReferenceVideo (id, referenceType, title, creatorName, platform, sourceType, contentCategory, permissionConfirmed, permissionConfirmedAt, originalFilename, sourceRelativePath, mimeType, fileSizeBytes, durationSeconds, width, height, frameRate, updatedAt)
        VALUES ('owned-reference', 'LOCAL_VIDEO', 'Owned reference', 'My channel', 'Shorts', 'OWN_CREATION', 'Funny', 1, CURRENT_TIMESTAMP, 'owned.mp4', 'references/owned-reference/source.mp4', 'video/mp4', 1000, 20, 1920, 1080, 60, CURRENT_TIMESTAMP);
        INSERT INTO ReferenceAudioTrack (id, referenceId, streamIndex, codecName, channels, title, preferenceScore, updatedAt)
        VALUES ('owned-track', 'owned-reference', 2, 'aac', 1, 'Creator Microphone', 100, CURRENT_TIMESTAMP);
        INSERT INTO CreatorStyleProfile (id, name, updatedAt)
        VALUES ('profile', 'My Natural Style', CURRENT_TIMESTAMP);
        INSERT INTO StyleProfileReference (profileId, referenceId)
        VALUES ('profile', 'owned-reference');
      `,
    });
    execFileSync("sqlite3", [databasePath], {
      input: readFileSync(
        path.join(
          migrationRoot,
          "20260722145757_phase3b1_benchmark_framework",
          "migration.sql",
        ),
      ),
    });

    const client = new PrismaClient({ datasourceUrl: databaseUrl });
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
