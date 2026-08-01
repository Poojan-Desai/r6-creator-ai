import { z } from "zod";

import type { LongFormPlan } from "@/lib/long-form-productions";

export const LONG_FORM_TIMELINE_VERSION = "u4-long-form-timeline-v1";
export const LONG_FORM_MAX_SECONDS = 14_400;

const sectionKindSchema = z.enum([
  "OPENING_TEASER",
  "INTRO",
  "CHAPTER",
  "RETENTION_BEAT",
  "CLIMAX",
  "ENDING",
]);
const itemKindSchema = z.enum([
  "SOURCE_VIDEO",
  "CARD",
  "TRANSITION",
  "TEXT_OVERLAY",
  "CAPTION",
  "VOICEOVER",
  "MUSIC",
]);
const trackSchema = z.enum(["VIDEO", "OVERLAY", "VOICEOVER", "MUSIC"]);
const cropModeSchema = z.enum([
  "FIT",
  "FILL",
  "CENTER_CROP",
  "MANUAL",
  "AUTO_SUGGESTION",
]);
const transitionSchema = z.enum(["NONE", "FADE", "DIP_TO_BLACK"]);

const sourceSchema = z
  .object({
    projectId: z.string().trim().min(1).max(191),
    name: z.string().trim().min(1).max(300),
    durationSeconds: z.number().finite().positive().max(86_400),
  })
  .strict();

export const longFormTimelineSectionSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    kind: sectionKindSchema,
    title: z.string().trim().min(1).max(300),
    order: z.number().int().min(0).max(1_000),
    locked: z.boolean(),
    reason: z.string().trim().min(1).max(2_000),
    evidence: z.array(z.string().trim().min(1).max(1_000)).max(100),
    warnings: z.array(z.string().trim().min(1).max(1_000)).max(100),
  })
  .strict();

export const longFormTimelineItemSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    sectionId: z.string().trim().min(1).max(100).nullable(),
    kind: itemKindSchema,
    track: trackSchema,
    order: z.number().int().min(0).max(10_000),
    timelineStartSeconds: z.number().finite().min(0).max(LONG_FORM_MAX_SECONDS),
    durationSeconds: z.number().finite().min(0.1).max(LONG_FORM_MAX_SECONDS),
    sourceProjectId: z.string().trim().min(1).max(191).nullable(),
    sourceStartSeconds: z.number().finite().min(0).max(86_400).nullable(),
    sourceEndSeconds: z.number().finite().min(0).max(86_400).nullable(),
    mediaAssetId: z.string().trim().min(1).max(191).nullable(),
    text: z.string().trim().max(10_000).nullable(),
    speed: z.number().finite().min(0.25).max(4),
    freezeFrameSeconds: z.number().finite().min(0).max(30),
    zoom: z.number().finite().min(1).max(4),
    panX: z.number().finite().min(-1).max(1),
    panY: z.number().finite().min(-1).max(1),
    cropMode: cropModeSchema,
    transitionIn: transitionSchema,
    transitionOut: transitionSchema,
    transitionDurationSeconds: z.number().finite().min(0).max(3),
    volume: z.number().finite().min(0).max(2),
    muted: z.boolean(),
    duckOtherAudio: z.boolean(),
    fadeInSeconds: z.number().finite().min(0).max(30),
    fadeOutSeconds: z.number().finite().min(0).max(30),
    fontScale: z.number().finite().min(0.5).max(3),
    positionX: z.number().finite().min(0).max(1),
    positionY: z.number().finite().min(0).max(1),
    locked: z.boolean(),
    reason: z.string().trim().min(1).max(2_000),
    evidence: z.array(z.string().trim().min(1).max(1_000)).max(100),
    warnings: z.array(z.string().trim().min(1).max(1_000)).max(100),
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
          message: "A source-video item must identify its source range.",
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
    if (
      (item.kind === "CARD" || item.kind === "TRANSITION") &&
      item.track !== "VIDEO"
    ) {
      context.addIssue({
        code: "custom",
        path: ["track"],
        message: "Cards and transitions belong on the video track.",
      });
    }
    if (
      (item.kind === "TEXT_OVERLAY" || item.kind === "CAPTION") &&
      (!item.text || item.track !== "OVERLAY")
    ) {
      context.addIssue({
        code: "custom",
        message: "Text and captions need text on the overlay track.",
      });
    }
    if (
      (item.kind === "VOICEOVER" || item.kind === "MUSIC") &&
      !item.mediaAssetId
    ) {
      context.addIssue({
        code: "custom",
        path: ["mediaAssetId"],
        message: "Audio items must use an uploaded local asset.",
      });
    }
  });

