import { describe, expect, it } from "vitest";

import { reactionType } from "@/lib/detectors/transcript-detectors";
import {
  DEFAULT_TRANSCRIPT_RULES,
  matchTranscriptRule,
  transcriptRulePatternSchema,
  type TranscriptRulePattern,
} from "@/lib/transcript-rules";

function pattern(
  overrides: Partial<TranscriptRulePattern> = {},
): TranscriptRulePattern {
  return transcriptRulePatternSchema.parse({
    schemaVersion: "r6-transcript-pattern/v1",
    phrases: ["dead"],
    regexes: [],
    negations: ["not", "never"],
    ambiguousPhrases: [],
    contextBeforeLines: 1,
    contextAfterLines: 1,
    repetitionBoost: true,
    ...overrides,
  });
}

describe("versioned transcript rule definitions", () => {
  it("provides one inspectable default for every requested evidence category", () => {
    expect(DEFAULT_TRANSCRIPT_RULES).toHaveLength(19);
    expect(
      new Set(DEFAULT_TRANSCRIPT_RULES.map((rule) => rule.category)).size,
    ).toBe(19);
    expect(
      new Set(DEFAULT_TRANSCRIPT_RULES.map((rule) => rule.stableId)).size,
    ).toBe(19);
  });

  it("rejects invalid, lookbehind, backreference, and nested-repetition regexes", () => {
    for (const regex of ["(", "(?<=no) way", "(no) \\1", "(a+)+$"]) {
      expect(() =>
        transcriptRulePatternSchema.parse({
          schemaVersion: "r6-transcript-pattern/v1",
          phrases: [],
          regexes: [regex],
        }),
      ).toThrow();
    }
  });

  it("requires at least one phrase or validated expression", () => {
    expect(() =>
      transcriptRulePatternSchema.parse({
        schemaVersion: "r6-transcript-pattern/v1",
        phrases: [],
        regexes: [],
      }),
    ).toThrow(/at least one/i);
  });
});

describe("transcript evidence matching", () => {
  it("records nearby negation and lowers confidence", () => {
    const matches = matchTranscriptRule("I am not dead after all", {
      pattern: pattern(),
      confidence: 0.8,
    });
    expect(matches[0]).toMatchObject({ exactText: "dead", negated: true });
    expect(matches[0]?.confidence).toBeLessThan(0.5);
    expect(matches[0]?.warnings.join(" ")).toMatch(/negation/i);
  });

  it("marks context-dependent phrases as ambiguous and preserves exact text", () => {
    const matches = matchTranscriptRule("No way, no way!", {
      pattern: pattern({
        phrases: ["no way"],
        ambiguousPhrases: ["no way"],
      }),
      confidence: 0.7,
    });
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      exactText: "No way",
      ambiguous: true,
      repeated: true,
    });
    expect(matches[0]?.confidence).toBeLessThan(0.7);
  });

  it("does not turn reaction wording into psychological certainty", () => {
    expect(reactionType(null)).toBe("UNCLASSIFIED_STRONG_VOCAL_REACTION");
    expect(reactionType("TRANSCRIPT_SURPRISE")).toBe("POSSIBLE_SURPRISE");
    expect(reactionType("TRANSCRIPT_FRUSTRATION")).toBe("POSSIBLE_FRUSTRATION");
  });
});
