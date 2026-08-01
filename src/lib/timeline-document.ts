import { z } from "zod";

export const SHORT_FORM_TIMELINE_VERSION = "u3-short-form-timeline-v1";

const timelineItemKindSchema = z.enum([
  "SOURCE_VIDEO",
  "CARD",
  "TEXT_OVERLAY",
  "CAPTION",
  "VOICEOVER",
  "MUSIC",
]);
const timelineTrackSchema = z.enum(["VIDEO", "OVERLAY", "VOICEOVER", "MUSIC"]);
const timelineAspectRatioSchema = z.enum([
  "VERTICAL_9_16",
  "HORIZONTAL_16_9",
  "SQUARE_1_1",
  "PORTRAIT_4_5",
]);
const cropModeSchema = z.enum([
  "FIT",
  "FILL",
  "CENTER_CROP",
  "MANUAL",
  "AUTO_SUGGESTION",
]);
const transitionSchema = z.enum(["NONE", "FADE", "DIP_TO_BLACK"]);

const reframeKeyframeSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    timeSeconds: z.number().finite().min(0).max(180),
    panX: z.number().finite().min(-1).max(1),
    panY: z.number().finite().min(-1).max(1),
    zoom: z.number().finite().min(1).max(4),
  })
  .strict();

export const timelineItemSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    kind: timelineItemKindSchema,
    track: timelineTrackSchema,
    order: z.number().int().min(0).max(1_000),
    timelineStartSeconds: z.number().finite().min(0).max(180),
    durationSeconds: z.number().finite().min(0.1).max(180),
    sourceProjectId: z.string().trim().min(1).max(191).nullable(),
    sourceStartSeconds: z.number().finite().min(0).max(86_400).nullable(),
    sourceEndSeconds: z.number().finite().min(0).max(86_400).nullable(),
    mediaAssetId: z.string().trim().min(1).max(191).nullable(),
    text: z.string().trim().max(2_000).nullable(),
    speed: z.number().finite().min(0.25).max(4),
    freezeFrameSeconds: z.number().finite().min(0).max(15),
    zoom: z.number().finite().min(1).max(4),
    panX: z.number().finite().min(-1).max(1),
    panY: z.number().finite().min(-1).max(1),
    cropMode: cropModeSchema,
    reframeKeyframes: z.array(reframeKeyframeSchema).max(100),
    transitionIn: transitionSchema,
    transitionOut: transitionSchema,
    transitionDurationSeconds: z.number().finite().min(0).max(2),
    volume: z.number().finite().min(0).max(2),
    muted: z.boolean(),
    duckOtherAudio: z.boolean(),
    fadeInSeconds: z.number().finite().min(0).max(10),
    fadeOutSeconds: z.number().finite().min(0).max(10),
    fontScale: z.number().finite().min(0.5).max(3),
    positionX: z.number().finite().min(0).max(1),
    positionY: z.number().finite().min(0).max(1),
    locked: z.boolean(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.kind === "SOURCE_VIDEO") {
      if (
        !item.sourceProjectId ||
        item.sourceStartSeconds === null ||
        item.sourceEndSeconds === null
      ) {
        context.addIssue({
          code: "custom",
          message: "A source-video item must identify its local source range.",
        });
      } else if (item.sourceEndSeconds <= item.sourceStartSeconds) {
        context.addIssue({
          code: "custom",
          path: ["sourceEndSeconds"],
          message: "A source-video item must end after it starts.",
        });
      }
      if (item.track !== "VIDEO") {
        context.addIssue({
          code: "custom",
          path: ["track"],
          message: "Source video belongs on the video track.",
        });
      }
    }
    if (item.kind === "CARD" && item.track !== "VIDEO") {
      context.addIssue({
        code: "custom",
        path: ["track"],
        message: "Cards belong on the video track.",
      });
    }
    if (
      (item.kind === "TEXT_OVERLAY" || item.kind === "CAPTION") &&
      (!item.text || item.track !== "OVERLAY")
    ) {
      context.addIssue({
        code: "custom",
        message: "Text and caption items need text on the overlay track.",
      });
    }
    if (
      (item.kind === "VOICEOVER" || item.kind === "MUSIC") &&
      !item.mediaAssetId
    ) {
      context.addIssue({
        code: "custom",
        path: ["mediaAssetId"],
        message: "Audio items must use an uploaded local media asset.",
      });
    }
  });

