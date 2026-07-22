import { describe, expect, it } from "vitest";

import { TemplateContentSuggestionProvider } from "@/lib/content-writing/template-provider";
import { CONTENT_TONES } from "@/lib/content-writing/types";

const context = {
  projectName: "Ranked Night",
  clipName: "Kitchen clutch",
  startSeconds: 42.5,
  endSeconds: 61.25,
  durationSeconds: 18.75,
  transcript:
    "Hold on, I hear one by the door. Now we swing together and finish the round.",
};

describe("local template content provider", () => {
  it.each(CONTENT_TONES)(
    "creates all six fields in the %s tone",
    async (tone) => {
      const provider = new TemplateContentSuggestionProvider();
      const result = await provider.generate(context, tone);

      expect(provider.id).toBe("local-template-v1");
      expect(result.openingHook.length).toBeGreaterThan(10);
      expect(result.voiceoverScript).toContain("Hold on");
      expect(result.youtubeTitle).toContain("Kitchen clutch");
      expect(result.shortFormCaption).toContain("#RainbowSixSiege");
      expect(result.thumbnailText.split(/\s+/).length).toBeLessThanOrEqual(5);
      expect(result.editingInstructions).toContain("42.5s");
    },
  );

  it("keeps very long transcript input bounded", async () => {
    const provider = new TemplateContentSuggestionProvider();
    const result = await provider.generate(
      { ...context, transcript: "spoken words ".repeat(200) },
      "Natural",
    );
    expect(result.voiceoverScript.length).toBeLessThan(1_000);
  });
});
