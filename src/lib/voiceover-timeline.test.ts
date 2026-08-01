import { describe, expect, it } from "vitest";

import {
  createLongFormTimelineItem,
  normalizeLongFormTimeline,
  type LongFormTimelineDocument,
} from "@/lib/long-form-timeline-document";
import { createDefaultTimelineDocument } from "@/lib/timeline-document";
import {
  placeVoiceoverOnLongFormTimeline,
  placeVoiceoverOnShortFormTimeline,
} from "@/lib/voiceover-timeline";

function take(
  overrides: Partial<
    Parameters<typeof placeVoiceoverOnShortFormTimeline>[0]["take"]
  > = {},
) {
  return {
    id: "take-one",
    scriptSectionKey: "opening",
    alignmentStartSeconds: 1.5,
    isActive: true,
    asset: {
      id: "processed-one",
      durationSeconds: 5,
    },
    captions: [
      {
        segmentOrder: 0,
        startSeconds: 0.25,
        endSeconds: 1.25,
        text: "First caption",
      },
    ],
    ...overrides,
  };
}

function longFormDocument(): LongFormTimelineDocument {
  return normalizeLongFormTimeline({
    version: "u4-long-form-timeline-v1",
    sourcePlanRevisionId: "plan-revision",
    sourcePlanVersion: 1,
    aspectRatio: "HORIZONTAL_16_9",
    targetDurationSeconds: 300,
    currentDurationSeconds: 30,
    sources: [
      {
        projectId: "recording",
        name: "Owned recording",
        durationSeconds: 30,
      },
    ],
    sections: [
      {
        id: "opening",
        kind: "OPENING_TEASER",
        title: "Opening",
        order: 0,
        locked: false,
        reason: "Test opening.",
        evidence: [],
        warnings: [],
      },
    ],
    items: [
      createLongFormTimelineItem({
        id: "source",
        sectionId: "opening",
        kind: "SOURCE_VIDEO",
        track: "VIDEO",
        sourceProjectId: "recording",
        sourceStartSeconds: 0,
        sourceEndSeconds: 30,
        durationSeconds: 30,
      }),
    ],
    notes: "Test",
    rebalanceWarnings: [],
  });
}

describe("U5 voiceover timeline placement", () => {
  it("aligns one active take and editable captions on a short timeline", () => {
    const document = createDefaultTimelineDocument({
      sourceProjectId: "recording",
      sourceStartSeconds: 0,
      sourceEndSeconds: 20,
      aspectRatio: "VERTICAL_9_16",
      targetDurationSeconds: 30,
    });
    const placed = placeVoiceoverOnShortFormTimeline({
      document,
      take: take(),
      action: "ADD_OR_REPLACE",
      includeCaptions: true,
    });

    expect(
      placed.items.find((item) => item.kind === "VOICEOVER"),
    ).toMatchObject({
      mediaAssetId: "processed-one",
      timelineStartSeconds: 1.5,
      durationSeconds: 5,
      duckOtherAudio: true,
    });
    expect(placed.items.find((item) => item.kind === "CAPTION")).toMatchObject({
      text: "First caption",
      timelineStartSeconds: 1.75,
      durationSeconds: 1,
    });
  });

  it("re-recording replaces only the same script section and can remove it", () => {
    const document = createDefaultTimelineDocument({
      sourceProjectId: "recording",
      sourceStartSeconds: 0,
      sourceEndSeconds: 20,
      aspectRatio: "VERTICAL_9_16",
      targetDurationSeconds: 30,
    });
    const first = placeVoiceoverOnShortFormTimeline({
      document,
      take: take(),
      action: "ADD_OR_REPLACE",
      includeCaptions: true,
    });
    const replacement = placeVoiceoverOnShortFormTimeline({
      document: first,
      take: take({
        id: "take-two",
        asset: { id: "processed-two", durationSeconds: 4 },
      }),
      action: "ADD_OR_REPLACE",
      includeCaptions: false,
    });

    expect(
      replacement.items.filter((item) => item.kind === "VOICEOVER"),
    ).toHaveLength(1);
    expect(
      replacement.items.find((item) => item.kind === "VOICEOVER")?.mediaAssetId,
    ).toBe("processed-two");
    expect(
      replacement.items.filter((item) => item.kind === "CAPTION"),
    ).toHaveLength(0);

    const removed = placeVoiceoverOnShortFormTimeline({
      document: replacement,
      take: take({ id: "take-two" }),
      action: "REMOVE",
      includeCaptions: false,
    });
    expect(
      removed.items.filter((item) => item.kind === "VOICEOVER"),
    ).toHaveLength(0);
  });

  it("keeps long-form section ownership and rejects unsafe placement", () => {
    const placed = placeVoiceoverOnLongFormTimeline({
      document: longFormDocument(),
      take: take(),
      action: "ADD_OR_REPLACE",
      includeCaptions: true,
    });
    expect(
      placed.items.find((item) => item.kind === "VOICEOVER"),
    ).toMatchObject({
      sectionId: "opening",
      mediaAssetId: "processed-one",
      duckOtherAudio: true,
    });
    expect(() =>
      placeVoiceoverOnLongFormTimeline({
        document: longFormDocument(),
        take: take({ isActive: false }),
        action: "ADD_OR_REPLACE",
        includeCaptions: true,
      }),
    ).toThrow(/active take/i);
    expect(() =>
      placeVoiceoverOnLongFormTimeline({
        document: longFormDocument(),
        take: take({ alignmentStartSeconds: 30 }),
        action: "ADD_OR_REPLACE",
        includeCaptions: true,
      }),
    ).toThrow(/inside the current video timeline/i);
  });
});
