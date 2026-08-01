import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  createLongFormTimelineItem,
  normalizeLongFormTimeline,
  type LongFormTimelineDocument,
} from "@/lib/long-form-timeline-document";
import {
  getLongFormTimelineState,
  saveLongFormTimeline,
} from "@/lib/long-form-timeline";
import {
  getShortFormTimelineState,
  saveShortFormTimeline,
} from "@/lib/short-form-timeline";
import {
  createTimelineItem,
  normalizeTimelineDocument,
  type TimelineDocument,
} from "@/lib/timeline-document";

export const voiceoverTimelineActionSchema = z
  .object({
    target: z.enum(["SHORT_FORM", "LONG_FORM"]),
    action: z.enum(["ADD_OR_REPLACE", "REMOVE"]).default("ADD_OR_REPLACE"),
    includeCaptions: z.boolean().default(true),
  })
  .strict();

type TimelineTake = {
  id: string;
  scriptSectionKey: string | null;
  alignmentStartSeconds: number;
  isActive: boolean;
  asset: {
    id: string;
    durationSeconds: number;
  };
  captions: Array<{
    segmentOrder: number;
    startSeconds: number;
    endSeconds: number;
    text: string;
  }>;
};

function scopeKey(scriptSectionKey: string | null) {
  const value = scriptSectionKey ?? "whole-script";
  return Buffer.from(value).toString("base64url").slice(0, 64);
}

function scopePrefix(take: TimelineTake) {
  return `u5-voice-${scopeKey(take.scriptSectionKey)}`;
}

function visualDuration(
  items: Array<{
    track: string;
    timelineStartSeconds: number;
    durationSeconds: number;
  }>,
) {
  return Math.max(
    0,
    ...items
      .filter((item) => item.track === "VIDEO")
      .map((item) => item.timelineStartSeconds + item.durationSeconds),
  );
}

function boundedPlacement(take: TimelineTake, availableSeconds: number) {
  if (take.alignmentStartSeconds >= availableSeconds - 0.1) {
    throw new AppError(
      "Move the narration start inside the current video timeline first.",
      400,
      "VOICEOVER_ALIGNMENT_OUTSIDE_TIMELINE",
    );
  }
  return {
    startSeconds: take.alignmentStartSeconds,
    durationSeconds: Math.min(
      take.asset.durationSeconds,
      availableSeconds - take.alignmentStartSeconds,
    ),
  };
}

export function placeVoiceoverOnShortFormTimeline(input: {
  document: TimelineDocument;
  take: TimelineTake;
  action: "ADD_OR_REPLACE" | "REMOVE";
  includeCaptions: boolean;
}) {
  const prefix = scopePrefix(input.take);
  const withoutSectionTake = {
    ...input.document,
    items: input.document.items.filter(
      (item) =>
        item.id !== `${prefix}-audio` &&
        !item.id.startsWith(`${prefix}-caption-`),
    ),
  };
  if (input.action === "REMOVE") {
    return normalizeTimelineDocument(withoutSectionTake);
  }
  if (!input.take.isActive) {
    throw new AppError(
      "Select this as the active take before adding it to the timeline.",
      409,
      "VOICEOVER_TAKE_NOT_ACTIVE",
    );
  }
  const placement = boundedPlacement(
    input.take,
    visualDuration(withoutSectionTake.items),
  );
  const voiceover = createTimelineItem({
    id: `${prefix}-audio`,
    kind: "VOICEOVER",
    track: "VOICEOVER",
    mediaAssetId: input.take.asset.id,
    timelineStartSeconds: placement.startSeconds,
    durationSeconds: placement.durationSeconds,
    duckOtherAudio: true,
    fadeInSeconds: Math.min(0.08, placement.durationSeconds / 2),
    fadeOutSeconds: Math.min(0.12, placement.durationSeconds / 2),
    locked: false,
  });
  const captions = input.includeCaptions
    ? input.take.captions.flatMap((caption) => {
        const start =
          placement.startSeconds + Math.max(0, caption.startSeconds);
        const end = Math.min(
          placement.startSeconds + placement.durationSeconds,
          placement.startSeconds + caption.endSeconds,
        );
        if (!caption.text.trim() || end <= start + 0.099) return [];
        return [
          createTimelineItem({
            id: `${prefix}-caption-${caption.segmentOrder}`,
            kind: "CAPTION",
            track: "OVERLAY",
            text: caption.text,
            timelineStartSeconds: start,
            durationSeconds: end - start,
            fontScale: 0.9,
            positionX: 0.5,
            positionY: 0.82,
          }),
        ];
      })
    : [];
  return normalizeTimelineDocument({
    ...withoutSectionTake,
    items: [...withoutSectionTake.items, voiceover, ...captions],
  });
}

