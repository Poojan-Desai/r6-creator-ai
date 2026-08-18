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

describe("cloud AI usage migration", () => {
  it("persists consent, budget preflight, usage, and safe status across restart", async () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "r6-cloud-ai-migration-"),
    );
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, "test.db");
    const migrationRoot = path.join(process.cwd(), "prisma", "migrations");
    const migrations = readdirSync(migrationRoot)
      .filter((entry) => /^\d+/.test(entry))
      .sort();
    for (const migration of migrations) {
      execFileSync("sqlite3", [databasePath], {
        input: readFileSync(
          path.join(migrationRoot, migration, "migration.sql"),
        ),
      });
    }

    const client = new PrismaClient({ datasourceUrl: `file:${databasePath}` });
    await client.studioProject.create({
      data: {
        id: "studio",
        name: "Private studio",
        outputGoal: "YOUTUBE_SHORT",
        inputMode: "SCREEN_RECORDING_ONLY",
      },
    });
    await client.cloudAiRequest.create({
      data: {
        id: "request",
        studioProjectId: "studio",
        model: "gpt-5.6-luna",
        status: "COMPLETED",
        consentedAt: new Date("2026-08-18T12:00:00Z"),
        promptFingerprint: "a".repeat(64),
        estimatedInputTokens: 500,
        maxOutputTokens: 2_000,
        estimatedCostMicros: 2_500,
        pricingJson: JSON.stringify({ input: 0.2, output: 1.2 }),
        inputTokens: 450,
        outputTokens: 300,
        actualCostMicros: 450,
        responseId: "resp_test",
        completedAt: new Date("2026-08-18T12:00:01Z"),
      },
    });
    await client.$disconnect();

    const reopened = new PrismaClient({
      datasourceUrl: `file:${databasePath}`,
    });
    const saved = await reopened.cloudAiRequest.findUnique({
      where: { id: "request" },
      include: { studioProject: true },
    });
    expect(saved?.studioProject.name).toBe("Private studio");
    expect(saved?.status).toBe("COMPLETED");
    expect(saved?.promptFingerprint).toBe("a".repeat(64));
    expect(saved?.actualCostMicros).toBe(450);
    expect(saved).not.toHaveProperty("prompt");
    await reopened.$disconnect();
  });
});
