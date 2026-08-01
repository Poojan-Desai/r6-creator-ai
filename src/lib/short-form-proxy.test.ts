import { describe, expect, it } from "vitest";

import {
  buildShortFormExportPlan,
  buildShortFormProxyPlan,
  wrapCaptionForRender,
} from "@/lib/short-form-proxy";
import {
  addTimelineItem,
  createDefaultTimelineDocument,
  createTimelineItem,
  normalizeTimelineDocument,
} from "@/lib/timeline-document";

describe("U3 low-resolution proxy render plan", () => {
  it("wraps long captions to the current render width", () => {
    const wrapped = wrapCaptionForRender(
      "And so, my fellow Americans, ask not what your country can do for you; ask what you can do for your country.",
      640,
      18,
    );
    const lines = wrapped.split("\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(
      52,
    );
  });

  it("builds deterministic vertical FFmpeg arguments for split-speed edits", () => {
    const original = createDefaultTimelineDocument({
      sourceProjectId: "video",
      sourceStartSeconds: 10,
      sourceEndSeconds: 20,
      aspectRatio: "VERTICAL_9_16",
      targetDurationSeconds: 30,
    });
    const edited = normalizeTimelineDocument({
      ...original,
      items: original.items.map((item) => ({
        ...item,
        speed: 0.5,
        freezeFrameSeconds: 1,
        transitionIn: "FADE" as const,
        transitionOut: "FADE" as const,
      })),
    });
    const withText = addTimelineItem(
      edited,
      createTimelineItem({
        id: "overlay",
        kind: "TEXT_OVERLAY",
        track: "OVERLAY",
        text: "Action: now",
        timelineStartSeconds: 2,
        durationSeconds: 3,
      }),
    );
    const plan = buildShortFormProxyPlan({
      document: withText,
      sources: [
        {
          id: "video",
          absolutePath: "/safe/source.mp4",
          audioStreamIndex: 1,
        },
      ],
      media: [],
      outputPath: "/safe/preview.mp4",
    });

    expect(plan).toMatchObject({
      width: 360,
      height: 640,
      durationSeconds: 21,
    });
    expect(plan.arguments).toContain("/safe/source.mp4");
    expect(plan.arguments.at(-1)).toBe("/safe/preview.mp4");
    const filter =
      plan.arguments[plan.arguments.indexOf("-filter_complex") + 1];
    expect(filter).toContain("atempo=0.500");
    expect(filter).toContain("tpad=stop_mode=clone");
    expect(filter).toContain("setpts=N/(30*TB)");
    expect(filter).toContain("text='Action\\: now'");
    expect(filter).toContain("concat=n=1:v=1:a=0");
    expect(filter).toContain("concat=n=1:v=0:a=1");
  });

  it("mixes confirmed local voiceover and requests gameplay ducking", () => {
    const original = createDefaultTimelineDocument({
      sourceProjectId: "video",
      sourceStartSeconds: 0,
      sourceEndSeconds: 10,
      aspectRatio: "HORIZONTAL_16_9",
      targetDurationSeconds: 15,
    });
    const withVoiceover = addTimelineItem(
      original,
      createTimelineItem({
        id: "voice",
        kind: "VOICEOVER",
        track: "VOICEOVER",
        mediaAssetId: "voice-asset",
        durationSeconds: 5,
        timelineStartSeconds: 1,
        duckOtherAudio: true,
      }),
    );
    const plan = buildShortFormProxyPlan({
      document: withVoiceover,
      sources: [
        {
          id: "video",
          absolutePath: "/safe/source.mp4",
          audioStreamIndex: null,
        },
      ],
      media: [
        {
          id: "voice-asset",
          absolutePath: "/safe/voice.wav",
          durationSeconds: 5,
        },
      ],
      outputPath: "/safe/preview.mp4",
    });
    expect(plan.width).toBe(640);
    expect(plan.height).toBe(360);
    expect(plan.arguments).toContain("/safe/voice.wav");
    const filter =
      plan.arguments[plan.arguments.indexOf("-filter_complex") + 1];
    expect(filter).toContain("sidechaincompress");
    expect(filter).toContain("amix=inputs=2");
  });

  it("combines every ducking narration track before compressing gameplay", () => {
    const original = createDefaultTimelineDocument({
      sourceProjectId: "video",
      sourceStartSeconds: 0,
      sourceEndSeconds: 10,
      aspectRatio: "HORIZONTAL_16_9",
      targetDurationSeconds: 15,
    });
    const first = addTimelineItem(
      original,
      createTimelineItem({
        id: "voice-one",
        kind: "VOICEOVER",
        track: "VOICEOVER",
        mediaAssetId: "voice-one",
        durationSeconds: 3,
        timelineStartSeconds: 1,
        duckOtherAudio: true,
      }),
    );
    const timeline = addTimelineItem(
      first,
      createTimelineItem({
        id: "voice-two",
        kind: "VOICEOVER",
        track: "VOICEOVER",
        mediaAssetId: "voice-two",
        durationSeconds: 3,
        timelineStartSeconds: 5,
        duckOtherAudio: true,
      }),
    );
    const plan = buildShortFormProxyPlan({
      document: timeline,
      sources: [
        {
          id: "video",
          absolutePath: "/safe/source.mp4",
          audioStreamIndex: null,
        },
      ],
      media: [
        {
          id: "voice-one",
          absolutePath: "/safe/voice-one.wav",
          durationSeconds: 3,
        },
        {
          id: "voice-two",
          absolutePath: "/safe/voice-two.wav",
          durationSeconds: 3,
        },
      ],
      outputPath: "/safe/preview.mp4",
    });
    const filter =
      plan.arguments[plan.arguments.indexOf("-filter_complex") + 1];
    expect(filter).toContain(
      "[media0sidechain][media1sidechain]amix=inputs=2:duration=longest:normalize=0[combinedsidechain]",
    );
    expect(filter).toContain("[basea][combinedsidechain]sidechaincompress");
  });

  it("refuses to render a timeline with no visual items", () => {
    const original = createDefaultTimelineDocument({
      sourceProjectId: "video",
      sourceStartSeconds: 0,
      sourceEndSeconds: 10,
      aspectRatio: "SQUARE_1_1",
      targetDurationSeconds: 15,
    });
    expect(() =>
      buildShortFormProxyPlan({
        document: {
          ...original,
          currentDurationSeconds: 0,
          items: [],
        },
        sources: [],
        media: [],
        outputPath: "/safe/preview.mp4",
      }),
    ).toThrow(/at least one source-video or card/i);
  });
});

