import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import {
  buildClipArguments,
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
    });
  });

  it("rejects files without a video stream", () => {
    expect(() =>
      normalizeProbeOutput({ streams: [{ codec_type: "audio" }] }),
    ).toThrow(AppError);
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
