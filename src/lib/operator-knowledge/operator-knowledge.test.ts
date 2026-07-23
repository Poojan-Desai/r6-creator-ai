import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import {
  FUTURE_OPERATOR_GROUND_TRUTH_CATEGORIES,
  type FutureOperatorDetectionResult,
} from "@/lib/operator-knowledge/future-detection";
import {
  OFFICIAL_OPERATOR_DETAILS,
  OFFICIAL_OPERATOR_ROSTER,
} from "@/lib/operator-knowledge/official-roster";
import { validateOperatorImportDocument } from "@/lib/operator-knowledge/service";

function document() {
  return {
    schemaVersion: "r6-creator-operator-knowledge/v1",
    operatorDataVersion: "test-v1",
    gameSeason: { year: 11, seasonName: "Test", seasonNumber: 2 },
    sourceMetadata: {
      title: "Official source",
      url: "https://www.ubisoft.com/test",
      retrievedAt: "2026-07-22T00:00:00.000Z",
      lastVerifiedAt: "2026-07-22T00:00:00.000Z",
    },
    creationMetadata: {
      application: "R6 Creator AI",
      createdAt: "2026-07-22T00:00:00.000Z",
    },
    operator: {
      stableId: "test-operator",
      slug: "test-operator",
      canonicalName: "Test",
      displayName: "Test",
      side: "ATTACKER",
      squad: null,
      sourceType: "USER_ENTERED",
      officialSourceUrl: "https://www.ubisoft.com/test",
      officialSourceTitle: "Official source",
      retrievedAt: "2026-07-22T00:00:00.000Z",
      lastVerifiedAt: "2026-07-22T00:00:00.000Z",
      confidence: 1,
      versions: [
        {
          stableId: "test-operator:v1",
          versionKey: "v1",
          versionName: "Version 1",
          isCurrent: true,
          officialSpecialties: ["intel"],
          officialAbilityName: null,
          officialAbilitySummary: null,
          plainLanguageExplanation: null,
          structuredAbility: {},
          knowledgeStatus: "UNVERIFIED",
          sourceType: "USER_ENTERED",
          sourceUrl: "https://www.ubisoft.com/test",
          sourceTitle: "Official source",
          confidence: 1,
          lastVerifiedAt: "2026-07-22T00:00:00.000Z",
          tacticalNotes: null,
        },
      ],
    },
  };
}

describe("operator knowledge fixtures and import validation", () => {
  it("contains every operator shown in the retrieved official directory", () => {
    expect(OFFICIAL_OPERATOR_ROSTER).toHaveLength(77);
    expect(OFFICIAL_OPERATOR_ROSTER).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: "solid-snake", side: "ATTACKER" }),
        expect.objectContaining({ slug: "denari", side: "DEFENDER" }),
        expect.objectContaining({ slug: "dokkaebi", side: "ATTACKER" }),
      ]),
    );
  });

  it("keeps representative ability facts and loadouts structured", () => {
    expect(OFFICIAL_OPERATOR_DETAILS.thermite).toMatchObject({
      abilityName: "Exothermic Charge",
      communityRoles: expect.arrayContaining(["hard-breach"]),
    });
    expect(OFFICIAL_OPERATOR_DETAILS.dokkaebi?.structuredAbility).toMatchObject(
      { remaster: "Operation System Override, Year 11 Season 2" },
    );
  });

  it("accepts the current versioned import schema", () => {
    expect(validateOperatorImportDocument(document()).operator.slug).toBe(
      "test-operator",
    );
  });

  it("rejects private paths and duplicate stable IDs", () => {
    expect(() =>
      validateOperatorImportDocument({
        ...document(),
        privatePath: "/Users/me/file",
      }),
    ).toThrow(AppError);
    const duplicate = document();
    duplicate.operator.versions.push({ ...duplicate.operator.versions[0]! });
    expect(() => validateOperatorImportDocument(duplicate)).toThrow(AppError);
  });

  it("rejects invalid sides, confidence, and unsupported schemas", () => {
    expect(() =>
      validateOperatorImportDocument({
        ...document(),
        schemaVersion: "r6-creator-operator-knowledge/v99",
      }),
    ).toThrow();
    expect(() =>
      validateOperatorImportDocument({
        ...document(),
        operator: { ...document().operator, side: "BOTH" },
      }),
    ).toThrow();
    expect(() =>
      validateOperatorImportDocument({
        ...document(),
        operator: { ...document().operator, confidence: 1.1 },
      }),
    ).toThrow();
  });

  it("defines future evidence without implementing operator recognition", () => {
    const result: FutureOperatorDetectionResult = {
      status: "OPERATOR_UNCERTAIN",
      possibleOperatorStableId: null,
      possibleOperatorVersionStableId: null,
      possibleAbilityStableId: null,
      possibleGadgetStableId: null,
      startSeconds: 1,
      peakSeconds: 2,
      endSeconds: 3,
      confidence: 0.2,
      supportingEvidence: [],
      conflictingEvidence: [],
      alternativeOperatorStableIds: [],
      missingEvidence: ["No user selection or reliable telemetry"],
      operatorVersionCompatibility: "UNKNOWN",
    };
    expect(result.status).toBe("OPERATOR_UNCERTAIN");
    expect(FUTURE_OPERATOR_GROUND_TRUTH_CATEGORIES).toContain(
      "UNIQUE_ABILITY_DEPLOYED",
    );
  });
});
