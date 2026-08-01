import { describe, expect, it } from "vitest";

import {
  buildLongFormFinalizeArguments,
  buildLongFormRenderManifest,
  buildLongFormSoftwareFallbackArguments,
  LONG_FORM_RENDER_PIPELINE_VERSION,
  splitLongFormTimelineForRendering,
} from "@/lib/long-form-render-plan";
import {
  createLongFormTimelineItem,
  normalizeLongFormTimeline,
  type LongFormTimelineDocument,
} from "@/lib/long-form-timeline-document";

function document(durationSeconds = 305): LongFormTimelineDocument {
  return normalizeLongFormTimeline({
    version: "u4-long-form-timeline-v1",
    sourcePlanRevisionId: "plan-revision",
    sourcePlanVersion: 2,
    aspectRatio: "HORIZONTAL_16_9",
    targetDurationSeconds: durationSeconds,
    currentDurationSeconds: durationSeconds,
    sources: [
      {
        projectId: "video",
        name: "Owned recording",
        durationSeconds: 1_000,
      },
    ],
    sections: [
      {
        id: "section",
        kind: "CHAPTER",
        title: "Chapter",
        order: 0,
        locked: false,
        reason: "Test section.",
        evidence: [],
        warnings: [],
      },
    ],
    items: [
      createLongFormTimelineItem({
        id: "source",
        kind: "SOURCE_VIDEO",
        track: "VIDEO",
        sectionId: "section",
        durationSeconds,
        sourceProjectId: "video",
        sourceStartSeconds: 10,
        sourceEndSeconds: 10 + durationSeconds,
      }),
    ],
    notes: "Test",
    rebalanceWarnings: [],
  });
}

