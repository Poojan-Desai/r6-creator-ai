import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { formatDuration, parseTimeInput, validateClipRange } from "@/lib/time";

describe("parseTimeInput", () => {
  it.each([
    ["15", 15],
    ["01:30", 90],
    ["1:02:03.5", 3723.5],
    [12.25, 12.25],
  ])("parses %s", (input, expected) => {
    expect(parseTimeInput(input)).toBe(expected);
  });

  it.each(["", "one minute", "1:61", "1:2:3:4", "-3"])(
    "rejects %s",
    (input) => {
      expect(parseTimeInput(input)).toBeNaN();
    },
  );
});

describe("validateClipRange", () => {
  it("normalizes a valid range", () => {
    expect(validateClipRange("00:10", "00:25.5", 60)).toEqual({
      startSeconds: 10,
      endSeconds: 25.5,
      durationSeconds: 15.5,
    });
  });

  it.each([
    ["20", "10", "INVALID_CLIP_RANGE"],
    ["10", "61", "CLIP_OUT_OF_RANGE"],
    ["wrong", "20", "INVALID_TIMESTAMP"],
  ])("rejects an invalid range", (start, end, code) => {
    try {
      validateClipRange(start, end, 60);
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(code);
    }
  });
});

describe("formatDuration", () => {
  it("formats short and long durations", () => {
    expect(formatDuration(65.9)).toBe("1:05");
    expect(formatDuration(3723)).toBe("1:02:03");
  });
});