export const timelineDocumentSchema = z
  .object({
    version: z.literal(SHORT_FORM_TIMELINE_VERSION),
    aspectRatio: timelineAspectRatioSchema,
    targetDurationSeconds: z.number().finite().min(5).max(180),
    currentDurationSeconds: z.number().finite().min(0).max(180),
    items: z.array(timelineItemSchema).max(500),
    notes: z.string().trim().max(5_000),
  })
  .strict()
  .superRefine((document, context) => {
    const ids = new Set<string>();
    for (const [index, item] of document.items.entries()) {
      if (ids.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "id"],
          message: "Timeline item IDs must be unique.",
        });
      }
      ids.add(item.id);
      if (item.timelineStartSeconds + item.durationSeconds > 180.001) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "durationSeconds"],
          message: "Timeline items cannot extend beyond three minutes.",
        });
      }
      const keyframeIds = new Set<string>();
      for (const keyframe of item.reframeKeyframes) {
        if (keyframeIds.has(keyframe.id)) {
          context.addIssue({
            code: "custom",
            path: ["items", index, "reframeKeyframes"],
            message: "Reframe keyframe IDs must be unique within one item.",
          });
        }
        keyframeIds.add(keyframe.id);
        if (keyframe.timeSeconds > item.durationSeconds + 0.001) {
          context.addIssue({
            code: "custom",
            path: ["items", index, "reframeKeyframes"],
            message: "A reframe keyframe cannot extend beyond its item.",
          });
        }
      }
    }
  });

export type TimelineDocument = z.infer<typeof timelineDocumentSchema>;
export type TimelineItem = z.infer<typeof timelineItemSchema>;
export type TimelineItemKind = z.infer<typeof timelineItemKindSchema>;

