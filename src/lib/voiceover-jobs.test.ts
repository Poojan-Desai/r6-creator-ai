import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { appConfig } from "@/lib/config";
import { probeStudioAudio } from "@/lib/studio-audio";
import {
  buildVoiceoverCaptionExtractionArguments,
  buildVoiceoverProcessingArguments,
  voiceoverProcessingSettingsSchema,
} from "@/lib/voiceover-jobs";

const temporaryDirectory = mkdtempSync(
  path.join(tmpdir(), "r6-voiceover-processing-"),
);

afterAll(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("U5 local voiceover processing", () => {
  it("builds bounded trim, cleanup, normalization, and gain arguments", () => {
    const args = buildVoiceoverProcessingArguments({
      inputPath: "/safe/original.wav",
      outputPath: "/safe/processed.m4a",
      settings: {
        trimStartSeconds: 0.25,
        trimEndSeconds: 4.75,
        normalize: true,
        noiseReduction: true,
        gainDb: 1.5,
      },
    });

    expect(args.join(" ")).toContain("-ss 0.250 -t 4.500");
    expect(args.join(" ")).toContain("afftdn=nf=-25:tn=1");
    expect(args.join(" ")).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(args.join(" ")).toContain("volume=1.500dB");
    expect(args.at(-1)).toBe("/safe/processed.m4a");
  });

  it("rejects a trim range with no usable narration", () => {
    expect(() =>
      voiceoverProcessingSettingsSchema.parse({
        trimStartSeconds: 4,
        trimEndSeconds: 4.01,
        normalize: false,
        noiseReduction: false,
        gainDb: 0,
      }),
    ).toThrow(/end must be after/i);
  });

  it("extracts only 16 kHz mono PCM for local captions", () => {
    const args = buildVoiceoverCaptionExtractionArguments({
      inputPath: "/safe/narration.m4a",
      outputPath: "/safe/narration.wav",
    });

    expect(args.join(" ")).toContain("-ac 1 -ar 16000 -c:a pcm_s16le");
    expect(args.at(-1)).toBe("/safe/narration.wav");
  });

  it.skipIf(!appConfig.ffmpegPath)(
    "creates a separate playable processed asset without changing its source",
    async () => {
      const sourcePath = path.join(temporaryDirectory, "source.wav");
      const outputPath = path.join(temporaryDirectory, "processed.m4a");
      execFileSync(appConfig.ffmpegPath!, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=523:sample_rate=48000:duration=3",
        "-c:a",
        "pcm_s16le",
        "-y",
        sourcePath,
      ]);
      const sourceSize = statSync(sourcePath).size;
      execFileSync(
        appConfig.ffmpegPath!,
        buildVoiceoverProcessingArguments({
          inputPath: sourcePath,
          outputPath,
          settings: {
            trimStartSeconds: 0.25,
            trimEndSeconds: 2.5,
            normalize: true,
            noiseReduction: false,
            gainDb: 0,
          },
        }),
        { timeout: 30_000 },
      );

      const metadata = await probeStudioAudio(outputPath);
      expect(statSync(sourcePath).size).toBe(sourceSize);
      expect(statSync(outputPath).size).toBeGreaterThan(1_000);
      expect(metadata.durationSeconds).toBeGreaterThan(2.1);
      expect(metadata.durationSeconds).toBeLessThan(2.4);
    },
    30_000,
  );
});
