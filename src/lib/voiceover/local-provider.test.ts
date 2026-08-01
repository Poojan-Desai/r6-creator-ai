import { describe, expect, it } from "vitest";

import { LocalVoiceoverScriptProvider } from "@/lib/voiceover/local-provider";
import { voiceoverPackageSchema } from "@/lib/voiceover/types";

describe("local evidence-bounded voiceover provider", () => {
  it("uses confirmed facts and keeps unsupported details unknown", async () => {
    const provider = new LocalVoiceoverScriptProvider();
    const result = await provider.generate({
      projectName: "Owned match",
      targetType: "LONG_FORM",
      tone: "STORYTELLING",
      facts: [
        {
          category: "USER_CONFIRMED_CONTEXT",
          summary: "Map: Oregon",
          timestampSeconds: null,
          confidence: 1,
          userConfirmed: true,
        },
        {
          category: "VIDEO_OBSERVATION",
          summary: "Motion rises near 42 seconds",
          timestampSeconds: 42,
          confidence: 0.72,
          userConfirmed: false,
        },
        {
          category: "INFERENCE",
          summary: "This may be a kill",
          timestampSeconds: 42,
          confidence: 0.4,
          userConfirmed: false,
        },
        {
          category: "UNKNOWN",
          summary: "Enemy count is unknown",
          timestampSeconds: null,
          confidence: null,
          userConfirmed: false,
        },
      ],
      structure: [
        {
          key: "intro",
          title: "Intro",
          direction: "Introduce only confirmed context.",
        },
      ],
    });

    expect(voiceoverPackageSchema.parse(result)).toEqual(result);
    expect(result.fullScript).toContain("Map: Oregon");
    expect(result.fullScript).toContain("Motion rises near 42 seconds");
    expect(result.fullScript).not.toContain("This may be a kill");
    expect(result.unknowns).toContain("Enemy count is unknown");
    expect(result.sections).toHaveLength(1);
    expect(result.hooks).toHaveLength(3);
  });

  it("returns all required script variants without fabricating an outcome", async () => {
    const provider = new LocalVoiceoverScriptProvider();
    const result = await provider.generate({
      projectName: "Unreviewed session",
      targetType: "SHORT_FORM",
      tone: "NATURAL",
      facts: [
        {
          category: "UNKNOWN",
          summary: "The round outcome is unknown",
          timestampSeconds: null,
          confidence: null,
          userConfirmed: false,
        },
      ],
      structure: [],
    });

    expect(result.naturalVersion).toBeTruthy();
    expect(result.highEnergyVersion).toBeTruthy();
    expect(result.storytellingVersion).toBeTruthy();
    expect(result.educationalVersion).toBeTruthy();
    expect(result.liveAudioOnly).toMatch(/do not synthesize|clone/i);
    expect(result.fullScript).toMatch(/No gameplay result has been confirmed/i);
    expect(result.estimatedSpeakingSeconds).toBeGreaterThan(0);
  });
});
