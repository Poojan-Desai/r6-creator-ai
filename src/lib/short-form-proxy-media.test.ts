import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appConfig } from "@/lib/config";
import {
  buildShortFormExportPlan,
  buildShortFormProxyPlan,
} from "@/lib/short-form-proxy";
import {
  addTimelineItem,
  createDefaultTimelineDocument,
  createTimelineItem,
  normalizeTimelineDocument,
  splitSourceTimelineItem,
} from "@/lib/timeline-document";
import { probeVideo } from "@/lib/video";

const directory = mkdtempSync(path.join(tmpdir(), "r6-proxy-media-"));
const sourcePath = path.join(directory, "source.mp4");
const voicePath = path.join(directory, "voice.wav");
const outputPath = path.join(directory, "preview.mp4");
const fullOutputPath = path.join(directory, "full-export.mp4");

describe.skipIf(!appConfig.ffmpegPath)("U3 proxy real-media render", () => {
  beforeAll(() => {
    execFileSync(appConfig.ffmpegPath!, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=30:duration=4",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=4",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-y",
      sourcePath,
    ]);
    execFileSync(appConfig.ffmpegPath!, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=660:sample_rate=48000:duration=3",
      "-c:a",
      "pcm_s16le",
      "-y",
      voicePath,
    ]);
  }, 30_000);

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("renders a playable low-resolution MP4 from the saved timeline plan", async () => {
    const document = addTimelineItem(
      createDefaultTimelineDocument({
        sourceProjectId: "video",
        sourceStartSeconds: 0.5,
        sourceEndSeconds: 3.5,
        aspectRatio: "VERTICAL_9_16",
        targetDurationSeconds: 15,
      }),
      createTimelineItem({
        id: "caption",
        kind: "CAPTION",
        track: "OVERLAY",
        text: "Local preview",
        timelineStartSeconds: 0.5,
        durationSeconds: 2,
      }),
    );
    const plan = buildShortFormProxyPlan({
      document,
      sources: [
        {
          id: "video",
          absolutePath: sourcePath,
          audioStreamIndex: 1,
        },
      ],
      media: [],
      outputPath,
    });
    execFileSync(appConfig.ffmpegPath!, plan.arguments, {
      timeout: 30_000,
    });
    const output = statSync(outputPath);
    expect(output.isFile()).toBe(true);
    expect(output.size).toBeGreaterThan(10_000);
    const metadata = await probeVideo(outputPath);
    expect(metadata.width).toBe(360);
    expect(metadata.height).toBe(640);
    expect(metadata.durationSeconds).toBeGreaterThanOrEqual(2.9);
    expect(metadata.durationSeconds).toBeLessThanOrEqual(3.1);
  }, 30_000);

  it("renders multiple segments, a card, a freeze, and ducked voiceover", async () => {
    const original = createDefaultTimelineDocument({
      sourceProjectId: "video",
      sourceStartSeconds: 0,
      sourceEndSeconds: 4,
      aspectRatio: "VERTICAL_9_16",
      targetDurationSeconds: 15,
    });
    const sourceId = original.items[0]!.id;
    const split = splitSourceTimelineItem(original, sourceId, 2, "second");
    const adjusted = normalizeTimelineDocument({
      ...split,
      items: split.items.map((item) =>
        item.id === "second"
          ? { ...item, speed: 0.75, freezeFrameSeconds: 1 }
          : item,
      ),
    });
    const card = createTimelineItem({
      id: "intro",
      kind: "CARD",
      track: "VIDEO",
      order: 0,
      durationSeconds: 1,
      text: "Intro",
    });
    const withCard = addTimelineItem(
      {
        ...adjusted,
        items: adjusted.items.map((item) =>
          item.track === "VIDEO" ? { ...item, order: item.order + 1 } : item,
        ),
      },
      card,
    );
    const withVoice = addTimelineItem(
      withCard,
      createTimelineItem({
        id: "voice",
        kind: "VOICEOVER",
        track: "VOICEOVER",
        mediaAssetId: "voice",
        durationSeconds: 3,
        duckOtherAudio: true,
      }),
    );
    const plan = buildShortFormProxyPlan({
      document: withVoice,
      sources: [
        {
          id: "video",
          absolutePath: sourcePath,
          audioStreamIndex: 1,
        },
      ],
      media: [{ id: "voice", absolutePath: voicePath, durationSeconds: 3 }],
      outputPath,
    });
    execFileSync(appConfig.ffmpegPath!, plan.arguments, {
      timeout: 30_000,
    });
    expect(statSync(outputPath).size).toBeGreaterThan(10_000);
    const metadata = await probeVideo(outputPath);
    expect(metadata.width).toBe(360);
    expect(metadata.height).toBe(640);
    expect(metadata.durationSeconds).toBeGreaterThanOrEqual(6.5);
    expect(metadata.durationSeconds).toBeLessThanOrEqual(6.8);
  }, 30_000);

  it("renders and probes a full-resolution horizontal H.264 and AAC MP4", async () => {
    const document = createDefaultTimelineDocument({
      sourceProjectId: "video",
      sourceStartSeconds: 0.5,
      sourceEndSeconds: 1.5,
      aspectRatio: "HORIZONTAL_16_9",
      targetDurationSeconds: 15,
    });
    const plan = buildShortFormExportPlan({
      document,
      sources: [
        {
          id: "video",
          absolutePath: sourcePath,
          audioStreamIndex: 1,
        },
      ],
      media: [],
      outputPath: fullOutputPath,
    });
    execFileSync(appConfig.ffmpegPath!, plan.arguments, {
      timeout: 30_000,
    });
    expect(statSync(fullOutputPath).size).toBeGreaterThan(20_000);
    const metadata = await probeVideo(fullOutputPath);
    expect(metadata.width).toBe(1920);
    expect(metadata.height).toBe(1080);
    expect(metadata.durationSeconds).toBeGreaterThanOrEqual(0.9);
    expect(metadata.durationSeconds).toBeLessThanOrEqual(1.1);
    expect(metadata.audioTracks).toHaveLength(1);
  }, 30_000);
});
