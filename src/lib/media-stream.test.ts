import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { parseByteRange } from "@/lib/media-stream";

describe("parseByteRange", () => {
  it.each([
    ["bytes=0-99", { start: 0, end: 99, length: 100 }],
    ["bytes=100-", { start: 100, end: 999, length: 900 }],
    ["bytes=-50", { start: 950, end: 999, length: 50 }],
    ["bytes=900-2000", { start: 900, end: 999, length: 100 }],
  ])("parses %s", (header, expected) => {
    expect(parseByteRange(header, 1000)).toEqual(expected);
  });

  it("returns null when no range was requested", () => {
    expect(parseByteRange(null, 1000)).toBeNull();
  });

  it.each([
    "bytes=",
    "items=0-5",
    "bytes=1000-",
    "bytes=20-10",
    "bytes=0-1,4-5",
  ])("rejects %s", (header) => {
    expect(() => parseByteRange(header, 1000)).toThrow(AppError);
  });
});