export const longFormTimelineDocumentSchema = z
  .object({
    version: z.literal(LONG_FORM_TIMELINE_VERSION),
    sourcePlanRevisionId: z.string().trim().min(1).max(191),
    sourcePlanVersion: z.number().int().positive(),
    aspectRatio: z.literal("HORIZONTAL_16_9"),
    targetDurationSeconds: z
      .number()
      .finite()
      .min(300)
      .max(LONG_FORM_MAX_SECONDS),
    currentDurationSeconds: z
      .number()
      .finite()
      .min(0)
      .max(LONG_FORM_MAX_SECONDS),
    sources: z.array(sourceSchema).min(1).max(100),
    sections: z.array(longFormTimelineSectionSchema).min(1).max(1_000),
    items: z.array(longFormTimelineItemSchema).min(1).max(10_000),
    notes: z.string().trim().max(20_000),
    rebalanceWarnings: z.array(z.string().trim().min(1).max(1_000)).max(100),
  })
  .strict()
  .superRefine((document, context) => {
    const sourceIds = new Set(
      document.sources.map((source) => source.projectId),
    );
    const sectionIds = new Set<string>();
    for (const [index, section] of document.sections.entries()) {
      if (sectionIds.has(section.id)) {
        context.addIssue({
          code: "custom",
          path: ["sections", index, "id"],
          message: "Timeline section IDs must be unique.",
        });
      }
      sectionIds.add(section.id);
    }
    const itemIds = new Set<string>();
    for (const [index, item] of document.items.entries()) {
      if (itemIds.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "id"],
          message: "Timeline item IDs must be unique.",
        });
      }
      itemIds.add(item.id);
      if (item.sectionId && !sectionIds.has(item.sectionId)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "sectionId"],
          message: "A timeline item references an unknown section.",
        });
      }
      if (item.sourceProjectId && !sourceIds.has(item.sourceProjectId)) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "sourceProjectId"],
          message: "A timeline item references an unknown source.",
        });
      }
      if (
        item.timelineStartSeconds + item.durationSeconds >
        LONG_FORM_MAX_SECONDS + 0.001
      ) {
        context.addIssue({
          code: "custom",
          path: ["items", index, "durationSeconds"],
          message: "A timeline item extends beyond the four-hour limit.",
        });
      }
    }
  });

export type LongFormTimelineDocument = z.infer<
  typeof longFormTimelineDocumentSchema
>;
export type LongFormTimelineItem = z.infer<typeof longFormTimelineItemSchema>;
export type LongFormTimelineSection = z.infer<
  typeof longFormTimelineSectionSchema
>;

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function videoDuration(item: LongFormTimelineItem) {
  if (
    item.kind === "SOURCE_VIDEO" &&
    item.sourceStartSeconds !== null &&
    item.sourceEndSeconds !== null
  ) {
    return round(
      (item.sourceEndSeconds - item.sourceStartSeconds) / item.speed +
        item.freezeFrameSeconds,
    );
  }
  return item.durationSeconds;
}

export function createLongFormTimelineItem(
  input: Pick<LongFormTimelineItem, "id" | "kind" | "track"> &
    Partial<Omit<LongFormTimelineItem, "id" | "kind" | "track">>,
) {
  return longFormTimelineItemSchema.parse({
    sectionId: null,
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
    cropMode: "FIT",
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
    reason: "Manual timeline item.",
    evidence: [],
    warnings: [],
    ...input,
  });
}