describe("U3 full-resolution export render plan", () => {
  it.each([
    ["VERTICAL_9_16", 1080, 1920],
    ["HORIZONTAL_16_9", 1920, 1080],
    ["SQUARE_1_1", 1080, 1080],
    ["PORTRAIT_4_5", 1080, 1350],
  ] as const)(
    "maps %s to %d×%d H.264 export settings",
    (ratio, width, height) => {
      const document = createDefaultTimelineDocument({
        sourceProjectId: "video",
        sourceStartSeconds: 2,
        sourceEndSeconds: 5,
        aspectRatio: ratio,
        targetDurationSeconds: 15,
      });
      const plan = buildShortFormExportPlan({
        document,
        sources: [
          {
            id: "video",
            absolutePath: "/safe/source.mp4",
            audioStreamIndex: 1,
          },
        ],
        media: [],
        outputPath: "/safe/final.mp4",
      });
      expect(plan.width).toBe(width);
      expect(plan.height).toBe(height);
      expect(plan.arguments).toContain("medium");
      expect(plan.arguments).toContain("20");
      expect(plan.arguments).toContain("192k");
      expect(plan.specification).toMatchObject({
        renderMode: "EXPORT",
        width,
        height,
        videoCodec: "h264",
        audioCodec: "aac",
        videoCrf: 20,
      });
    },
  );
});
