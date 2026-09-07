import { describe, expect, it } from "vitest";

import {
  createCloudPreflight,
  estimateTokens,
  evaluateCloudBudget,
} from "@/lib/cloud-ai-usage";

describe("cloud AI preflight and budget limits", () => {
  it("creates a fingerprint and conservative token/cost estimate", () => {
    const first = createCloudPreflight("bounded evidence");
    const second = createCloudPreflight("bounded evidence");

    expect(estimateTokens("12345678")).toBe(8);
    expect(estimateTokens("🎮")).toBe(4);
    expect(first.promptFingerprint).toHaveLength(64);
    expect(first.promptFingerprint).toBe(second.promptFingerprint);
    expect(first.estimatedCostMicros).toBeGreaterThan(0);
    expect(first.maxOutputTokens).toBeGreaterThan(0);
  });

  it("blocks the project limit before another provider call", () => {
    expect(
      evaluateCloudBudget({
        monthlyBudgetCents: 100,
        projectRequestLimit: 10,
        projectRequestCount: 10,
        reservedOrSpentMicros: 0,
        estimatedCostMicros: 1,
      }),
    ).toBe("PROJECT_LIMIT");
  });

  it("blocks a request that would exceed the monthly budget", () => {
    expect(
      evaluateCloudBudget({
        monthlyBudgetCents: 1,
        projectRequestLimit: 10,
        projectRequestCount: 1,
        reservedOrSpentMicros: 9_900,
        estimatedCostMicros: 101,
      }),
    ).toBe("MONTHLY_BUDGET");
    expect(
      evaluateCloudBudget({
        monthlyBudgetCents: 0,
        projectRequestLimit: 10,
        projectRequestCount: 0,
        reservedOrSpentMicros: 0,
        estimatedCostMicros: 1,
      }),
    ).toBe("MONTHLY_BUDGET");
  });
});