export function normalizeLongFormTimeline(
  input: LongFormTimelineDocument,
): LongFormTimelineDocument {
  const document = longFormTimelineDocumentSchema.parse(input);
  const videoItems = document.items
    .filter((item) => item.track === "VIDEO")
    .sort((left, right) => left.order - right.order);
  let cursor = 0;
  const normalizedVideo = videoItems.map((item, order) => {
    const durationSeconds = videoDuration(item);
    const normalized = {
      ...item,
      order,
      timelineStartSeconds: round(cursor),
      durationSeconds,
    };
    cursor += durationSeconds;
    return normalized;
  });
  const otherItems = document.items
    .filter((item) => item.track !== "VIDEO")
    .map((item, order) => ({
      ...item,
      order,
      timelineStartSeconds: round(item.timelineStartSeconds),
      durationSeconds: round(item.durationSeconds),
    }));
  const currentDurationSeconds = round(
    Math.max(
      cursor,
      ...otherItems.map(
        (item) => item.timelineStartSeconds + item.durationSeconds,
      ),
      0,
    ),
  );
  return longFormTimelineDocumentSchema.parse({
    ...document,
    sections: [...document.sections].sort(
      (left, right) => left.order - right.order,
    ),
    items: [...normalizedVideo, ...otherItems],
    currentDurationSeconds,
  });
}

export function createLongFormTimelineFromPlan(input: {
  plan: LongFormPlan;
  sources: LongFormTimelineDocument["sources"];
  sourcePlanRevisionId: string;
  sourcePlanVersion: number;
}) {
  let videoOrder = 0;
  const sections: LongFormTimelineSection[] = input.plan.sections.map(
    (section, order) => ({
      id: section.id,
      kind: section.kind,
      title: section.title,
      order,
      locked: false,
      reason: section.reason,
      evidence: section.evidence,
      warnings: section.warnings,
    }),
  );
  const items = input.plan.sections.flatMap((section) =>
    section.sourceRanges.map((range) =>
      createLongFormTimelineItem({
        id: crypto.randomUUID(),
        sectionId: section.id,
        kind: "SOURCE_VIDEO",
        track: "VIDEO",
        order: videoOrder++,
        sourceProjectId: range.projectId,
        sourceStartSeconds: range.sourceStartSeconds,
        sourceEndSeconds: range.sourceEndSeconds,
        durationSeconds: range.sourceEndSeconds - range.sourceStartSeconds,
        reason: range.reason,
        evidence: section.evidence,
        warnings: section.warnings,
      }),
    ),
  );
  return normalizeLongFormTimeline({
    version: LONG_FORM_TIMELINE_VERSION,
    sourcePlanRevisionId: input.sourcePlanRevisionId,
    sourcePlanVersion: input.sourcePlanVersion,
    aspectRatio: "HORIZONTAL_16_9",
    targetDurationSeconds: input.plan.requestedDurationSeconds,
    currentDurationSeconds: 0,
    sources: input.sources,
    sections,
    items,
    notes:
      "This long-form timeline is non-destructive. Linked recordings remain unchanged.",
    rebalanceWarnings: input.plan.warnings,
  });
}

function sectionLocked(
  document: LongFormTimelineDocument,
  item: LongFormTimelineItem,
) {
  return (
    item.locked ||
    Boolean(
      item.sectionId &&
      document.sections.find((section) => section.id === item.sectionId)
        ?.locked,
    )
  );
}