describe("long-form segmented render planning", () => {
  it("splits long ranges into bounded deterministic segments", () => {
    const segments = splitLongFormTimelineForRendering(document(), 120);
    expect(segments.map((segment) => segment.durationSeconds)).toEqual([
      120, 120, 65,
    ]);
    expect(
      segments.every(
        (segment) =>
          segment.document.currentDurationSeconds <= 120 &&
          segment.document.items[0]?.timelineStartSeconds === 0,
      ),
    ).toBe(true);
  });

  it("keeps overlays inside the segment that intersects them", () => {
    const input = document(305);
    input.items.push(
      createLongFormTimelineItem({
        id: "caption",
        kind: "CAPTION",
        track: "OVERLAY",
        text: "Evidence-bounded caption",
        timelineStartSeconds: 118,
        durationSeconds: 5,
      }),
    );
    const segments = splitLongFormTimelineForRendering(input, 120);
    expect(segments[0]?.document.items).toHaveLength(2);
    expect(segments[1]?.document.items).toHaveLength(2);
    expect(segments[0]?.document.items[1]?.durationSeconds).toBe(2);
    expect(segments[1]?.document.items[1]?.timelineStartSeconds).toBe(0);
  });

  it("keeps a later recording that starts at source zero inside valid bounds", () => {
    const input = document(305);
    input.sources.push({
      projectId: "second-video",
      name: "Second owned recording",
      durationSeconds: 20,
    });
    input.items.push(
      createLongFormTimelineItem({
        id: "second-source",
        kind: "SOURCE_VIDEO",
        track: "VIDEO",
        sectionId: "section",
        order: 1,
        durationSeconds: 20,
        sourceProjectId: "second-video",
        sourceStartSeconds: 0,
        sourceEndSeconds: 20,
      }),
    );
    const normalized = normalizeLongFormTimeline(input);

    const segments = splitLongFormTimelineForRendering(normalized, 120);

    expect(segments).toHaveLength(4);
    expect(
      segments[3]?.document.items[0]?.sourceStartSeconds,
    ).toBeGreaterThanOrEqual(0);
    expect(segments[3]?.document.items[0]?.sourceStartSeconds).toBe(0);
    expect(segments[3]?.document.items[0]?.sourceEndSeconds).toBe(20);
  });

  it("builds preview and export manifests with separate dimensions", () => {
    const source = {
      id: "video",
      absolutePath: "/tmp/owned.mp4",
      audioStreamIndex: 1,
    };
    const preview = buildLongFormRenderManifest({
      document: document(),
      kind: "PREVIEW",
      sources: [source],
      media: [],
      temporaryDirectory: "/tmp/preview",
    });
    const output = buildLongFormRenderManifest({
      document: document(),
      kind: "EXPORT",
      sources: [source],
      media: [],
      temporaryDirectory: "/tmp/export",
    });
    expect(preview).toMatchObject({
      pipelineVersion: LONG_FORM_RENDER_PIPELINE_VERSION,
      width: 640,
      height: 360,
      segmentCount: 3,
    });
    expect(output).toMatchObject({ width: 1920, height: 1080 });
    expect(output.segments[0]?.plan.arguments.join(" ")).toContain(
      "-preset veryfast",
    );
  });

  it("builds a VideoToolbox plan with a deterministic software fallback", () => {
    const output = buildLongFormRenderManifest({
      document: document(),
      kind: "EXPORT",
      sources: [
        {
          id: "video",
          absolutePath: "/tmp/owned.mp4",
          audioStreamIndex: 1,
        },
      ],
      media: [],
      temporaryDirectory: "/tmp/export",
      preferHardwareEncoder: true,
    });
    const hardware = output.segments[0]!.plan.arguments;
    expect(hardware).toContain("h264_videotoolbox");
    expect(hardware.join(" ")).toContain("-b:v 8M");
    const fallback = buildLongFormSoftwareFallbackArguments(hardware);
    expect(fallback).toContain("libx264");
    expect(fallback.join(" ")).toContain("-preset veryfast -crf 22");
    expect(fallback).not.toContain("h264_videotoolbox");
  });

  it("copies video while mixing permission-checked timeline audio", () => {
    const input = document(305);
    input.items.push(
      createLongFormTimelineItem({
        id: "voice",
        kind: "VOICEOVER",
        track: "VOICEOVER",
        mediaAssetId: "voice-asset",
        timelineStartSeconds: 3,
        durationSeconds: 10,
        duckOtherAudio: true,
      }),
    );
    const args = buildLongFormFinalizeArguments({
      document: input,
      media: [
        {
          id: "voice-asset",
          absolutePath: "/tmp/voice.m4a",
          durationSeconds: 12,
        },
      ],
      concatPath: "/tmp/concat.mp4",
      outputPath: "/tmp/output.mp4",
      kind: "EXPORT",
    });
    expect(args).toContain("copy");
    expect(args.join(" ")).toContain("sidechaincompress");
    expect(args.join(" ")).toContain("adelay=3000");
  });

  it("uses every ducking narration track as combined sidechain evidence", () => {
    const input = document(305);
    input.items.push(
      createLongFormTimelineItem({
        id: "voice-one",
        kind: "VOICEOVER",
        track: "VOICEOVER",
        mediaAssetId: "voice-one",
        timelineStartSeconds: 3,
        durationSeconds: 10,
        duckOtherAudio: true,
      }),
      createLongFormTimelineItem({
        id: "voice-two",
        kind: "VOICEOVER",
        track: "VOICEOVER",
        mediaAssetId: "voice-two",
        timelineStartSeconds: 20,
        durationSeconds: 8,
        duckOtherAudio: true,
      }),
    );
    const args = buildLongFormFinalizeArguments({
      document: input,
      media: [
        {
          id: "voice-one",
          absolutePath: "/tmp/voice-one.m4a",
          durationSeconds: 12,
        },
        {
          id: "voice-two",
          absolutePath: "/tmp/voice-two.m4a",
          durationSeconds: 10,
        },
      ],
      concatPath: "/tmp/concat.mp4",
      outputPath: "/tmp/output.mp4",
      kind: "EXPORT",
    });
    const filter = args[args.indexOf("-filter_complex") + 1];
    expect(filter).toContain(
      "[media0sidechain][media1sidechain]amix=inputs=2:duration=longest:normalize=0[combinedsidechain]",
    );
    expect(filter).toContain("[baseaudio][combinedsidechain]sidechaincompress");
  });
});
