import { describe, expect, it } from "vitest";

import {
  createEvidenceBoundedLongFormPlan,
  longFormPlanSchema,
  longFormSettingsSchema,
} from "@/lib/long-form-productions";

const defaultSettings = longFormSettingsSchema.parse({
  targetDurationSeconds: 1_200,
  storytellingStyle: "STORYTELLING",
  energyLevel: 65,
  humorLevel: 35,
  educationalLevel: 25,
  liveGameplayPercent: 75,
  voiceoverPercent: 25,
  matchOrRoundLimit: 4,
  excludeWeakSections: true,
  includeLosses: true,
  chronologicalOrder: true,
});

describe("U4 evidence-bounded long-form planning", () => {
  it("creates a contiguous exact 20-minute plan from sufficient source", () => {
    const plan = createEvidenceBoundedLongFormPlan({
      projectName: "Owned ranked session",
      focusAreas: ["Full ranked-match story"],
      contentInstructions: "Keep the pacing natural.",
      context: ["Map: Oregon", "Side: attack"],
      recordings: [
        {
          id: "recording-1",
          name: "Full match recording",
          durationSeconds: 1_238.157,
          sortOrder: 0,
        },
      ],
      candidates: [
        {
          candidateId: "candidate-1",
          label: "High-action gameplay candidate",
          projectId: "recording-1",
          startSeconds: 800,
          peakSeconds: 812,
          endSeconds: 826,
          eventConfidence: 0.71,
          contentPotentialScore: 62,
          reviewDecision: "USEFUL",
          evidence: ["Motion and creator-audio peaks overlap."],
          unknowns: ["The exact gameplay result is not confirmed."],
        },
      ],
      selectedMatchesAndRounds: [],
      settings: defaultSettings,
    });

    expect(longFormPlanSchema.parse(plan)).toEqual(plan);
    expect(plan.durationFit).toBe("EXACT");
    expect(plan.proposedDurationSeconds).toBe(1_200);
    expect(plan.sections[0]?.outputStartSeconds).toBe(0);
    expect(plan.sections.at(-1)?.outputEndSeconds).toBe(1_200);
    expect(plan.sections).toHaveLength(10);
    expect(plan.importantMoments[0]?.candidateId).toBe("candidate-1");
    expect(plan.titleOptions).toHaveLength(3);
    expect(plan.thumbnailConcepts).toHaveLength(3);
    expect(plan.unknowns.join(" ")).toMatch(/not a prediction/i);
  });

  it("shortens the plan instead of stretching an insufficient recording", () => {
    const plan = createEvidenceBoundedLongFormPlan({
      projectName: "Short source",
      focusAreas: [],
      contentInstructions: null,
      context: [],
      recordings: [
        {
          id: "recording-short",
          name: "Ten minute recording",
          durationSeconds: 600,
          sortOrder: 0,
        },
      ],
      candidates: [],
      selectedMatchesAndRounds: [],
      settings: defaultSettings,
    });

    expect(plan.durationFit).toBe("SOURCE_SHORTFALL");
    expect(plan.proposedDurationSeconds).toBe(600);
    expect(plan.warnings.join(" ")).toMatch(/shorter|stretching/i);
    expect(plan.metrics.estimatedRemovedSeconds).toBe(0);
  });

  it("requires live gameplay and voiceover shares to total 100 percent", () => {
    expect(() =>
      longFormSettingsSchema.parse({
        ...defaultSettings,
        liveGameplayPercent: 80,
        voiceoverPercent: 30,
      }),
    ).toThrow(/add up to 100/i);
  });
});