export function rebalanceLongFormTimeline(
  input: LongFormTimelineDocument,
  targetDurationSeconds = input.targetDurationSeconds,
) {
  let document = normalizeLongFormTimeline({
    ...input,
    targetDurationSeconds,
    rebalanceWarnings: [],
  });
  let remaining = round(
    document.currentDurationSeconds - targetDurationSeconds,
  );
  const items = document.items.map((item) => ({ ...item }));

  if (remaining > 0.001) {
    const adjustable = items
      .filter(
        (item) =>
          item.track === "VIDEO" &&
          !sectionLocked(document, item) &&
          (item.kind === "SOURCE_VIDEO" || item.kind === "CARD"),
      )
      .sort((left, right) => right.order - left.order);
    for (const item of adjustable) {
      if (remaining <= 0.001) break;
      const minimum = item.kind === "SOURCE_VIDEO" ? 1 : 0.5;
      const removable = Math.max(0, item.durationSeconds - minimum);
      const amount = Math.min(removable, remaining);
      if (item.kind === "SOURCE_VIDEO" && item.sourceEndSeconds !== null) {
        item.sourceEndSeconds = round(
          item.sourceEndSeconds - amount * item.speed,
        );
      } else {
        item.durationSeconds = round(item.durationSeconds - amount);
      }
      remaining = round(remaining - amount);
    }
  } else if (remaining < -0.001) {
    let missing = -remaining;
    const sources = new Map(
      document.sources.map((source) => [source.projectId, source]),
    );
    const adjustable = items
      .filter(
        (item) =>
          item.kind === "SOURCE_VIDEO" &&
          item.track === "VIDEO" &&
          !sectionLocked(document, item),
      )
      .sort((left, right) => right.order - left.order);
    for (const item of adjustable) {
      if (missing <= 0.001) break;
      if (
        !item.sourceProjectId ||
        item.sourceStartSeconds === null ||
        item.sourceEndSeconds === null
      ) {
        continue;
      }
      const source = sources.get(item.sourceProjectId);
      if (!source) continue;
      const nextRange = items
        .filter(
          (candidate) =>
            candidate.kind === "SOURCE_VIDEO" &&
            candidate.sourceProjectId === item.sourceProjectId &&
            candidate.order > item.order &&
            candidate.sourceStartSeconds !== null,
        )
        .sort((left, right) => left.order - right.order)[0];
      const maximumEnd = Math.min(
        source.durationSeconds,
        nextRange?.sourceStartSeconds ?? source.durationSeconds,
      );
      const extendable = Math.max(
        0,
        (maximumEnd - item.sourceEndSeconds) / item.speed,
      );
      const amount = Math.min(extendable, missing);
      item.sourceEndSeconds = round(
        item.sourceEndSeconds + amount * item.speed,
      );
      missing = round(missing - amount);
    }
    remaining = round(-missing);
  }

  document = normalizeLongFormTimeline({ ...document, items });
  const gap = round(targetDurationSeconds - document.currentDurationSeconds);
  const warnings =
    Math.abs(gap) <= 0.05
      ? []
      : [
          gap > 0
            ? `${gap.toFixed(1)} seconds remain unfilled because unlocked source ranges cannot be extended without overlap or leaving the source recording.`
            : `${Math.abs(gap).toFixed(1)} seconds remain above target because the remaining sections are locked or at their minimum useful length.`,
        ];
  return {
    document: longFormTimelineDocumentSchema.parse({
      ...document,
      rebalanceWarnings: warnings,
    }),
    fitted: warnings.length === 0,
    remainingSeconds: round(Math.abs(gap)),
    warnings,
  };
}

export function replaceLongFormTimelineItem(
  document: LongFormTimelineDocument,
  item: LongFormTimelineItem,
) {
  return normalizeLongFormTimeline({
    ...document,
    items: document.items.map((current) =>
      current.id === item.id ? longFormTimelineItemSchema.parse(item) : current,
    ),
  });
}

export function replaceLongFormTimelineSection(
  document: LongFormTimelineDocument,
  section: LongFormTimelineSection,
) {
  return normalizeLongFormTimeline({
    ...document,
    sections: document.sections.map((current) =>
      current.id === section.id
        ? longFormTimelineSectionSchema.parse(section)
        : current,
    ),
  });
}

export function addLongFormTimelineItem(
  document: LongFormTimelineDocument,
  item: LongFormTimelineItem,
) {
  return normalizeLongFormTimeline({
    ...document,
    items: [...document.items, longFormTimelineItemSchema.parse(item)],
  });
}

