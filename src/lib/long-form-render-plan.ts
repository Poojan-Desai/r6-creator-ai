import path from "node:path";

import type { LongFormRenderKind } from "@prisma/client";

import { AppError } from "@/lib/errors";
import {
  type LongFormTimelineDocument,
  type LongFormTimelineItem,
  longFormTimelineDocumentSchema,
} from "@/lib/long-form-timeline-document";
import {
  buildShortFormExportPlan,
  buildShortFormProxyPlan,
  type ShortFormRenderMedia,
  type ShortFormRenderPlan,
  type ShortFormRenderSource,
} from "@/lib/short-form-proxy";
import {
  SHORT_FORM_TIMELINE_VERSION,
  timelineDocumentSchema,
  type TimelineItem,
} from "@/lib/timeline-document";

export const LONG_FORM_RENDER_PIPELINE_VERSION = "u4-segmented-ffmpeg-v1";
export const LONG_FORM_SEGMENT_MAX_SECONDS = 120;

export type LongFormRenderSegment = {
  id: string;
  index: number;
  timelineStartSeconds: number;
  durationSeconds: number;
  outputPath: string;
  plan: ShortFormRenderPlan;
};

export type LongFormRenderManifest = {
  pipelineVersion: string;
  kind: LongFormRenderKind;
  width: number;
  height: number;
  durationSeconds: number;
  segmentCount: number;
  hardwareAccelerated: boolean;
  segments: LongFormRenderSegment[];
  specification: Record<string, unknown>;
};

function replaceArgumentPair(
  args: string[],
  name: string,
  replacement: string[] = [],
) {
  const index = args.indexOf(name);
  if (index < 0) return args;
  return args.slice(0, index).concat(replacement, args.slice(index + 2));
}

function configureLongFormVideoEncoder(
  plan: ShortFormRenderPlan,
  kind: LongFormRenderKind,
  preferHardwareEncoder: boolean,
): ShortFormRenderPlan {
  if (kind !== "EXPORT") return plan;
  let args = [...plan.arguments];
  const codecIndex = args.indexOf("-c:v");
  if (codecIndex >= 0) {
    args[codecIndex + 1] = preferHardwareEncoder
      ? "h264_videotoolbox"
      : "libx264";
  }
  args = replaceArgumentPair(args, "-preset");
  args = replaceArgumentPair(args, "-crf");
  const audioCodecIndex = args.indexOf("-c:a");
  const encoderArguments = preferHardwareEncoder
    ? ["-b:v", "8M", "-profile:v", "high"]
    : ["-preset", "veryfast", "-crf", "22"];
  args.splice(
    audioCodecIndex >= 0 ? audioCodecIndex : args.length - 1,
    0,
    ...encoderArguments,
  );
  return {
    ...plan,
    arguments: args,
    specification: {
      ...plan.specification,
      videoEncoder: preferHardwareEncoder ? "h264_videotoolbox" : "libx264",
      videoPreset: preferHardwareEncoder ? null : "veryfast",
      videoCrf: preferHardwareEncoder ? null : 22,
      videoBitrate: preferHardwareEncoder ? "8M" : null,
    },
  };
}

export function buildLongFormSoftwareFallbackArguments(args: string[]) {
  let next = [...args];
  const codecIndex = next.indexOf("-c:v");
  if (codecIndex >= 0) next[codecIndex + 1] = "libx264";
  next = replaceArgumentPair(next, "-b:v");
  next = replaceArgumentPair(next, "-profile:v");
  const audioCodecIndex = next.indexOf("-c:a");
  next.splice(
    audioCodecIndex >= 0 ? audioCodecIndex : next.length - 1,
    0,
    "-preset",
    "veryfast",
    "-crf",
    "22",
  );
  return next;
}

