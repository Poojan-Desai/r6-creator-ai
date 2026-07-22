import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { validateUploadIdentity } from "@/lib/upload";

describe("upload identity validation", () => {
  it("accepts MP4 filenames and MIME types case-insensitively", () => {
    expect(() =>
      validateUploadIdentity("ranked.MP4", "video/mp4"),
    ).not.toThrow();
  });

  it.each([
    ["recording.mov", "video/quicktime", "INVALID_FILE_EXTENSION"],
    ["recording.mp4", "text/plain", "INVALID_FILE_TYPE"],
  ])("rejects %s", (filename, mimeType, code) => {
    try {
      validateUploadIdentity(filename, mimeType);
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(code);
    }
  });
});
