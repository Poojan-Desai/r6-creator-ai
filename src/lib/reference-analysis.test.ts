import { describe, expect, it } from "vitest";

import {
  buildReferenceAudioSignalArguments,
  buildReferenceVideoSignalArguments,
  computeReferenceStyleFeatures,
  parseReferenceSignalOutput,
} from "@/lib/reference-analysis";

describe("reference signal process arguments", () => {
  it("uses documented local FFmpeg signal filters", () => {
    const video = buildReferenceVideoSignalArguments("/owned/reference.mp4");
    const audio = buildReferenceAudioSignalArguments("/temporary/creator.wav");
    expect(video.join(" ")).toContain("blackdetect");
    expect(video.join(" ")).toContain("gt(scene,0.18)");
    expect(audio.join(" ")).toContain("silencedetect");
    expect(audio.join(" ")).toContain("RMS_level");
    expect(video).not.toContain("http");
  });
});

describe("reference signal parsing", () => {
  it("parses scene, black, silence, and one-second energy evidence", () => {
    const result = parseReferenceSignalOutput(
      [
        "showinfo pts_time:2.400 pos:10",
        "showinfo pts_time:2.400 pos:11",
        "black_start:5 black_end:5.5 black_duration:0.5",
      ].join("\n"),
      [
        "silence_start: 1.2",
        "silence_end: 2.0 | silence_duration: 0.8",
        "frame:0 pts:0 pts_time:0",
        "lavfi.astats.Overall.RMS_level=-12.5",
      ].join("\n"),
    );

    expect(result.sceneChanges).toEqual([2.4]);
    expect(result.blackFrames).toEqual([
      { startSeconds: 5, endSeconds: 5.5, durationSeconds: 0.5 },
    ]);
    expect(result.silenceIntervals).toEqual([
      { startSeconds: 1.2, endSeconds: 2, durationSeconds: 0.8 },
    ]);
    expect(result.energyCurve[0]).toMatchObject({
      timeSeconds: 0,
      rmsDb: -12.5,
    });
  });
});

describe("structured style features", () => {
  it("returns every requested characteristic with confidence and evidence", () => {
    const features = computeReferenceStyleFeatures({
      durationSeconds: 30,
      title: "How I won this round",
      thumbnailText: "WAIT FOR IT",
      audioTrackTitle: "Creator Microphone",
      transcript: [
        {
          segmentOrder: 0,
          startSeconds: 0.5,
          endSeconds: 3,
          text: "Watch this angle, because here is why it works?",
        },
        {
          segmentOrder: 1,
          startSeconds: 4,
          endSeconds: 7,
          text: "Then no way, that was funny! Follow for more.",
        },
      ],
      signals: {
        sceneChanges: [2.4, 8, 16],
        blackFrames: [
          { startSeconds: 15.8, endSeconds: 16, durationSeconds: 0.2 },
        ],
        silenceIntervals: [
          { startSeconds: 10, endSeconds: 12, durationSeconds: 2 },
        ],
        energyCurve: [
          { timeSeconds: 0, rmsDb: -35, normalized: 0.42 },
          { timeSeconds: 3, rmsDb: -10, normalized: 0.83 },
        ],
      },
    });

    expect(features.length).toBeGreaterThanOrEqual(28);
    expect(new Set(features.map((item) => item.key)).size).toBe(
      features.length,
    );
    expect(features.every((item) => item.evidence.length > 0)).toBe(true);
    expect(
      features.every((item) => item.confidence >= 0 && item.confidence <= 1),
    ).toBe(true);
    expect(
      features.find((item) => item.key === "result_first_opening")?.source,
    ).toBe("ESTIMATED");
    expect(
      features.find((item) => item.key === "caption_density")?.source,
    ).toBe("UNAVAILABLE");
    expect(
      features.find((item) => item.key === "uses_questions")?.value,
    ).toEqual({ detected: true, count: 1 });
  });

  it("does not invent transcript or OCR values when evidence is missing", () => {
    const features = computeReferenceStyleFeatures({
      durationSeconds: 12,
      title: "Owned clip",
      thumbnailText: null,
      audioTrackTitle: null,
      transcript: [],
      signals: {
        sceneChanges: [],
        blackFrames: [],
        silenceIntervals: [],
        energyCurve: [],
      },
    });
    const byKey = new Map(features.map((item) => [item.key, item]));
    expect(byKey.get("caption_density")?.value).toBeNull();
    expect(byKey.get("voiceover_live_audio_balance")?.value).toBeNull();
    expect(byKey.get("speech_rate")?.source).toBe("UNAVAILABLE");
  });
});