export function placeVoiceoverOnLongFormTimeline(input: {
  document: LongFormTimelineDocument;
  take: TimelineTake;
  action: "ADD_OR_REPLACE" | "REMOVE";
  includeCaptions: boolean;
}) {
  const prefix = scopePrefix(input.take);
  const withoutSectionTake = {
    ...input.document,
    items: input.document.items.filter(
      (item) =>
        item.id !== `${prefix}-audio` &&
        !item.id.startsWith(`${prefix}-caption-`),
    ),
  };
  if (input.action === "REMOVE") {
    return normalizeLongFormTimeline(withoutSectionTake);
  }
  if (!input.take.isActive) {
    throw new AppError(
      "Select this as the active take before adding it to the timeline.",
      409,
      "VOICEOVER_TAKE_NOT_ACTIVE",
    );
  }
  const placement = boundedPlacement(
    input.take,
    visualDuration(withoutSectionTake.items),
  );
  const sectionId = withoutSectionTake.sections.some(
    (section) => section.id === input.take.scriptSectionKey,
  )
    ? input.take.scriptSectionKey
    : null;
  const voiceover = createLongFormTimelineItem({
    id: `${prefix}-audio`,
    sectionId,
    kind: "VOICEOVER",
    track: "VOICEOVER",
    mediaAssetId: input.take.asset.id,
    timelineStartSeconds: placement.startSeconds,
    durationSeconds: placement.durationSeconds,
    duckOtherAudio: true,
    fadeInSeconds: Math.min(0.08, placement.durationSeconds / 2),
    fadeOutSeconds: Math.min(0.12, placement.durationSeconds / 2),
    reason:
      "Active local narration aligned in Voiceover Studio. Gameplay audio ducks only while this take is active.",
    evidence: ["Permission-confirmed local narration take."],
    warnings: [],
  });
  const captions = input.includeCaptions
    ? input.take.captions.flatMap((caption) => {
        const start =
          placement.startSeconds + Math.max(0, caption.startSeconds);
        const end = Math.min(
          placement.startSeconds + placement.durationSeconds,
          placement.startSeconds + caption.endSeconds,
        );
        if (!caption.text.trim() || end <= start + 0.099) return [];
        return [
          createLongFormTimelineItem({
            id: `${prefix}-caption-${caption.segmentOrder}`,
            sectionId,
            kind: "CAPTION",
            track: "OVERLAY",
            text: caption.text,
            timelineStartSeconds: start,
            durationSeconds: end - start,
            fontScale: 0.9,
            positionX: 0.5,
            positionY: 0.82,
            reason: "Editable caption generated from selected narration.",
            evidence: ["Local narration transcript."],
            warnings: [],
          }),
        ];
      })
    : [];
  return normalizeLongFormTimeline({
    ...withoutSectionTake,
    items: [...withoutSectionTake.items, voiceover, ...captions],
  });
}

export async function updateVoiceoverTimeline(
  studioProjectId: string,
  takeId: string,
  input: unknown,
) {
  const payload = voiceoverTimelineActionSchema.parse(input);
  const take = await db.voiceoverTake.findFirst({
    where: { id: takeId, production: { studioProjectId } },
    include: {
      sourceAsset: true,
      processedAsset: true,
      captions: { orderBy: { segmentOrder: "asc" } },
    },
  });
  if (!take) {
    throw new AppError(
      "That narration take does not exist.",
      404,
      "VOICEOVER_TAKE_NOT_FOUND",
    );
  }
  const timelineTake: TimelineTake = {
    id: take.id,
    scriptSectionKey: take.scriptSectionKey,
    alignmentStartSeconds: take.alignmentStartSeconds,
    isActive: take.isActive,
    asset: take.processedAsset ?? take.sourceAsset,
    captions: take.captions,
  };

  if (payload.target === "SHORT_FORM") {
    const state = await getShortFormTimelineState(studioProjectId);
    if (!state.currentRevision) {
      throw new AppError(
        "Create the short-form timeline before adding narration.",
        409,
        "SHORT_FORM_TIMELINE_REQUIRED",
      );
    }
    const document = placeVoiceoverOnShortFormTimeline({
      document: state.currentRevision.document,
      take: timelineTake,
      action: payload.action,
      includeCaptions: payload.includeCaptions,
    });
    return {
      target: payload.target,
      timeline: await saveShortFormTimeline(studioProjectId, {
        document,
        reason:
          payload.action === "REMOVE"
            ? "Removed Voiceover Studio section take"
            : "Added Voiceover Studio section take and captions",
      }),
    };
  }

  const state = await getLongFormTimelineState(studioProjectId);
  if (!state.currentRevision) {
    throw new AppError(
      "Create the long-form timeline before adding narration.",
      409,
      "LONG_FORM_TIMELINE_REQUIRED",
    );
  }
  const document = placeVoiceoverOnLongFormTimeline({
    document: state.currentRevision.document,
    take: timelineTake,
    action: payload.action,
    includeCaptions: payload.includeCaptions,
  });
  return {
    target: payload.target,
    timeline: await saveLongFormTimeline(studioProjectId, {
      document,
      reason:
        payload.action === "REMOVE"
          ? "Removed Voiceover Studio section take"
          : "Added Voiceover Studio section take and captions",
    }),
  };
}