function roundSeconds(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function videoDuration(item: TimelineItem) {
  if (
    item.kind === "SOURCE_VIDEO" &&
    item.sourceStartSeconds !== null &&
    item.sourceEndSeconds !== null
  ) {
    return roundSeconds(
      (item.sourceEndSeconds - item.sourceStartSeconds) / item.speed +
        item.freezeFrameSeconds,
    );
  }
  return item.durationSeconds;
}

export function createTimelineItem(
  input: Pick<TimelineItem, "id" | "kind" | "track"> &
    Partial<Omit<TimelineItem, "id" | "kind" | "track">>,
): TimelineItem {
  return timelineItemSchema.parse({
    order: 0,
    timelineStartSeconds: 0,
    durationSeconds: 3,
    sourceProjectId: null,
    sourceStartSeconds: null,
    sourceEndSeconds: null,
    mediaAssetId: null,
    text: null,
    speed: 1,
    freezeFrameSeconds: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    cropMode: "CENTER_CROP",
    reframeKeyframes: [],
    transitionIn: "NONE",
    transitionOut: "NONE",
    transitionDurationSeconds: 0.25,
    volume: 1,
    muted: false,
    duckOtherAudio: false,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    fontScale: 1,
    positionX: 0.5,
    positionY: 0.82,
    locked: false,
    ...input,
  });
}

export function normalizeTimelineDocument(
  input: TimelineDocument,
): TimelineDocument {
  const document = timelineDocumentSchema.parse(input);
  const video = document.items
    .filter((item) => item.track === "VIDEO")
    .sort((left, right) => left.order - right.order);
  let cursor = 0;
  const positionedVideo = new Map<string, TimelineItem>();
  for (const [index, item] of video.entries()) {
    const durationSeconds = videoDuration(item);
    const positioned = {
      ...item,
      order: index,
      timelineStartSeconds: roundSeconds(cursor),
      durationSeconds,
    };
    positionedVideo.set(item.id, positioned);
    cursor += durationSeconds;
  }
  const others = document.items
    .filter((item) => item.track !== "VIDEO")
    .map((item, index) => ({
      ...item,
      order: index,
      timelineStartSeconds: roundSeconds(item.timelineStartSeconds),
      durationSeconds: roundSeconds(item.durationSeconds),
    }));
  const items = [
    ...video.map((item) => positionedVideo.get(item.id)!),
    ...others,
  ];
  const currentDurationSeconds = roundSeconds(
    Math.max(
      cursor,
      ...others.map((item) => item.timelineStartSeconds + item.durationSeconds),
      0,
    ),
  );
  return timelineDocumentSchema.parse({
    ...document,
    currentDurationSeconds,
    items,
  });
}

export function createDefaultTimelineDocument(input: {
  sourceProjectId: string;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  aspectRatio: TimelineDocument["aspectRatio"];
  targetDurationSeconds: number;
}): TimelineDocument {
  return normalizeTimelineDocument({
    version: SHORT_FORM_TIMELINE_VERSION,
    aspectRatio: input.aspectRatio,
    targetDurationSeconds: input.targetDurationSeconds,
    currentDurationSeconds: 0,
    notes:
      "This timeline is non-destructive. Source recordings remain unchanged.",
    items: [
      createTimelineItem({
        id: crypto.randomUUID(),
        kind: "SOURCE_VIDEO",
        track: "VIDEO",
        sourceProjectId: input.sourceProjectId,
        sourceStartSeconds: input.sourceStartSeconds,
        sourceEndSeconds: input.sourceEndSeconds,
        durationSeconds: input.sourceEndSeconds - input.sourceStartSeconds,
      }),
    ],
  });
}

export function replaceTimelineItem(
  document: TimelineDocument,
  item: TimelineItem,
) {
  return normalizeTimelineDocument({
    ...document,
    items: document.items.map((current) =>
      current.id === item.id ? timelineItemSchema.parse(item) : current,
    ),
  });
}

export function addTimelineItem(
  document: TimelineDocument,
  item: TimelineItem,
) {
  return normalizeTimelineDocument({
    ...document,
    items: [...document.items, timelineItemSchema.parse(item)],
  });
}

export function deleteTimelineItem(document: TimelineDocument, itemId: string) {
  return normalizeTimelineDocument({
    ...document,
    items: document.items.filter((item) => item.id !== itemId),
  });
}

export function duplicateTimelineItem(
  document: TimelineDocument,
  itemId: string,
  duplicateId: string,
) {
  const item = document.items.find((candidate) => candidate.id === itemId);
  if (!item) return document;
  return normalizeTimelineDocument({
    ...document,
    items: document.items
      .map((candidate) =>
        candidate.track === item.track && candidate.order > item.order
          ? { ...candidate, order: candidate.order + 1 }
          : candidate,
      )
      .concat(
        timelineItemSchema.parse({
          ...item,
          id: duplicateId,
          order: item.order + 1,
          timelineStartSeconds:
            item.track === "VIDEO"
              ? item.timelineStartSeconds + item.durationSeconds
              : Math.min(179.9, item.timelineStartSeconds + 0.25),
        }),
      ),
  });
}

export function moveTimelineItem(
  document: TimelineDocument,
  itemId: string,
  direction: -1 | 1,
) {
  const item = document.items.find((candidate) => candidate.id === itemId);
  if (!item) return document;
  const peers = document.items
    .filter((candidate) => candidate.track === item.track)
    .sort((left, right) => left.order - right.order);
  const index = peers.findIndex((candidate) => candidate.id === itemId);
  const swapIndex = index + direction;
  if (index < 0 || swapIndex < 0 || swapIndex >= peers.length) return document;
  const swap = peers[swapIndex]!;
  return normalizeTimelineDocument({
    ...document,
    items: document.items.map((candidate) => {
      if (candidate.id === item.id) return { ...candidate, order: swap.order };
      if (candidate.id === swap.id) return { ...candidate, order: item.order };
      return candidate;
    }),
  });
}

export function splitSourceTimelineItem(
  document: TimelineDocument,
  itemId: string,
  sourceSplitSeconds: number,
  newItemId: string,
) {
  const item = document.items.find((candidate) => candidate.id === itemId);
  if (
    !item ||
    item.kind !== "SOURCE_VIDEO" ||
    item.sourceStartSeconds === null ||
    item.sourceEndSeconds === null ||
    sourceSplitSeconds <= item.sourceStartSeconds + 0.05 ||
    sourceSplitSeconds >= item.sourceEndSeconds - 0.05
  ) {
    throw new Error("Choose a split point inside the selected source range.");
  }
  const first = timelineItemSchema.parse({
    ...item,
    sourceEndSeconds: sourceSplitSeconds,
    freezeFrameSeconds: 0,
  });
  const second = timelineItemSchema.parse({
    ...item,
    id: newItemId,
    order: item.order + 1,
    sourceStartSeconds: sourceSplitSeconds,
    freezeFrameSeconds: item.freezeFrameSeconds,
  });
  return normalizeTimelineDocument({
    ...document,
    items: document.items
      .filter((candidate) => candidate.id !== itemId)
      .map((candidate) =>
        candidate.track === "VIDEO" && candidate.order > item.order
          ? { ...candidate, order: candidate.order + 1 }
          : candidate,
      )
      .concat(first, second),
  });
}
