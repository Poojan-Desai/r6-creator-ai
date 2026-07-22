import { describe, expect, it } from "vitest";

import { aggregateStyleProfile } from "@/lib/style-profiles";

type AggregationReference = Parameters<typeof aggregateStyleProfile>[0][number];

function reference(
  id: string,
  values: Record<string, unknown>,
): AggregationReference {
  return {
    id,
    title: `Reference ${id}`,
    referenceType: "LOCAL_VIDEO",
    creatorName: "Owned Channel",
    game: "Rainbow Six Siege",
    platform: "Shorts",
    sourceType: "OWN_CREATION",
    sourceUrl: null,
    youtubeVideoId: null,
    contentCategory: "High energy",
    notes: null,
    permissionConfirmed: true,
    permissionConfirmedAt: new Date(),
    originalFilename: `${id}.mp4`,
    sourceRelativePath: `references/${id}/source.mp4`,
    mimeType: "video/mp4",
    fileSizeBytes: BigInt(100),
    durationSeconds: 30,
    width: 1920,
    height: 1080,
    frameRate: 60,
    thumbnailText: null,
    metadataSource: "LOCAL_FFPROBE",
    publicMetadataJson: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    styleAnalyses: [
      {
        features: Object.entries(values).map(([key, value], index) => ({
          id: `${id}-${index}`,
          analysisId: `${id}-analysis`,
          key,
          label: key,
          valueJson: JSON.stringify(value),
          originalValueJson: JSON.stringify(value),
          unit: null,
          confidence: 0.75,
          evidence: "Test evidence",
          source: "MEASURED",
          detectorVersion: "test-v1",
          manuallyCorrected: false,
          correctionNote: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      },
    ],
  };
}

describe("Creator Style Profile aggregation", () => {
  it("aggregates structured characteristics and explains the result", () => {
    const result = aggregateStyleProfile([
      reference("one", {
        total_video_duration: 24,
        estimated_opening_hook_duration: 2,
        time_until_first_meaningful_action: 2.4,
        approximate_cut_frequency: 8,
        speech_percentage: 60,
        average_title_length: 6,
        thumbnail_text_length: 3,
        uses_humor: { detected: true },
        uses_educational_explanations: { detected: false },
        uses_storytelling: { detected: true },
        uses_high_energy_reactions: { detected: true },
        result_first_opening: true,
        action_to_reaction_timing: 0.8,
      }),
      reference("two", {
        total_video_duration: 30,
        estimated_opening_hook_duration: 3,
        time_until_first_meaningful_action: 3.2,
        approximate_cut_frequency: 10,
        speech_percentage: 50,
        average_title_length: 8,
        thumbnail_text_length: 4,
        uses_humor: { detected: true },
        uses_educational_explanations: { detected: true },
        uses_storytelling: { detected: false },
        uses_high_energy_reactions: { detected: true },
        result_first_opening: true,
        action_to_reaction_timing: 1.2,
      }),
    ]);

    expect(result.preferredVideoLengthSeconds).toBe(27);
    expect(result.preferredHookLengthSeconds).toBe(2.5);
    expect(result.energyLevel).toBe(100);
    expect(result.humorLevel).toBe(100);
    expect(result.educationalLevel).toBe(50);
    expect(result.titleStyle).toBe("Compact story-led");
    expect(result.thumbnailTextStyle).toBe("Very short impact phrase");
    expect(
      result.features.find((item) => item.key === "action_start")?.reason,
    ).toContain("2.8 seconds");
    expect(
      result.features.every((item) => item.sourceReferenceCount >= 0),
    ).toBe(true);
  });

  it("does not derive preferred phrases or copied wording", () => {
    const result = aggregateStyleProfile([
      reference("owned", { total_video_duration: 20 }),
    ]);
    expect(Object.keys(result)).not.toContain("preferredPhrases");
    expect(JSON.stringify(result)).not.toContain("catchphrase");
  });
});
