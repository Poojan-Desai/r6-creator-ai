import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { validateStudioAudioIdentity } from "@/lib/studio-audio";

describe("Creator Studio audio upload validation", () => {
  it.each([
    ["voice.wav", "audio/wav"],
    ["voice.mp3", "audio/mpeg"],
    ["music.m4a", "audio/mp4"],
    ["music.flac", "audio/flac"],
  ])("accepts supported local audio %s", (filename, mimeType) => {
    expect(() => validateStudioAudioIdentity(filename, mimeType)).not.toThrow();
  });

  it.each([
    ["voice.exe", "audio/wav", "INVALID_AUDIO_EXTENSION"],
    ["voice.wav", "text/plain", "INVALID_AUDIO_TYPE"],
  ])("rejects unsafe audio identity %s", (filename, mimeType, code) => {
    try {
      validateStudioAudioIdentity(filename, mimeType);
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(code);
    }
  });
});