export function deleteLongFormTimelineItem(
  document: LongFormTimelineDocument,
  itemId: string,
) {
  return normalizeLongFormTimeline({
    ...document,
    items: document.items.filter((item) => item.id !== itemId),
  });
}

export function duplicateLongFormTimelineItem(
  document: LongFormTimelineDocument,
  itemId: string,
  newId: string,
) {
  const item = document.items.find((candidate) => candidate.id === itemId);
  if (!item) return document;
  return normalizeLongFormTimeline({
    ...document,
    items: document.items
      .map((candidate) =>
        candidate.track === item.track && candidate.order > item.order
          ? { ...candidate, order: candidate.order + 1 }
          : candidate,
      )
      .concat(
        longFormTimelineItemSchema.parse({
          ...item,
          id: newId,
          order: item.order + 1,
          locked: false,
        }),
      ),
  });
}

export function moveLongFormTimelineItem(
  document: LongFormTimelineDocument,
  itemId: string,
  direction: -1 | 1,
) {
  const item = document.items.find((candidate) => candidate.id === itemId);
  if (!item || item.locked) return document;
  const peers = document.items
    .filter((candidate) => candidate.track === item.track)
    .sort((left, right) => left.order - right.order);
  const index = peers.findIndex((candidate) => candidate.id === itemId);
  const swap = peers[index + direction];
  if (!swap || swap.locked) return document;
  return normalizeLongFormTimeline({
    ...document,
    items: document.items.map((candidate) => {
      if (candidate.id === item.id) return { ...candidate, order: swap.order };
      if (candidate.id === swap.id) return { ...candidate, order: item.order };
      return candidate;
    }),
  });
}