function round(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function clipText(value: string | null, max = 2_000) {
  return value?.slice(0, max) ?? null;
}

function segmentId(itemId: string, index: number) {
  return `${itemId.slice(0, 80)}-segment-${index}`.slice(0, 100);
}

function sourceSlice(
  item: LongFormTimelineItem,
  localStart: number,
  durationSeconds: number,
) {
  if (
    item.sourceStartSeconds === null ||
    item.sourceEndSeconds === null ||
    !item.sourceProjectId
  ) {
    throw new AppError(
      "A saved source segment is incomplete.",
      409,
      "LONG_FORM_RENDER_SOURCE_INVALID",
    );
  }
  const sourceDuration = item.sourceEndSeconds - item.sourceStartSeconds;
  const playbackDuration = sourceDuration / item.speed;
  if (localStart < playbackDuration - 0.0001) {
    const movingDuration = Math.min(
      durationSeconds,
      playbackDuration - localStart,
    );
    const start = item.sourceStartSeconds + localStart * item.speed;
    const end = Math.min(
      item.sourceEndSeconds,
      start + movingDuration * item.speed,
    );
    return {
      sourceStartSeconds: round(start),
      sourceEndSeconds: round(Math.max(start + 0.001, end)),
      freezeFrameSeconds: round(Math.max(0, durationSeconds - movingDuration)),
    };
  }

  const end = item.sourceEndSeconds;
  const start = Math.max(item.sourceStartSeconds, end - 0.004);
  return {
    sourceStartSeconds: round(start),
    sourceEndSeconds: round(end),
    freezeFrameSeconds: round(durationSeconds),
  };
}

function baseTimelineItem(input: {
  item: LongFormTimelineItem;
  id: string;
  order: number;
  timelineStartSeconds: number;
  durationSeconds: number;
  firstSlice?: boolean;
  lastSlice?: boolean;
}): TimelineItem {
  const { item } = input;
  const source =
    item.kind === "SOURCE_VIDEO"
      ? sourceSlice(
          item,
          input.timelineStartSeconds - item.timelineStartSeconds,
          input.durationSeconds,
        )
      : null;
  return {
    id: input.id,
    kind:
      item.kind === "TRANSITION"
        ? "CARD"
        : (item.kind as Exclude<LongFormTimelineItem["kind"], "TRANSITION">),
    track: item.track,
    order: input.order,
    timelineStartSeconds: round(input.timelineStartSeconds),
    durationSeconds: round(input.durationSeconds),
    sourceProjectId: item.sourceProjectId,
    sourceStartSeconds: source?.sourceStartSeconds ?? item.sourceStartSeconds,
    sourceEndSeconds: source?.sourceEndSeconds ?? item.sourceEndSeconds,
    mediaAssetId: item.mediaAssetId,
    text: clipText(item.text),
    speed: item.speed,
    freezeFrameSeconds: source?.freezeFrameSeconds ?? item.freezeFrameSeconds,
    zoom: item.zoom,
    panX: item.panX,
    panY: item.panY,
    cropMode: item.cropMode,
    reframeKeyframes: [],
    transitionIn: input.firstSlice ? item.transitionIn : "NONE",
    transitionOut: input.lastSlice ? item.transitionOut : "NONE",
    transitionDurationSeconds: Math.min(
      2,
      item.transitionDurationSeconds,
      input.durationSeconds / 2,
    ),
    volume: item.volume,
    muted: item.muted,
    duckOtherAudio: item.duckOtherAudio,
    fadeInSeconds: input.firstSlice ? Math.min(10, item.fadeInSeconds) : 0,
    fadeOutSeconds: input.lastSlice ? Math.min(10, item.fadeOutSeconds) : 0,
    fontScale: item.fontScale,
    positionX: item.positionX,
    positionY: item.positionY,
    locked: item.locked,
  };
}

export function splitLongFormTimelineForRendering(
  input: LongFormTimelineDocument,
  maxSegmentSeconds = LONG_FORM_SEGMENT_MAX_SECONDS,
) {
  const document = longFormTimelineDocumentSchema.parse(input);
  if (
    !Number.isFinite(maxSegmentSeconds) ||
    maxSegmentSeconds <= 0 ||
    maxSegmentSeconds > 180
  ) {
    throw new Error(
      "Long-form render segments must be between 0 and 180 seconds.",
    );
  }
  const videoItems = document.items
    .filter((item) => item.track === "VIDEO")
    .sort((left, right) => left.order - right.order);
  if (videoItems.length === 0) {
    throw new AppError(
      "Add at least one source video or card before rendering.",
      400,
      "LONG_FORM_TIMELINE_EMPTY",
    );
  }

  const segments: Array<{
    id: string;
    index: number;
    timelineStartSeconds: number;
    durationSeconds: number;
    document: ReturnType<typeof timelineDocumentSchema.parse>;
  }> = [];
  for (const item of videoItems) {
    let consumed = 0;
    while (consumed < item.durationSeconds - 0.0001) {
      const durationSeconds = round(
        Math.min(maxSegmentSeconds, item.durationSeconds - consumed),
      );
      const timelineStartSeconds = round(item.timelineStartSeconds + consumed);
      const timelineEndSeconds = timelineStartSeconds + durationSeconds;
      const index = segments.length;
      const videoItem = baseTimelineItem({
        item,
        id: segmentId(item.id, index),
        order: 0,
        timelineStartSeconds: 0,
        durationSeconds,
        firstSlice: consumed < 0.0001,
        lastSlice: consumed + durationSeconds >= item.durationSeconds - 0.0001,
      });
      const overlays = document.items
        .filter(
          (candidate) =>
            candidate.track === "OVERLAY" &&
            candidate.timelineStartSeconds < timelineEndSeconds &&
            candidate.timelineStartSeconds + candidate.durationSeconds >
              timelineStartSeconds,
        )
        .map((candidate, overlayIndex) => {
          const overlapStart = Math.max(
            timelineStartSeconds,
            candidate.timelineStartSeconds,
          );
          const overlapEnd = Math.min(
            timelineEndSeconds,
            candidate.timelineStartSeconds + candidate.durationSeconds,
          );
          return baseTimelineItem({
            item: candidate,
            id: segmentId(candidate.id, overlayIndex),
            order: overlayIndex,
            timelineStartSeconds: round(overlapStart - timelineStartSeconds),
            durationSeconds: round(overlapEnd - overlapStart),
            firstSlice: overlapStart <= candidate.timelineStartSeconds + 0.0001,
            lastSlice:
              overlapEnd >=
              candidate.timelineStartSeconds +
                candidate.durationSeconds -
                0.0001,
          });
        });
      const segmentDocument = timelineDocumentSchema.parse({
        version: SHORT_FORM_TIMELINE_VERSION,
        aspectRatio: "HORIZONTAL_16_9",
        targetDurationSeconds: Math.max(5, durationSeconds),
        currentDurationSeconds: durationSeconds,
        items: [videoItem, ...overlays],
        notes:
          "Bounded long-form render segment. The full timeline remains in its immutable long-form revision.",
      });
      segments.push({
        id: `segment-${String(index + 1).padStart(4, "0")}`,
        index,
        timelineStartSeconds,
        durationSeconds,
        document: segmentDocument,
      });
      consumed += durationSeconds;
    }
  }
  return segments;
}

export function buildLongFormRenderManifest(input: {
  document: LongFormTimelineDocument;
  kind: LongFormRenderKind;
  sources: ShortFormRenderSource[];
  media: ShortFormRenderMedia[];
  temporaryDirectory: string;
  maxSegmentSeconds?: number;
  preferHardwareEncoder?: boolean;
}): LongFormRenderManifest {
  const segments = splitLongFormTimelineForRendering(
    input.document,
    input.maxSegmentSeconds,
  ).map((segment) => {
    const outputPath = path.join(input.temporaryDirectory, `${segment.id}.mp4`);
    const planInput = {
      document: segment.document,
      sources: input.sources,
      media: [],
      outputPath,
    };
    const basePlan =
      input.kind === "EXPORT"
        ? buildShortFormExportPlan(planInput)
        : buildShortFormProxyPlan(planInput);
    const plan = configureLongFormVideoEncoder(
      basePlan,
      input.kind,
      Boolean(input.preferHardwareEncoder),
    );
    return { ...segment, outputPath, plan };
  });
  const first = segments[0]!;
  const durationSeconds = round(
    segments.reduce((total, segment) => total + segment.durationSeconds, 0),
  );
  const mediaItems = input.document.items.filter(
    (item) =>
      (item.kind === "VOICEOVER" || item.kind === "MUSIC") && item.mediaAssetId,
  );
  return {
    pipelineVersion: LONG_FORM_RENDER_PIPELINE_VERSION,
    kind: input.kind,
    width: first.plan.width,
    height: first.plan.height,
    durationSeconds,
    segmentCount: segments.length,
    hardwareAccelerated:
      input.kind === "EXPORT" && Boolean(input.preferHardwareEncoder),
    segments,
    specification: {
      pipelineVersion: LONG_FORM_RENDER_PIPELINE_VERSION,
      kind: input.kind,
      timelineVersion: input.document.version,
      sourcePlanVersion: input.document.sourcePlanVersion,
      width: first.plan.width,
      height: first.plan.height,
      frameRate: 30,
      durationSeconds,
      segmentCount: segments.length,
      maxSegmentSeconds:
        input.maxSegmentSeconds ?? LONG_FORM_SEGMENT_MAX_SECONDS,
      videoCodec: "h264",
      audioCodec: "aac",
      videoEncoder:
        input.kind === "EXPORT" && input.preferHardwareEncoder
          ? "h264_videotoolbox"
          : "libx264",
      mediaItemCount: mediaItems.length,
      hasAudioDucking: mediaItems.some((item) => item.duckOtherAudio),
      strategy:
        "Bounded H.264/AAC segments, concat demuxer, then optional audio-only mix with copied video.",
    },
  };
}

function ffmpegNumber(value: number) {
  return round(value).toFixed(3);
}

function atempoFades(item: LongFormTimelineItem) {
  const filters: string[] = [];
  const fadeIn = Math.min(item.fadeInSeconds, item.durationSeconds / 2);
  const fadeOut = Math.min(item.fadeOutSeconds, item.durationSeconds / 2);
  if (fadeIn > 0) filters.push(`afade=t=in:st=0:d=${ffmpegNumber(fadeIn)}`);
  if (fadeOut > 0) {
    filters.push(
      `afade=t=out:st=${ffmpegNumber(item.durationSeconds - fadeOut)}:d=${ffmpegNumber(fadeOut)}`,
    );
  }
  return filters;
}

export function buildLongFormFinalizeArguments(input: {
  document: LongFormTimelineDocument;
  media: ShortFormRenderMedia[];
  concatPath: string;
  outputPath: string;
  kind: LongFormRenderKind;
}) {
  const document = longFormTimelineDocumentSchema.parse(input.document);
  const assets = new Map(input.media.map((asset) => [asset.id, asset]));
  const mediaItems = document.items
    .filter(
      (item) =>
        (item.kind === "VOICEOVER" || item.kind === "MUSIC") &&
        item.mediaAssetId,
    )
    .sort((left, right) => left.order - right.order);
  const args = ["-hide_banner", "-loglevel", "error", "-i", input.concatPath];
  if (mediaItems.length === 0) {
    return [
      ...args,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "-progress",
      "pipe:1",
      "-nostats",
      "-y",
      input.outputPath,
    ];
  }

  const filters: string[] = [
    `[0:a:0]atrim=duration=${ffmpegNumber(document.currentDurationSeconds)},` +
      "asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo[baseaudio]",
  ];
  const labels: Array<{ label: string; sidechain: string | null }> = [];
  for (const [index, item] of mediaItems.entries()) {
    const asset = assets.get(item.mediaAssetId!);
    if (!asset || item.durationSeconds > asset.durationSeconds + 0.001) {
      throw new AppError(
        "A timeline audio asset is missing or shorter than its saved item.",
        409,
        "LONG_FORM_RENDER_MEDIA_MISSING",
      );
    }
    args.push(
      "-t",
      ffmpegNumber(item.durationSeconds),
      "-i",
      asset.absolutePath,
    );
    const label = `media${index}`;
    const prepared = item.duckOtherAudio ? `${label}prepared` : label;
    const fades = atempoFades(item);
    filters.push(
      `[${index + 1}:a:0]atrim=duration=${ffmpegNumber(item.durationSeconds)},` +
        `asetpts=PTS-STARTPTS,volume=${ffmpegNumber(item.muted ? 0 : item.volume)},` +
        `${fades.join(",")}${fades.length ? "," : ""}` +
        `adelay=${Math.round(item.timelineStartSeconds * 1_000)}:all=1,` +
        `apad=pad_dur=${ffmpegNumber(document.currentDurationSeconds)},` +
        `atrim=duration=${ffmpegNumber(document.currentDurationSeconds)},` +
        `aformat=sample_rates=48000:channel_layouts=stereo[${prepared}]`,
    );
    if (item.duckOtherAudio) {
      filters.push(`[${prepared}]asplit=2[${label}][${label}sidechain]`);
    }
    labels.push({
      label,
      sidechain: item.duckOtherAudio ? `${label}sidechain` : null,
    });
  }
  const ducking = labels.find((label) => label.sidechain);
  let baseLabel = "baseaudio";
  if (ducking?.sidechain) {
    filters.push(
      `[baseaudio][${ducking.sidechain}]sidechaincompress=` +
        "threshold=0.02:ratio=6:attack=20:release=300[duckedbase]",
    );
    baseLabel = "duckedbase";
  }
  filters.push(
    `[${baseLabel}]${labels.map(({ label }) => `[${label}]`).join("")}` +
      `amix=inputs=${labels.length + 1}:duration=first:normalize=0[aout]`,
  );
  return [
    ...args,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    input.kind === "EXPORT" ? "192k" : "128k",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    "-y",
    input.outputPath,
  ];
}

export function buildLongFormConcatArguments(input: {
  listPath: string;
  outputPath: string;
}) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    input.listPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-c",
    "copy",
    "-progress",
    "pipe:1",
    "-nostats",
    "-y",
    input.outputPath,
  ];
}
