import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { parseIso8601Duration, parseYouTubeUrl } from "@/lib/youtube";

describe("YouTube URL parsing", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=4", "dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("normalizes %s", (url, videoId) => {
    expect(parseYouTubeUrl(url)).toEqual({
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    });
  });

  it.each([
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "https://youtube.com/watch?v=too-short",
    "https://youtube.com/@creator",
    "not a URL",
  ])("rejects unsupported or unsafe input: %s", (url) => {
    expect(() => parseYouTubeUrl(url)).toThrow(AppError);
  });

  it("parses official API duration values", () => {
    expect(parseIso8601Duration("PT1H2M3.5S")).toBe(3723.5);
    expect(parseIso8601Duration("PT45S")).toBe(45);
    expect(parseIso8601Duration("unknown")).toBeNull();
  });
});
