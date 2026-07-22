import { describe, expect, it } from "vitest";

import {
  buildAudioExtractionArguments,
  buildWhisperArguments,
  getRecommendedTrackId,
  parseFfmpegProgress,
  parseWhisperJson,
  parseWhisperProgress,
  type AudioTrackDto,
} from "@/lib/transcription";

function track(id: string, preferenceScore: number): AudioTrackDto {
  return {
    id,
    streamIndex: Number(id),
    codecName: "aac",
    channels: 2,
    channelLayout: "stereo",
    language: null,
    title: null,
    isDefault: false,
    preferenceScore,
    preferenceReason: null,
  };
}

describe("transcription process arguments", () => {
  it("extracts only the explicitly selected audio stream as a 16 kHz mono WAV", () => {
    const args = buildAudioExtractionArguments(
      "/recordings/source.mp4",
      "/temporary/selected.wav",
      3,
    );
    expect(args).toContain("0:3");
    expect(args).toContain("16000");
    expect(args).toContain("pcm_s16le");
    expect(args).not.toContain("0:a");
    expect(args.at(-1)).toBe("/temporary/selected.wav");
  });

  it("requests timestamped JSON and CPU-accelerated local Whisper", () => {
    const args = buildWhisperArguments(
      "/temporary/selected.wav",
      "/temporary/transcript",
    );
    expect(args).toContain("-oj");
    expect(args).toContain("-pp");
    expect(args).toContain("-ng");
    expect(args).toContain("en");
  });
});

describe("transcription progress", () => {
  it("normalizes FFmpeg extraction progress", () => {
    expect(
      parseFfmpegProgress("out_time_us=5000000\nprogress=continue", 10),
    ).toBe(50);
    expect(parseFfmpegProgress("progress=end", 10)).toBeNull();
  });

  it("reads the latest Whisper progress line", () => {
    expect(
      parseWhisperProgress(
        "whisper_print_progress_callback: progress = 20%\nprogress = 73%",
      ),
    ).toBe(73);
    expect(parseWhisperProgress("loading model")).toBeNull();
  });
});

describe("Whisper JSON", () => {
  it("turns millisecond offsets into saved timestamped segments", () => {
    expect(
      parseWhisperJson({
        transcription: [
          {
            offsets: { from: 1250, to: 4700 },
            text: "  Watch this angle.  ",
          },
          { offsets: { from: 4700, to: 5100 }, text: " " },
        ],
      }),
    ).toEqual([
      {
        segmentOrder: 0,
        startSeconds: 1.25,
        endSeconds: 4.7,
        text: "Watch this angle.",
      },
    ]);
  });

  it("rejects malformed process output", () => {
    expect(() => parseWhisperJson({ result: {} })).toThrow(
      "Whisper did not return transcript segments",
    );
  });
});

describe("audio recommendation", () => {
  it("preselects the only track", () => {
    expect(getRecommendedTrackId([track("1", -100)])).toBe("1");
  });

  it("selects a uniquely strong creator-mic match", () => {
    expect(getRecommendedTrackId([track("1", -50), track("2", 100)])).toBe("2");
  });

  it("leaves ambiguous multi-track recordings unselected", () => {
    expect(getRecommendedTrackId([track("1", 25), track("2", 0)])).toBeNull();
    expect(
      getRecommendedTrackId([track("1", 100), track("2", 100)]),
    ).toBeNull();
  });
});
