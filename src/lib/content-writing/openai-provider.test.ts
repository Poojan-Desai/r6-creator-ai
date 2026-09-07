import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { describe, expect, it, vi } from "vitest";

import {
  buildCloudWritingPrompt,
  cloudWritingPackageSchema,
  OpenAIContentSuggestionProvider,
} from "@/lib/content-writing/openai-provider";
import type { ShortFormContentContext } from "@/lib/content-writing/types";
import { writingPackageSchema } from "@/lib/content-writing/schema";

const testSecret = ["sk", "test", "placeholder"].join("-");

const context: ShortFormContentContext = {
  projectName: "Private source.mp4",
  candidate: {
    mainEvent: "High-action gameplay candidate",
    category: "HIGH_ACTION_GAMEPLAY",
    startSeconds: 40,
    peakSeconds: 46,
    endSeconds: 52,
    eventConfidence: 0.7,
    contentPotentialScore: 60,
    styleSimilarity: null,
    explanation: "Motion and audio rise near the selected peak.",
    missingEvidence: ["The exact outcome is unknown."],
  },
  platform: "YOUTUBE_SHORTS",
  aspectRatio: "VERTICAL_9_16",
  targetDurationSeconds: 30,
  contentInstructions: "Keep uncertainty explicit.",
  focusAreas: ["Visible decision"],
  evidence: [
    {
      source: "VIDEO",
      summary: "Motion rose above the local baseline.",
      timestampSeconds: 46,
      confidence: 0.8,
    },
  ],
  transcriptExcerpt: `Check /Users/player/Videos/source.mp4 and ${testSecret}. ${"spoken words ".repeat(500)}`,
  userConfirmedContext: [{ label: "Map", value: "Lair" }],
  styleProfile: null,
  unknowns: ["Round result is not confirmed."],
};

const validWriting = {
  hooks: ["Hook one", "Hook two", "Hook three"],
  fullVoiceover: "Full evidence-bounded voiceover.",
  shortVoiceover: "Short voiceover.",
  liveAudioOnly: "Use the selected original audio range only.",
  youtubeShortsTitle: "A Reviewed Rainbow Six Moment",
  tiktokCaption: "Reviewed moment #R6Siege",
  instagramCaption: "Reviewed moment #R6Siege",
  horizontalTitle: "A Reviewed Rainbow Six Moment",
  thumbnailText: "WATCH THE TURN",
  captionGuidance: "Caption only supplied transcript words.",
  editingPlan: "Keep the evidence peak visible.",
  structureMatchExplanation: "Uses only saved high-level preferences.",
  factsUsed: ["Motion rose above the local baseline."],
  factsNeedingConfirmation: ["Round result is not confirmed."],
};

describe("opt-in OpenAI content provider", () => {
  it("builds a bounded text-only prompt with local identifiers redacted", () => {
    const prompt = buildCloudWritingPrompt(context, "Natural");

    expect(prompt.user).not.toContain("Private source.mp4");
    expect(prompt.user).not.toContain("/Users/player");
    expect(prompt.user).not.toContain(testSecret);
    expect(prompt.user).not.toContain("source.mp4");
    expect(prompt.user).toContain("Motion rose above the local baseline");
    expect(prompt.user).toContain("Round result is not confirmed");
    expect(prompt.user.length).toBeLessThan(5_000);
  });

  it("uses Responses structured output and returns metered usage", async () => {
    expect(writingPackageSchema.parse(validWriting).hooks).toHaveLength(3);
    expect(zodTextFormat(cloudWritingPackageSchema, "test_writing").type).toBe(
      "json_schema",
    );
    const parse = vi.fn().mockResolvedValue({
      id: "resp_test",
      output_parsed: validWriting,
      usage: { input_tokens: 500, output_tokens: 250 },
    });
    const provider = new OpenAIContentSuggestionProvider({
      responses: { parse },
    } as unknown as OpenAI);

    const result = await provider.generateShortFormPackageWithUsage(
      context,
      "Natural",
    );

    expect(parse).toHaveBeenCalledOnce();
    expect(parse.mock.calls[0]?.[0].store).toBe(false);
    expect(parse.mock.calls[0]?.[0].text.format.type).toBe("json_schema");
    expect(result.writingPackage.hooks).toHaveLength(3);
    expect(result.usage).toEqual({
      responseId: "resp_test",
      inputTokens: 500,
      outputTokens: 250,
    });
  });

  it("rejects malformed structured output with a safe error code", async () => {
    const provider = new OpenAIContentSuggestionProvider({
      responses: {
        parse: vi.fn().mockResolvedValue({
          id: "resp_bad",
          output_parsed: { hooks: ["only one"] },
          usage: null,
        }),
      },
    } as unknown as OpenAI);

    await expect(
      provider.generateShortFormPackageWithUsage(context, "Natural"),
    ).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
    });
  });

  it("maps provider timeouts to a safe fallback code", async () => {
    const provider = new OpenAIContentSuggestionProvider({
      responses: {
        parse: vi
          .fn()
          .mockRejectedValue(new OpenAI.APIConnectionTimeoutError()),
      },
    } as unknown as OpenAI);

    await expect(
      provider.generateShortFormPackageWithUsage(context, "Natural"),
    ).rejects.toMatchObject({
      code: "TIMEOUT",
      message: "Cloud AI timed out before finishing.",
    });
  });
});
