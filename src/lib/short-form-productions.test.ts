import { describe, expect, it } from "vitest";

import { TemplateContentSuggestionProvider } from "@/lib/content-writing/template-provider";
import {
  createDefaultStoryPlan,
  storyPlanSchema,
  writingPackageSchema,
} from "@/lib/short-form-productions";

describe("U3 short-form planning and local writing", () => {
  it("creates an ordered story plan that ends exactly at the target", () => {
    const plan = createDefaultStoryPlan({
      targetDurationSeconds: 30,
      candidateStartSeconds: 100,
      candidatePeakSeconds: 109,
      candidateEndSeconds: 118,
      mainEvent: "High-action gameplay candidate",
      evidence: ["Motion rose above the local rolling baseline."],
    });

    expect(storyPlanSchema.parse(plan)).toEqual(plan);
    expect(plan.sections[0]?.startSeconds).toBe(0);
    expect(plan.sections.at(-1)?.endSeconds).toBe(30);
    expect(plan.sections[2]?.endSeconds).toBe(20.4);
    expect(plan.sections.map((section) => section.kind)).toEqual([
      "HOOK",
      "SETUP",
      "ACTION",
      "PAYOFF",
      "ENDING",
    ]);
  });

  it("generates an original package from bounded facts and repeats unknowns for review", async () => {
    const provider = new TemplateContentSuggestionProvider();
    const writing = await provider.generateShortFormPackage(
      {
        projectName: "Ranked session",
        candidate: {
          mainEvent: "High-action gameplay candidate",
          category: "HIGH_ACTION_GAMEPLAY",
          startSeconds: 100,
          peakSeconds: 109,
          endSeconds: 118,
          eventConfidence: 0.7,
          contentPotentialScore: 58,
          styleSimilarity: null,
          explanation: "Motion and audio overlap.",
          missingEvidence: ["No synchronized replay fact."],
        },
        platform: "YOUTUBE_SHORTS",
        aspectRatio: "VERTICAL_9_16",
        targetDurationSeconds: 30,
        contentInstructions: "Keep uncertainty explicit.",
        focusAreas: ["Best kills"],
        evidence: [
          {
            source: "VIDEO",
            summary: "Motion rose above the local rolling baseline.",
            timestampSeconds: 109,
            confidence: 0.8,
          },
        ],
        transcriptExcerpt: "",
        userConfirmedContext: [],
        styleProfile: null,
        unknowns: [
          "Map, operator, player count, intent, and outcome are unconfirmed.",
        ],
      },
      "Natural",
    );

    expect(writingPackageSchema.parse(writing)).toEqual(writing);
    expect(writing.hooks).toHaveLength(3);
    expect(writing.fullVoiceover).toContain(
      "Motion rose above the local rolling baseline.",
    );
    expect(writing.factsNeedingConfirmation).toContain(
      "Map, operator, player count, intent, and outcome are unconfirmed.",
    );
    expect(writing.fullVoiceover).not.toMatch(/\b1v[1-5]\b/i);
    expect(writing.fullVoiceover).not.toContain("baseline..");
  });

  it("rejects overlapping or out-of-order story sections", () => {
    const plan = createDefaultStoryPlan({
      targetDurationSeconds: 15,
      candidateStartSeconds: 0,
      candidatePeakSeconds: 5,
      candidateEndSeconds: 10,
      mainEvent: "Creator-reaction candidate",
      evidence: [],
    });
    plan.sections[1]!.startSeconds = plan.sections[0]!.endSeconds - 1;
    expect(() => storyPlanSchema.parse(plan)).toThrow(/timeline order/i);
  });
});
