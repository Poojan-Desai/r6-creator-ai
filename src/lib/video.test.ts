import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import {
  buildClipArguments,
  normalizeAudioTracks,
  normalizeProbeOutput,
  parseFrameRate,
} from "@/lib/video";

describe("video metadata", () => {
  it("parses rational frame rates", () => {
    expect(parseFrameRate("30000/1001")).toBeCloseTo(29.97, 2);
    expect(parseFrameRate("60/1")).toBe(60);
  });

  it("normalizes FFprobe output", () => {
    expect(
      normalizeProbeOutput({
        streams: [
          {
            codec_type: "video",
            width: 1920,
            height: 1080,
            avg_frame_rate: "60000/1001",
          },
        ],
        format: { duration: "125.250" },
      }),
    ).toEqual({
      durationSeconds: 125.25,
      width: 1920,
      height: 1080,
      frameRate: expect.closeTo(59.94, 2),
      audioTracks: [],
    });
  });

  it("rejects files without a video stream", () => {
    expect(() =>
      normalizeProbeOutput({ streams: [{ codec_type: "audio" }] }),
    ).toThrow(AppError);
  });
});

describe("audio track metadata", () => {
  it("recommends a clearly named creator microphone over game audio", () => {
    const tracks = normalizeAudioTracks([
      {
        index: 1,
        codec_type: "audio",
        codec_name: "aac",
        channels: 2,
        tags: { title: "Game Audio" },
        disposition: { default: 1 },
      },
      {
        index: 2,
        codec_type: "audio",
        codec_name: "aac",
        channels: 1,
        tags: { title: "Creator Microphone" },
      },
    ]);

    expect(tracks).toHaveLength(2);
    expect(tracks[0]?.preferenceScore).toBeLessThan(0);
    expect(tracks[1]).toMatchObject({
      streamIndex: 2,
      title: "Creator Microphone",
      preferenceScore: 100,
    });
  });

  it("does not strongly recommend ambiguous multi-track audio", () => {
    const tracks = normalizeAudioTracks([
      { index: 1, codec_type: "audio", channels: 2 },
      { index: 2, codec_type: "audio", channels: 2 },
    ]);

    expect(tracks.map((track) => track.preferenceScore)).toEqual([0, 0]);
  });

  it("marks the only audio stream as safe to preselect", () => {
    expect(
      normalizeAudioTracks([
        { index: 1, codec_type: "audio", codec_name: "aac", channels: 2 },
      ])[0],
    ).toMatchObject({ preferenceScore: 100 });
  });
});

describe("FFmpeg arguments", () => {
  it("uses direct argument values and a browser-friendly MP4 output", () => {
    const args = buildClipArguments(
      "/videos/input.mp4",
      "/clips/output.tmp.mp4",
      12.5,
      8.25,
    );
    expect(args).toContain("12.500");
    expect(args).toContain("8.250");
    expect(args).toContain("libx264");
    expect(args).toContain("+faststart");
    expect(args.at(-1)).toBe("/clips/output.tmp.mp4");
  });
});