export function moveLongFormTimelineSection(
  document: LongFormTimelineDocument,
  sectionId: string,
  direction: -1 | 1,
) {
  const sections = [...document.sections].sort(
    (left, right) => left.order - right.order,
  );
  const index = sections.findIndex((section) => section.id === sectionId);
  const section = sections[index];
  const swap = sections[index + direction];
  if (!section || !swap || section.locked || swap.locked) return document;
  const reorderedSections = document.sections.map((current) => {
    if (current.id === section.id) return { ...current, order: swap.order };
    if (current.id === swap.id) return { ...current, order: section.order };
    return current;
  });
  const sectionOrder = new Map(
    reorderedSections.map((current) => [current.id, current.order]),
  );
  const video = document.items
    .filter((item) => item.track === "VIDEO")
    .sort((left, right) => {
      const leftSection = left.sectionId
        ? (sectionOrder.get(left.sectionId) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
      const rightSection = right.sectionId
        ? (sectionOrder.get(right.sectionId) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
      return leftSection - rightSection || left.order - right.order;
    })
    .map((item, order) => ({ ...item, order }));
  const videoById = new Map(video.map((item) => [item.id, item]));
  return normalizeLongFormTimeline({
    ...document,
    sections: reorderedSections,
    items: document.items.map((item) => videoById.get(item.id) ?? item),
  });
}

export function deleteLongFormTimelineSection(
  document: LongFormTimelineDocument,
  sectionId: string,
) {
  const section = document.sections.find(
    (candidate) => candidate.id === sectionId,
  );
  if (!section || section.locked || document.sections.length <= 1) {
    return document;
  }
  return normalizeLongFormTimeline({
    ...document,
    sections: document.sections
      .filter((candidate) => candidate.id !== sectionId)
      .map((candidate, order) => ({ ...candidate, order })),
    items: document.items.filter((item) => item.sectionId !== sectionId),
  });
}

export function duplicateLongFormTimelineSection(
  document: LongFormTimelineDocument,
  sectionId: string,
  newSectionId: string,
  newItemIds: string[],
) {
  const orderedSections = [...document.sections].sort(
    (left, right) => left.order - right.order,
  );
  const sourceSection = orderedSections.find(
    (section) => section.id === sectionId,
  );
  if (!sourceSection) return document;
  const sectionItems = document.items
    .filter((item) => item.sectionId === sectionId)
    .sort((left, right) => left.order - right.order);
  if (sectionItems.length !== newItemIds.length) {
    throw new Error("Provide one new item ID for every duplicated item.");
  }
  const insertOrder = sourceSection.order + 1;
  const sections = document.sections
    .map((section) =>
      section.order >= insertOrder
        ? { ...section, order: section.order + 1 }
        : section,
    )
    .concat({
      ...sourceSection,
      id: newSectionId,
      title: `${sourceSection.title} copy`,
      order: insertOrder,
      locked: false,
    });
  const duplicated = sectionItems.map((item, index) => ({
    ...item,
    id: newItemIds[index]!,
    sectionId: newSectionId,
    locked: false,
  }));
  const sectionOrder = new Map(
    sections.map((section) => [section.id, section.order]),
  );
  const items = [...document.items, ...duplicated];
  const video = items
    .filter((item) => item.track === "VIDEO")
    .sort((left, right) => {
      const leftSection = left.sectionId
        ? (sectionOrder.get(left.sectionId) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
      const rightSection = right.sectionId
        ? (sectionOrder.get(right.sectionId) ?? Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER;
      if (leftSection !== rightSection) return leftSection - rightSection;
      const leftDuplicate = left.sectionId === newSectionId ? 1 : 0;
      const rightDuplicate = right.sectionId === newSectionId ? 1 : 0;
      return leftDuplicate - rightDuplicate || left.order - right.order;
    })
    .map((item, order) => ({ ...item, order }));
  const videoById = new Map(video.map((item) => [item.id, item]));
  return normalizeLongFormTimeline({
    ...document,
    sections,
    items: items.map((item) => videoById.get(item.id) ?? item),
  });
}

export function calculateLongFormTimelineMetrics(
  document: LongFormTimelineDocument,
) {
  const normalized = normalizeLongFormTimeline(document);
  const video = normalized.items.filter((item) => item.track === "VIDEO");
  const gameplaySeconds = round(
    video
      .filter((item) => item.kind === "SOURCE_VIDEO")
      .reduce((total, item) => total + item.durationSeconds, 0),
  );
  const cardAndTransitionSeconds = round(
    video
      .filter((item) => item.kind === "CARD" || item.kind === "TRANSITION")
      .reduce((total, item) => total + item.durationSeconds, 0),
  );
  const voiceoverSeconds = round(
    normalized.items
      .filter((item) => item.track === "VOICEOVER")
      .reduce((total, item) => total + item.durationSeconds, 0),
  );
  const musicSeconds = round(
    normalized.items
      .filter((item) => item.track === "MUSIC")
      .reduce((total, item) => total + item.durationSeconds, 0),
  );
  const sourceSelectedSeconds = round(
    video
      .filter(
        (item) =>
          item.kind === "SOURCE_VIDEO" &&
          item.sourceStartSeconds !== null &&
          item.sourceEndSeconds !== null,
      )
      .reduce(
        (total, item) =>
          total + item.sourceEndSeconds! - item.sourceStartSeconds!,
        0,
      ),
  );
  const totalSourceSeconds = round(
    normalized.sources.reduce(
      (total, source) => total + source.durationSeconds,
      0,
    ),
  );
  return {
    currentSeconds: normalized.currentDurationSeconds,
    targetSeconds: normalized.targetDurationSeconds,
    differenceSeconds: round(
      normalized.currentDurationSeconds - normalized.targetDurationSeconds,
    ),
    gameplaySeconds,
    cardAndTransitionSeconds,
    voiceoverSeconds,
    musicSeconds,
    silenceSeconds: 0,
    removedSourceSeconds: round(
      Math.max(0, totalSourceSeconds - sourceSelectedSeconds),
    ),
    requiredCuts: Math.max(0, video.length - 1),
    sectionCount: normalized.sections.length,
    lockedSectionCount: normalized.sections.filter((section) => section.locked)
      .length,
  };
}
