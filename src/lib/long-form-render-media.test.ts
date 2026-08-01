import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appConfig } from "@/lib/config";
import {
  buildLongFormConcatArguments,
  buildLongFormFinalizeArguments,
  buildLongFormRenderManifest,
} from "@/lib/long-form-render-plan";
import {
  createLongFormTimelineItem,
  normalizeLongFormTimeline,
} from "@/lib/long-form-timeline-document";
import { probeVideo } from "@/lib/video";

const directory = mkdtempSync(path.join(tmpdir(), "r6-long-render-media-"));
const sourcePath = path.join(directory, "source.mp4");
const voicePath = path.join(directory, "voice.wav");
const concatListPath = path.join(directory, "segments.ffconcat");
const concatPath = path.join(directory, "concat.mp4");
const previewPath = path.join(directory, "preview.mp4");

describe.skipIf(!appConfig.ffmpegPath)(
  "U4 segmented long-form real-media render",
  () => {
    beforeAll(() => {
      execFileSync(appConfig.ffmpegPath!, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=size=640x360:rate=30:duration=7",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000:duration=7",
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
        "sine=frequency=660:sample_rate=48000:duration=2",
        "-c:a",
        "pcm_s16le",
        "-y",
        voicePath,
      ]);
    }, 30_000);

    afterAll(() => {
      rmSync(directory, { recursive: true, force: true });
    });

    it("renders, joins, mixes, and probes bounded preview segments", async () => {
      const document = normalizeLongFormTimeline({
        version: "u4-long-form-timeline-v1",
        sourcePlanRevisionId: "plan",
        sourcePlanVersion: 1,
        aspectRatio: "HORIZONTAL_16_9",
        targetDurationSeconds: 300,
        currentDurationSeconds: 6,
        sources: [
          {
            projectId: "video",
            name: "Generated owned fixture",
            durationSeconds: 7,
          },
        ],
        sections: [
          {
            id: "chapter",
            kind: "CHAPTER",
            title: "Chapter",
            order: 0,
            locked: false,
            reason: "Fixture.",
            evidence: [],
            warnings: [],
          },
        ],
        items: [
          createLongFormTimelineItem({
            id: "source",
            kind: "SOURCE_VIDEO",
            track: "VIDEO",
            sectionId: "chapter",
            sourceProjectId: "video",
            sourceStartSeconds: 0.5,
            sourceEndSeconds: 6.5,
            durationSeconds: 6,
          }),
          createLongFormTimelineItem({
            id: "caption",
            kind: "CAPTION",
            track: "OVERLAY",
            sectionId: "chapter",
            text: "Local segmented preview",
            timelineStartSeconds: 1,
            durationSeconds: 3,
          }),
          createLongFormTimelineItem({
            id: "voice",
            kind: "VOICEOVER",
            track: "VOICEOVER",
            sectionId: "chapter",
            mediaAssetId: "voice",
            timelineStartSeconds: 2,
            durationSeconds: 2,
            duckOtherAudio: true,
          }),
        ],
        notes: "Fixture.",
        rebalanceWarnings: [],
      });
      const media = [
        { id: "voice", absolutePath: voicePath, durationSeconds: 2 },
      ];
      const manifest = buildLongFormRenderManifest({
        document,
        kind: "PREVIEW",
        sources: [
          {
            id: "video",
            absolutePath: sourcePath,
            audioStreamIndex: 1,
          },
        ],
        media,
        temporaryDirectory: directory,
        maxSegmentSeconds: 2,
      });
      expect(manifest.segmentCount).toBe(3);
      for (const segment of manifest.segments) {
        execFileSync(appConfig.ffmpegPath!, segment.plan.arguments, {
          timeout: 30_000,
        });
      }
      writeFileSync(
        concatListPath,
        manifest.segments
          .map((segment) => `file '${segment.outputPath}'`)
          .join("\n")
          .concat("\n"),
      );
      execFileSync(
        appConfig.ffmpegPath!,
        buildLongFormConcatArguments({
          listPath: concatListPath,
          outputPath: concatPath,
        }),
        { timeout: 30_000 },
      );
      execFileSync(
        appConfig.ffmpegPath!,
        buildLongFormFinalizeArguments({
          document,
          media,
          concatPath,
          outputPath: previewPath,
          kind: "PREVIEW",
        }),
        { timeout: 30_000 },
      );
      expect(statSync(previewPath).size).toBeGreaterThan(20_000);
      const metadata = await probeVideo(previewPath);
      expect(metadata.width).toBe(640);
      expect(metadata.height).toBe(360);
      expect(metadata.durationSeconds).toBeGreaterThanOrEqual(5.9);
      expect(metadata.durationSeconds).toBeLessThanOrEqual(6.1);
      expect(metadata.audioTracks).toHaveLength(1);
    }, 60_000);
  },
);
