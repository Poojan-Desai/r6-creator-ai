import { describe, expect, it } from "vitest";
import {
  fingerprint,
  formatTime,
  importProject,
  MAX_SOURCE_BYTES,
  parseTime,
  projectSchema,
  safeDownloadName,
  validateFile,
  validateRange,
  type Project,
} from "./model";

export function fixture(): Project {
  return {
    schema: "r6-browser-project/v1",
    id: crypto.randomUUID(),
    title: "Test project",
    updatedAt: new Date().toISOString(),
    ownershipConfirmed: true,
    sourceSaved: true,
    notes: "[00:02] Checked doorway",
    media: {
      name: "test.mp4",
      size: 1000,
      fingerprint: "a".repeat(64),
      duration: 600,
      width: 1920,
      height: 1080,
      codec: "avc",
      audio: [{ number: 1, name: "Mic", codec: "aac" }],
    },
    clips: [
      {
        id: crypto.randomUUID(),
        name: "Review",
        start: 1.25,
        end: 5.8,
        audioTrack: 1,
      },
    ],
  };
}
describe("browser media boundaries", () => {
  it.each([0, MAX_SOURCE_BYTES + 1])("rejects invalid size %s", (size) =>
    expect(() =>
      validateFile({ name: "x.mp4", type: "video/mp4", size }),
    ).toThrow(),
  );
  it("rejects misleading extensions and MIME types", () => {
    expect(() =>
      validateFile({ name: "x.exe", type: "video/mp4", size: 10 }),
    ).toThrow();
    expect(() =>
      validateFile({ name: "x.mp4", type: "text/html", size: 10 }),
    ).toThrow();
    expect(() =>
      validateFile({ name: "x.MOV", type: "", size: 10 }),
    ).not.toThrow();
  });
  it.each([
    [NaN, 5, 10],
    [0, Infinity, 10],
    [-1, 2, 10],
    [5, 5, 10],
    [5, 11, 10],
    [0, 301, 500],
    [0, 0.01, 10],
  ])("rejects unsafe clipping %s %s %s", (start, end, duration) =>
    expect(() => validateRange(start, end, duration)).toThrow(),
  );
  it("accepts precise non-keyframe timestamps and exact upper boundary", () =>
    expect(() => validateRange(1.25, 300.75, 300.75)).not.toThrow());
  it("parses timestamps without accepting invalid clock components", () => {
    expect(parseTime("01:02:03.125")).toBe(3723.125);
    expect(parseTime("35.5")).toBe(35.5);
    for (const bad of ["1:60", "-2", "1e3", "", "1:2:3:4", "Infinity"])
      expect(parseTime(bad)).toBeNaN();
    expect(parseTime(formatTime(3723.125))).toBe(3723.125);
  });
  it("bounds filename output", () =>
    expect(safeDownloadName("../../bad<script>/clip", "mp4")).toBe(
      "bad-script-clip.mp4",
    ));
  it("detects relink changes without reading a whole recording", async () => {
    const large = new Blob([new Uint8Array(200000)]);
    // Fingerprinting calls arrayBuffer only on bounded slices, never the file.
    Object.defineProperty(large, "arrayBuffer", {
      value: () => {
        throw new Error("Whole source read");
      },
    });
    expect(await fingerprint(large)).toHaveLength(64);
    expect(await fingerprint(new Blob(["one"]))).not.toBe(
      await fingerprint(new Blob(["two"])),
    );
  });
});
describe("portable browser projects", () => {
  it("restores as a new project requiring a local recording", () => {
    const original = fixture(),
      restored = importProject(JSON.stringify(original));
    expect(restored.id).not.toBe(original.id);
    expect(restored.sourceSaved).toBe(false);
    expect(restored.clips).toEqual(original.clips);
    expect(restored.notes).toBe(original.notes);
  });
  it("rejects unconfirmed ownership, invalid ranges, missing audio and duplicate clips", () => {
    const project = fixture();
    expect(
      projectSchema.safeParse({ ...project, ownershipConfirmed: false })
        .success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({
        ...project,
        clips: [{ ...project.clips[0], end: 700 }],
      }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({
        ...project,
        clips: [{ ...project.clips[0], audioTrack: 9 }],
      }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({
        ...project,
        clips: [...project.clips, ...project.clips],
      }).success,
    ).toBe(false);
  });
  it("rejects malformed and oversized backups", () => {
    expect(() => importProject("{")).toThrow();
    expect(() => importProject("a".repeat(200001))).toThrow();
  });
});
