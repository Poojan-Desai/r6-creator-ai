import { describe, expect, it } from "vitest";

import {
  assertLabelWithinVideo,
  benchmarkLabelDocumentSchema,
  createBenchmarkLabelDocument,
  groundTruthLabelInputSchema,
  LABEL_SCHEMA_VERSION,
} from "@/lib/ground-truth";

const validLabel = {
  id: "label-1",
  projectId: "project-1",
  category: "KILL" as const,
  startSeconds: 10,
  peakSeconds: 11,
  endSeconds: 12,
  description: "Confirmed by the human labeler",
  humanConfidence: 0.9,
  approved: true,
  createdAt: "2026-07-22T12:00:00.000Z",
  updatedAt: "2026-07-22T12:00:00.000Z",
};

describe("ground-truth labels", () => {
  it("accepts ordered timestamps and rejects reversed ranges", () => {
    const input = {
      category: validLabel.category,
      startSeconds: validLabel.startSeconds,
      peakSeconds: validLabel.peakSeconds,
      endSeconds: validLabel.endSeconds,
      description: validLabel.description,
      humanConfidence: validLabel.humanConfidence,
      approved: validLabel.approved,
    };
    expect(groundTruthLabelInputSchema.parse(input).peakSeconds).toBe(11);
    expect(() =>
      groundTruthLabelInputSchema.parse({
        ...input,
        peakSeconds: 9,
      }),
    ).toThrow(/Peak time/);
  });

  it("rejects a label that extends past the video", () => {
    expect(() => assertLabelWithinVideo(validLabel, 11.5)).toThrow(
      /inside the recording/,
    );
  });

  it("exports a versioned path-free JSON document", () => {
    const document = createBenchmarkLabelDocument({
      fingerprint: "a".repeat(64),
      durationSeconds: 120,
      width: 1920,
      height: 1080,
      labels: [validLabel],
      createdAt: new Date("2026-07-22T12:00:00.000Z"),
    });
    expect(document.schemaVersion).toBe(LABEL_SCHEMA_VERSION);
    expect(document.timestampUnits).toBe("seconds");
    expect(document.labels[0]?.labelId).toBe("label-1");
    expect(JSON.stringify(document)).not.toContain("/Users/");
    expect(JSON.stringify(document)).not.toContain("source.mp4");
    expect(() => benchmarkLabelDocumentSchema.parse(document)).not.toThrow();
  });

  it("rejects unknown schemas and invalid fingerprints", () => {
    const document = createBenchmarkLabelDocument({
      fingerprint: "b".repeat(64),
      durationSeconds: 30,
      width: 1280,
      height: 720,
      labels: [],
    });
    expect(() =>
      benchmarkLabelDocumentSchema.parse({
        ...document,
        schemaVersion: "untrusted/v2",
      }),
    ).toThrow();
    expect(() =>
      benchmarkLabelDocumentSchema.parse({
        ...document,
        video: {
          ...document.video,
          fingerprint: { algorithm: "sha256", value: "not-a-hash" },
        },
      }),
    ).toThrow();
  });
});
