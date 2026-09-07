import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

let directory: string;
let client: PrismaClient;
let usage: typeof import("./cloud-ai-usage");
beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "r6-ai-budget-"));
  const database = path.join(directory, "test.db");
  const migrations = path.join(process.cwd(), "prisma/migrations");
  for (const name of readdirSync(migrations)
    .filter((name) => /^\d/.test(name))
    .sort())
    execFileSync("sqlite3", [database], {
      input: readFileSync(path.join(migrations, name, "migration.sql")),
    });
  client = new PrismaClient({ datasourceUrl: `file:${database}` });
  vi.resetModules();
  vi.stubEnv("OPENAI_API_KEY", "synthetic-test-no-network");
  vi.stubEnv("OPENAI_MONTHLY_BUDGET_CENTS", "1");
  vi.doMock("@/lib/db", () => ({ db: client }));
  usage = await import("./cloud-ai-usage");
});
beforeEach(async () => {
  await client.cloudAiRequest.deleteMany();
  await client.studioProject.deleteMany();
  await client.studioProject.create({
    data: {
      id: "budget-studio",
      name: "Budget test",
      outputGoal: "YOUTUBE_SHORT",
      inputMode: "SCREEN_RECORDING_ONLY",
    },
  });
});
afterAll(async () => {
  await client?.$disconnect();
  vi.unstubAllEnvs();
  if (directory) rmSync(directory, { recursive: true, force: true });
});

describe("cloud usage accounting with real SQLite", () => {
  it("reserves concurrent requests without overspending the configured estimate budget", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        usage.reserveCloudAiRequest(
          "budget-studio",
          "Bounded synthetic evidence",
        ),
      ),
    );
    expect(attempts.some((attempt) => attempt.status === "fulfilled")).toBe(
      true,
    );
    expect(attempts.some((attempt) => attempt.status === "rejected")).toBe(
      true,
    );
    const requests = await client.cloudAiRequest.findMany();
    expect(
      requests.reduce((sum, request) => sum + request.estimatedCostMicros, 0),
    ).toBeLessThanOrEqual(10_000);
    expect(
      (await client.cloudAiBudgetLock.findUnique({ where: { id: "global" } }))
        ?.generation,
    ).toBeGreaterThan(0);
  });
  it("keeps a conservative reservation when the provider omits usage", async () => {
    const reservation = await usage.reserveCloudAiRequest(
      "budget-studio",
      "Evidence",
    );
    const saved = await usage.completeCloudAiRequest(reservation.id, {
      responseId: "synthetic",
      inputTokens: null,
      outputTokens: null,
    });
    expect(saved.actualCostMicros).toBeNull();
    expect(
      (await usage.getCloudAiStatus("budget-studio"))
        .monthlyReservedOrSpentCents,
    ).toBeGreaterThan(0);
  });
  it("retains spent charges after deleting their project", async () => {
    const reservation = await usage.reserveCloudAiRequest(
      "budget-studio",
      "Evidence",
    );
    await client.cloudAiRequest.update({
      where: { id: reservation.id },
      data: { actualCostMicros: 10_000, status: "COMPLETED" },
    });
    await client.studioProject.delete({ where: { id: "budget-studio" } });
    expect(
      (
        await client.cloudAiRequest.findUnique({
          where: { id: reservation.id },
        })
      )?.studioProjectId,
    ).toBeNull();
    expect(
      (await usage.getCloudAiStatus("another-project"))
        .monthlyReservedOrSpentCents,
    ).toBe(1);
    await expect(
      usage.reserveCloudAiRequest("another-project", "Evidence"),
    ).rejects.toMatchObject({ code: "CLOUD_AI_MONTHLY_BUDGET" });
  });
});
