import { describe, expect, it } from "vitest";

import {
  addTimelineItem,
  createDefaultTimelineDocument,
  createTimelineItem,
  deleteTimelineItem,
  duplicateTimelineItem,
  moveTimelineItem,
  normalizeTimelineDocument,
  splitSourceTimelineItem,
  timelineDocumentSchema,
} from "@/lib/timeline-document";

describe("U3 non-destructive timeline document", () => {
  it("creates one bounded source item without changing source timestamps", () => {
    const document = createDefaultTimelineDocument({
      sourceProjectId: "video",
      sourceStartSeconds: 10,
      sourceEndSeconds: 22.5,
      aspectRatio: "VERTICAL_9_16",
      targetDurationSeconds: 30,
    });

    expect(timelineDocumentSchema.parse(document)).toEqual(document);
    expect(document.currentDurationSeconds).toBe(12.5);
    expect(document.items[0]).toMatchObject({
      kind: "SOURCE_VIDEO",
      sourceStartSeconds: 10,
      sourceEndSeconds: 22.5,
      speed: 1,
    });
  });

  it("recalculates duration for speed and freeze-frame edits", () => {
    const document = createDefaultTimelineDocument({
      sourceProjectId: "video",
      sourceStartSeconds: 0,
      sourceEndSeconds: 20,
      aspectRatio: "HORIZONTAL_16_9",
      targetDurationSeconds: 30,
    });
    const edited = normalizeTimelineDocument({
      ...document,
      items: document.items.map((item) => ({
        ...item,
        speed: 2,
        freezeFrameSeconds: 1.5,
      })),
    });
    expect(edited.currentDurationSeconds).toBe(11.5);
  });

  it("splits, duplicates, reorders, and deletes source items deterministically", () => {
    const original = createDefaultTimelineDocument({
      sourceProjectId: "video",
      sourceStartSeconds: 10,
      sourceEndSeconds: 30,
      aspectRatio: "VERTICAL_9_16",
      targetDurationSeconds: 30,
    });
    const sourceId = original.items[0]!.id;
    const split = splitSourceTimelineItem(original, sourceId, 18, "second");
    expect(split.items.map((item) => item.sourceStartSeconds)).toEqual([
      10, 18,
    ]);
    expect(split.currentDurationSeconds).toBe(20);

    const duplicated = duplicateTimelineItem(split, sourceId, "duplicate");
    expect(
      duplicated.items
        .filter((item) => item.track === "VIDEO")
        .map((item) => item.id),
    ).toEqual([sourceId, "duplicate", "second"]);

    const moved = moveTimelineItem(duplicated, "second", -1);
    expect(
      moved.items
        .filter((item) => item.track === "VIDEO")
        .map((item) => item.id),
    ).toEqual([sourceId, "second", "duplicate"]);

    const deleted = deleteTimelineItem(moved, "duplicate");
    expect(deleted.items.some((item) => item.id === "duplicate")).toBe(false);
  });

  it("stores editable overlays and rejects keyframes outside an item", () => {
    const document = createDefaultTimelineDocument({
      sourceProjectId: "video",
      sourceStartSeconds: 0,
      sourceEndSeconds: 10,
      aspectRatio: "SQUARE_1_1",
      targetDurationSeconds: 15,
    });
    const overlay = createTimelineItem({
      id: "overlay",
      kind: "TEXT_OVERLAY",
      track: "OVERLAY",
      text: "Watch this",
      timelineStartSeconds: 1,
      durationSeconds: 3,
    });
    const withOverlay = addTimelineItem(document, overlay);
    expect(withOverlay.items.at(-1)?.text).toBe("Watch this");

    expect(() =>
      timelineDocumentSchema.parse({
        ...withOverlay,
        items: withOverlay.items.map((item) =>
          item.kind === "SOURCE_VIDEO"
            ? {
                ...item,
                reframeKeyframes: [
                  {
                    id: "late",
                    timeSeconds: 99,
                    panX: 0,
                    panY: 0,
                    zoom: 1,
                  },
                ],
              }
            : item,
        ),
      }),
    ).toThrow(/cannot extend beyond/i);
  });
});
