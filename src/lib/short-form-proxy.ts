import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdir, readdir, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";

import type { ShortFormAspectRatio } from "@prisma/client";

import { appConfig } from "@/lib/config";
import {
  dataPaths,
  ensureDataDirectories,
  resolveDataPath,
  shortFormProxyDirectory,
  shortFormProxyTemporaryDirectory,
  toDataRelativePath,
} from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  timelineDocumentSchema,
  type TimelineDocument,
  type TimelineItem,
} from "@/lib/timeline-document";
import { probeVideo } from "@/lib/video";

export const SHORT_FORM_PROXY_PIPELINE_VERSION = "u5-proxy-ffmpeg-v4";
export const SHORT_FORM_EXPORT_PIPELINE_VERSION = "u5-export-ffmpeg-v4";

export type ShortFormRenderSource = {
  id: string;
  absolutePath: string;
  audioStreamIndex: number | null;
};

export type ShortFormRenderMedia = {
  id: string;
  absolutePath: string;
  durationSeconds: number;
};

export type ShortFormRenderPlan = {
  arguments: string[];
  width: number;
  height: number;
  durationSeconds: number;
  specification: Record<string, unknown>;
};

type ShortFormRenderMode = "PROXY" | "EXPORT";

type ShortFormRenderInput = {
  document: TimelineDocument;
  sources: ShortFormRenderSource[];
  media: ShortFormRenderMedia[];
  outputPath: string;
};

type ActiveProxyController = {
  child: ChildProcess | null;
  cancelRequested: boolean;
};

const proxyGlobal = globalThis as unknown as {
  r6ShortFormProxyControllers?: Map<string, ActiveProxyController>;
  r6ShortFormProxyReconciled?: boolean;
};
const activeControllers =
  proxyGlobal.r6ShortFormProxyControllers ??
  new Map<string, ActiveProxyController>();
proxyGlobal.r6ShortFormProxyControllers = activeControllers;

class ProxyCancelledError extends Error {}

function safeProxyDiagnostic(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown proxy render error";
  return message
    .replaceAll(dataPaths.root, "[local-data]")
    .replace(/\/Users\/[^/\s]+/g, "/Users/[local-user]")
    .slice(0, 4_000);
}

function dimensions(
  aspectRatio: ShortFormAspectRatio,
  renderMode: ShortFormRenderMode,
) {
  const proxyValues: Record<
    ShortFormAspectRatio,
    { width: number; height: number }
  > = {
    VERTICAL_9_16: { width: 360, height: 640 },
    HORIZONTAL_16_9: { width: 640, height: 360 },
    SQUARE_1_1: { width: 480, height: 480 },
    PORTRAIT_4_5: { width: 384, height: 480 },
  };
  const exportValues: Record<
    ShortFormAspectRatio,
    { width: number; height: number }
  > = {
    VERTICAL_9_16: { width: 1080, height: 1920 },
    HORIZONTAL_16_9: { width: 1920, height: 1080 },
    SQUARE_1_1: { width: 1080, height: 1080 },
    PORTRAIT_4_5: { width: 1080, height: 1350 },
  };
  return (renderMode === "EXPORT" ? exportValues : proxyValues)[aspectRatio];
}

function ffmpegNumber(value: number) {
  return (Math.round(value * 1_000) / 1_000).toFixed(3);
}

function escapeDrawText(value: string) {
  return value
    .slice(0, 240)
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll(":", "\\:")
    .replaceAll("%", "\\%")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replace(/\r?\n/g, "\\n");
}

export function wrapCaptionForRender(
  value: string,
  width: number,
  fontSize: number,
) {
  const maxCharacters = Math.max(
    18,
    Math.floor((width * 0.86) / Math.max(1, fontSize * 0.58)),
  );
  const lines: string[] = [];
  for (const paragraph of value.trim().split(/\r?\n/)) {
    let current = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      if (word.length > maxCharacters) {
        if (current) {
          lines.push(current);
          current = "";
        }
        for (let offset = 0; offset < word.length; offset += maxCharacters) {
          lines.push(word.slice(offset, offset + maxCharacters));
        }
        continue;
      }
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxCharacters && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines.join("\n");
}

function atempoFilters(speed: number) {
  const filters: number[] = [];
  let remaining = speed;
  while (remaining > 2.0001) {
    filters.push(2);
    remaining /= 2;
  }
  while (remaining < 0.4999) {
    filters.push(0.5);
    remaining /= 0.5;
  }
  filters.push(remaining);
  return filters.map((value) => `atempo=${ffmpegNumber(value)}`);
}

function videoTransform(item: TimelineItem, width: number, height: number) {
  if (item.cropMode === "FIT") {
    return [
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    ];
  }
  const keyframes = [...item.reframeKeyframes].sort(
    (left, right) => left.timeSeconds - right.timeSeconds,
  );
  const first = keyframes[0] ?? {
    zoom: item.zoom,
    panX: item.panX,
    panY: item.panY,
  };
  const last = keyframes.at(-1) ?? first;
  const totalFrames = Math.max(1, Math.round(item.durationSeconds * 30));
  const progress = `min(1,on/${totalFrames})`;
  const zoomExpression = `${ffmpegNumber(first.zoom)}+(${ffmpegNumber(last.zoom - first.zoom)})*${progress}`;
  const panXExpression = `${ffmpegNumber((first.panX + 1) / 2)}+(${ffmpegNumber((last.panX - first.panX) / 2)})*${progress}`;
  const panYExpression = `${ffmpegNumber((first.panY + 1) / 2)}+(${ffmpegNumber((last.panY - first.panY) / 2)})*${progress}`;
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    `zoompan=z='${zoomExpression}':x='(iw-iw/zoom)*(${panXExpression})':y='(ih-ih/zoom)*(${panYExpression})':d=1:s=${width}x${height}:fps=30`,
  ];
}

function visualFades(item: TimelineItem) {
  const filters: string[] = [];
  const duration = Math.min(
    item.transitionDurationSeconds,
    item.durationSeconds / 2,
  );
  if (duration > 0 && item.transitionIn !== "NONE") {
    filters.push(`fade=t=in:st=0:d=${ffmpegNumber(duration)}`);
  }
  if (duration > 0 && item.transitionOut !== "NONE") {
    filters.push(
      `fade=t=out:st=${ffmpegNumber(item.durationSeconds - duration)}:d=${ffmpegNumber(duration)}`,
    );
  }
  return filters;
}

function audioFades(item: TimelineItem) {
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

function drawTextFilter(
  item: TimelineItem,
  width: number,
  height: number,
  includeEnable: boolean,
) {
  if (!item.text) return null;
  const fontSize = Math.max(14, Math.round(height * 0.055 * item.fontScale));
  const lines =
    item.kind === "CAPTION"
      ? wrapCaptionForRender(item.text, width, fontSize).split("\n")
      : [item.text];
  const enable = includeEnable
    ? `:enable='between(t,${ffmpegNumber(item.timelineStartSeconds)},${ffmpegNumber(item.timelineStartSeconds + item.durationSeconds)})'`
    : "";
  const lineHeight = Math.round(fontSize * 1.25);
  const totalHeight = lineHeight * lines.length;
  return lines
    .map((line, index) => {
      const y =
        lines.length === 1
          ? `(h-text_h)*${ffmpegNumber(item.positionY)}`
          : `(h-${totalHeight})*${ffmpegNumber(item.positionY)}+${index * lineHeight}`;
      return (
        `drawtext=fontfile=${escapeDrawText(appConfig.fontPath)}:` +
        `text='${escapeDrawText(line)}':fontcolor=white:` +
        `fontsize=${fontSize}:borderw=${Math.max(1, Math.round(fontSize / 14))}:` +
        `bordercolor=black@0.85:x='(w-text_w)*${ffmpegNumber(item.positionX)}':` +
        `y='${y}'${enable}`
      );
    })
    .join(",");
}

function buildShortFormRenderPlan(
  input: ShortFormRenderInput & { renderMode: ShortFormRenderMode },
): ShortFormRenderPlan {
  const document = timelineDocumentSchema.parse(input.document);
  const videoItems = document.items
    .filter(
      (item) =>
        item.track === "VIDEO" &&
        (item.kind === "SOURCE_VIDEO" || item.kind === "CARD"),
    )
    .sort((left, right) => left.order - right.order);
  if (videoItems.length === 0) {
    throw new AppError(
      "Add at least one source-video or card item before rendering.",
      400,
      "EMPTY_TIMELINE",
    );
  }
  const { width, height } = dimensions(document.aspectRatio, input.renderMode);
  const sources = new Map(input.sources.map((source) => [source.id, source]));
  const media = new Map(input.media.map((asset) => [asset.id, asset]));
  const args = ["-hide_banner", "-loglevel", "error"];
  const filters: string[] = [];
  const segmentLabels: Array<{ video: string; audio: string }> = [];
  let inputIndex = 0;

  for (const [segmentIndex, item] of videoItems.entries()) {
    const videoInput = inputIndex++;
    let hasSourceAudio = false;
    if (
      item.kind === "SOURCE_VIDEO" &&
      item.sourceProjectId &&
      item.sourceStartSeconds !== null &&
      item.sourceEndSeconds !== null
    ) {
      const source = sources.get(item.sourceProjectId);
      if (!source) {
        throw new AppError(
          "A timeline source file is unavailable.",
          409,
          "TIMELINE_SOURCE_MISSING",
        );
      }
      hasSourceAudio = source.audioStreamIndex !== null;
      args.push(
        "-ss",
        ffmpegNumber(item.sourceStartSeconds),
        "-t",
        ffmpegNumber(item.sourceEndSeconds - item.sourceStartSeconds),
        "-i",
        source.absolutePath,
      );
    } else {
      args.push(
        "-f",
        "lavfi",
        "-t",
        ffmpegNumber(item.durationSeconds),
        "-i",
        `color=c=0x0b0f17:s=${width}x${height}:r=30`,
      );
    }
    const silenceInput = inputIndex++;
    args.push(
      "-f",
      "lavfi",
      "-t",
      ffmpegNumber(item.durationSeconds),
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
    );

    const visual = [
      `setpts=PTS-STARTPTS`,
      ...videoTransform(item, width, height),
    ];
    if (item.cropMode === "FIT") {
      visual.push("fps=30");
    }
    visual.push("setpts=N/(30*TB)");
    if (item.kind === "SOURCE_VIDEO") {
      visual.push(`setpts=PTS/${ffmpegNumber(item.speed)}`);
      if (item.freezeFrameSeconds > 0) {
        visual.push(
          `tpad=stop_mode=clone:stop_duration=${ffmpegNumber(item.freezeFrameSeconds)}`,
        );
      }
    }
    const cardText =
      item.kind === "CARD" ? drawTextFilter(item, width, height, false) : null;
    if (cardText) visual.push(cardText);
    visual.push(...visualFades(item));
    visual.push(
      `trim=duration=${ffmpegNumber(item.durationSeconds)}`,
      "setpts=PTS-STARTPTS",
      "fps=30",
      "setsar=1",
      "format=yuv420p",
    );
    const videoLabel = `sv${segmentIndex}`;
    filters.push(`[${videoInput}:v:0]${visual.join(",")}[${videoLabel}]`);

    const audio =
      hasSourceAudio && !item.muted
        ? [
            `atrim=duration=${ffmpegNumber(
              (item.sourceEndSeconds ?? 0) - (item.sourceStartSeconds ?? 0),
            )}`,
            "asetpts=PTS-STARTPTS",
            ...atempoFilters(item.speed),
            item.freezeFrameSeconds > 0
              ? `apad=pad_dur=${ffmpegNumber(item.freezeFrameSeconds)}`
              : "anull",
            `atrim=duration=${ffmpegNumber(item.durationSeconds)}`,
            `volume=${ffmpegNumber(item.volume)}`,
            ...audioFades(item),
            "aformat=sample_rates=48000:channel_layouts=stereo",
          ]
        : [
            `atrim=duration=${ffmpegNumber(item.durationSeconds)}`,
            "asetpts=PTS-STARTPTS",
            "aformat=sample_rates=48000:channel_layouts=stereo",
          ];
    const audioLabel = `sa${segmentIndex}`;
    const source = item.sourceProjectId
      ? sources.get(item.sourceProjectId)
      : null;
    const audioInput =
      hasSourceAudio && !item.muted
        ? `[${videoInput}:${source!.audioStreamIndex}]`
        : `[${silenceInput}:a:0]`;
    filters.push(`${audioInput}${audio.join(",")}[${audioLabel}]`);
    segmentLabels.push({ video: videoLabel, audio: audioLabel });
  }

  const videoConcatInputs = segmentLabels
    .map((label) => `[${label.video}]`)
    .join("");
  const audioConcatInputs = segmentLabels
    .map((label) => `[${label.audio}]`)
    .join("");
  filters.push(
    `${videoConcatInputs}concat=n=${segmentLabels.length}:v=1:a=0[basev]`,
    `${audioConcatInputs}concat=n=${segmentLabels.length}:v=0:a=1[basea]`,
  );

  let currentVideoLabel = "basev";
  const overlays = document.items
    .filter(
      (item) =>
        item.track === "OVERLAY" &&
        (item.kind === "TEXT_OVERLAY" || item.kind === "CAPTION"),
    )
    .sort((left, right) => left.order - right.order);
  for (const [index, item] of overlays.entries()) {
    const draw = drawTextFilter(item, width, height, true);
    if (!draw) continue;
    const outputLabel = `overlay${index}`;
    filters.push(`[${currentVideoLabel}]${draw}[${outputLabel}]`);
    currentVideoLabel = outputLabel;
  }
  filters.push(`[${currentVideoLabel}]null[vout]`);

  const mediaLabels: Array<{
    label: string;
    sidechainLabel: string | null;
    item: TimelineItem;
  }> = [];
  const mediaItems = document.items
    .filter(
      (item) =>
        (item.kind === "VOICEOVER" || item.kind === "MUSIC") &&
        item.mediaAssetId,
    )
    .sort((left, right) => left.order - right.order);
  for (const [index, item] of mediaItems.entries()) {
    const asset = media.get(item.mediaAssetId!);
    if (!asset || item.durationSeconds > asset.durationSeconds + 0.001) {
      throw new AppError(
        "A timeline audio asset is missing or shorter than its saved item.",
        409,
        "TIMELINE_MEDIA_MISSING",
      );
    }
    const mediaInput = inputIndex++;
    args.push(
      "-t",
      ffmpegNumber(item.durationSeconds),
      "-i",
      asset.absolutePath,
    );
    const label = `media${index}`;
    const processedLabel = item.duckOtherAudio ? `${label}processed` : label;
    const delay = Math.round(item.timelineStartSeconds * 1_000);
    filters.push(
      `[${mediaInput}:a:0]atrim=duration=${ffmpegNumber(item.durationSeconds)},` +
        `asetpts=PTS-STARTPTS,volume=${ffmpegNumber(item.muted ? 0 : item.volume)},` +
        `${audioFades(item).join(",")}${audioFades(item).length ? "," : ""}` +
        `adelay=${delay}:all=1,apad=pad_dur=${ffmpegNumber(document.currentDurationSeconds)},` +
        `atrim=duration=${ffmpegNumber(document.currentDurationSeconds)},` +
        `aformat=sample_rates=48000:channel_layouts=stereo[${processedLabel}]`,
    );
    if (item.duckOtherAudio) {
      filters.push(`[${processedLabel}]asplit=2[${label}][${label}sidechain]`);
    }
    mediaLabels.push({
      label,
      sidechainLabel: item.duckOtherAudio ? `${label}sidechain` : null,
      item,
    });
  }

  if (mediaLabels.length === 0) {
    filters.push("[basea]anull[aout]");
  } else {
    const duckingLabels = mediaLabels.flatMap(({ sidechainLabel }) =>
      sidechainLabel ? [sidechainLabel] : [],
    );
    let baseAudioLabel = "basea";
    if (duckingLabels.length > 0) {
      const sidechainLabel =
        duckingLabels.length === 1 ? duckingLabels[0]! : "combinedsidechain";
      if (duckingLabels.length > 1) {
        filters.push(
          `${duckingLabels.map((label) => `[${label}]`).join("")}` +
            `amix=inputs=${duckingLabels.length}:duration=longest:normalize=0[${sidechainLabel}]`,
        );
      }
      filters.push(
        `[basea][${sidechainLabel}]sidechaincompress=` +
          "threshold=0.02:ratio=6:attack=20:release=300[duckedbase]",
      );
      baseAudioLabel = "duckedbase";
    }
    const mixInputs = [`[${baseAudioLabel}]`]
      .concat(mediaLabels.map(({ label }) => `[${label}]`))
      .join("");
    filters.push(
      `${mixInputs}amix=inputs=${mediaLabels.length + 1}:duration=first:normalize=0[aout]`,
    );
  }

  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    input.renderMode === "EXPORT" ? "medium" : "veryfast",
    "-crf",
    input.renderMode === "EXPORT" ? "20" : "28",
    "-c:a",
    "aac",
    "-b:a",
    input.renderMode === "EXPORT" ? "192k" : "128k",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-nostats",
    "-y",
    input.outputPath,
  );
  return {
    arguments: args,
    width,
    height,
    durationSeconds: document.currentDurationSeconds,
    specification: {
      pipelineVersion:
        input.renderMode === "EXPORT"
          ? SHORT_FORM_EXPORT_PIPELINE_VERSION
          : SHORT_FORM_PROXY_PIPELINE_VERSION,
      renderMode: input.renderMode,
      timelineVersion: document.version,
      aspectRatio: document.aspectRatio,
      width,
      height,
      durationSeconds: document.currentDurationSeconds,
      videoItemCount: videoItems.length,
      overlayCount: overlays.length,
      mediaItemCount: mediaItems.length,
      videoCodec: "h264",
      audioCodec: "aac",
      videoPreset: input.renderMode === "EXPORT" ? "medium" : "veryfast",
      videoCrf: input.renderMode === "EXPORT" ? 20 : 28,
      audioBitrate: input.renderMode === "EXPORT" ? "192k" : "128k",
      note:
        input.renderMode === "EXPORT"
          ? "Full-resolution user-requested deterministic MP4 export."
          : "Low-resolution user-requested preview. Final export uses a separate job.",
    },
  };
}

export function buildShortFormProxyPlan(
  input: ShortFormRenderInput,
): ShortFormRenderPlan {
  return buildShortFormRenderPlan({ ...input, renderMode: "PROXY" });
}

export function buildShortFormExportPlan(
  input: ShortFormRenderInput,
): ShortFormRenderPlan {
  return buildShortFormRenderPlan({ ...input, renderMode: "EXPORT" });
}

async function cleanupTemporaryDirectory(jobId: string) {
  await rm(shortFormProxyTemporaryDirectory(jobId), {
    recursive: true,
    force: true,
  });
}

async function cleanupOldProxyJobs(timelineId: string, keep = 5) {
  const oldJobs = await db.shortFormProxyJob.findMany({
    where: {
      timelineId,
      status: { in: ["COMPLETED", "CANCELLED", "ERROR"] },
    },
    orderBy: { createdAt: "desc" },
    skip: keep,
  });
  for (const job of oldJobs) {
    if (job.relativePath) {
      await unlink(resolveDataPath(job.relativePath)).catch(() => undefined);
    }
    await db.shortFormProxyJob.delete({ where: { id: job.id } });
  }
}

export async function reconcileShortFormProxyJobs() {
  if (proxyGlobal.r6ShortFormProxyReconciled) return;
  const interrupted = await db.shortFormProxyJob.findMany({
    where: { status: { in: ["QUEUED", "RUNNING"] } },
    select: { id: true },
  });
  const now = new Date();
  for (const job of interrupted) {
    await cleanupTemporaryDirectory(job.id);
    await db.shortFormProxyJob.update({
      where: { id: job.id },
      data: {
        status: "ERROR",
        stage: "Interrupted",
        errorMessage:
          "Preview rendering stopped when the application restarted. Start a new preview when ready.",
        completedAt: now,
      },
    });
  }
  await mkdir(dataPaths.shortFormProxyTemp, { recursive: true });
  const activeIds = new Set(
    (
      await db.shortFormProxyJob.findMany({
        where: { status: { in: ["QUEUED", "RUNNING"] } },
        select: { id: true },
      })
    ).map((job) => job.id),
  );
  for (const entry of await readdir(dataPaths.shortFormProxyTemp).catch(
    () => [] as string[],
  )) {
    if (!activeIds.has(entry)) {
      await rm(path.join(dataPaths.shortFormProxyTemp, entry), {
        recursive: true,
        force: true,
      });
    }
  }
  proxyGlobal.r6ShortFormProxyReconciled = true;
}

async function loadProxyContext(jobId: string, outputPath: string) {
  const job = await db.shortFormProxyJob.findUnique({
    where: { id: jobId },
    include: {
      timelineRevision: true,
      timeline: {
        include: {
          production: {
            include: {
              studioProject: {
                include: {
                  inputs: {
                    where: {
                      kind: {
                        in: ["PRIMARY_RECORDING", "ADDITIONAL_RECORDING"],
                      },
                      videoProjectId: { not: null },
                    },
                    include: {
                      videoProject: { include: { audioTracks: true } },
                    },
                  },
                  mediaAssets: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!job || job.status !== "QUEUED" || job.cancelRequestedAt) return null;
  const project = job.timeline.production.studioProject;
  const document = timelineDocumentSchema.parse(
    JSON.parse(job.timelineRevision.documentJson) as unknown,
  );
  return {
    job,
    plan: buildShortFormProxyPlan({
      document,
      sources: project.inputs
        .filter((input) => input.videoProject)
        .map((input) => {
          const tracks = input.videoProject!.audioTracks;
          const selected =
            tracks.find((track) => track.id === project.selectedAudioTrackId) ??
            (tracks.length === 1 ? tracks[0] : null);
          return {
            id: input.videoProject!.id,
            absolutePath: resolveDataPath(
              input.videoProject!.sourceRelativePath,
            ),
            audioStreamIndex: selected?.streamIndex ?? null,
          };
        }),
      media: project.mediaAssets.map((asset) => ({
        id: asset.id,
        absolutePath: resolveDataPath(asset.relativePath),
        durationSeconds: asset.durationSeconds,
      })),
      outputPath,
    }),
  };
}

export async function runShortFormProxyJob(jobId: string) {
  if (activeControllers.has(jobId)) return;
  const controller: ActiveProxyController = {
    child: null,
    cancelRequested: false,
  };
  activeControllers.set(jobId, controller);
  const temporaryDirectory = shortFormProxyTemporaryDirectory(jobId);
  const temporaryPath = path.join(temporaryDirectory, "preview.processing.mp4");
  let finalPath: string | null = null;
  try {
    if (!appConfig.ffmpegPath) {
      throw new AppError(
        "FFmpeg is unavailable. Reinstall dependencies and try again.",
        503,
        "FFMPEG_UNAVAILABLE",
      );
    }
    await ensureDataDirectories();
    await mkdir(temporaryDirectory, { recursive: true });
    const context = await loadProxyContext(jobId, temporaryPath);
    if (!context) {
      if (controller.cancelRequested) throw new ProxyCancelledError();
      return;
    }
    finalPath = path.join(
      shortFormProxyDirectory(context.job.timelineId),
      `${jobId}.mp4`,
    );
    await mkdir(path.dirname(finalPath), { recursive: true });
    await db.shortFormProxyJob.update({
      where: { id: jobId },
      data: {
        status: "RUNNING",
        progress: 1,
        stage: "Rendering low-resolution preview",
        renderSpecJson: JSON.stringify(context.plan.specification),
        width: context.plan.width,
        height: context.plan.height,
        durationSeconds: context.plan.durationSeconds,
        startedAt: new Date(),
        errorMessage: null,
      },
    });

    await new Promise<void>((resolve, reject) => {
      const child = spawn(appConfig.ffmpegPath!, context.plan.arguments, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      controller.child = child;
      let stdout = "";
      let stderr = "";
      let lastProgressAt = 0;
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        const lines = stdout.split(/\r?\n/);
        stdout = lines.pop() ?? "";
        for (const line of lines) {
          const match = /^out_time_(?:ms|us)=(\d+)$/.exec(line);
          if (!match) continue;
          const seconds = Number(match[1]) / 1_000_000;
          const progress = Math.max(
            1,
            Math.min(
              98,
              Math.round(
                (seconds / Math.max(0.1, context.plan.durationSeconds)) * 100,
              ),
            ),
          );
          if (Date.now() - lastProgressAt > 500) {
            lastProgressAt = Date.now();
            void db.shortFormProxyJob
              .update({
                where: { id: jobId },
                data: { progress },
              })
              .catch(() => undefined);
          }
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < 200_000) stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code, signal) => {
        controller.child = null;
        if (controller.cancelRequested) {
          reject(new ProxyCancelledError());
        } else if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              stderr.trim() ||
                `FFmpeg stopped with ${signal ?? `code ${code ?? "unknown"}`}.`,
            ),
          );
        }
      });
    });
    if (controller.cancelRequested) throw new ProxyCancelledError();
    const output = await stat(temporaryPath);
    if (!output.isFile() || output.size <= 0) {
      throw new Error("FFmpeg produced an empty preview.");
    }
    await rename(temporaryPath, finalPath);
    const metadata = await probeVideo(finalPath);
    await db.shortFormProxyJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        progress: 100,
        stage: "Preview ready",
        relativePath: toDataRelativePath(finalPath),
        fileSizeBytes: BigInt(output.size),
        width: metadata.width,
        height: metadata.height,
        durationSeconds: metadata.durationSeconds,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    if (!(error instanceof ProxyCancelledError)) {
      console.error("Short-form proxy diagnostic:", safeProxyDiagnostic(error));
    }
    await Promise.all([
      unlink(temporaryPath).catch(() => undefined),
      finalPath ? unlink(finalPath).catch(() => undefined) : Promise.resolve(),
    ]);
    const cancelled =
      error instanceof ProxyCancelledError || controller.cancelRequested;
    await db.shortFormProxyJob
      .update({
        where: { id: jobId },
        data: {
          status: cancelled ? "CANCELLED" : "ERROR",
          progress: cancelled ? 0 : undefined,
          stage: cancelled ? "Cancelled" : "Preview failed",
          errorMessage: cancelled
            ? null
            : "The preview could not be rendered. Review the timeline settings and try again.",
          completedAt: new Date(),
        },
      })
      .catch(() => undefined);
  } finally {
    await cleanupTemporaryDirectory(jobId);
    activeControllers.delete(jobId);
  }
}

function scheduleProxyJob(jobId: string) {
  setImmediate(() => void runShortFormProxyJob(jobId));
}

export async function startShortFormProxyJob(studioProjectId: string) {
  await reconcileShortFormProxyJobs();
  const production = await db.shortFormProduction.findUnique({
    where: { studioProjectId },
    include: {
      timeline: {
        include: {
          revisions: { orderBy: { version: "desc" }, take: 1 },
          proxyJobs: {
            where: { status: { in: ["QUEUED", "RUNNING"] } },
            take: 1,
          },
          exportJobs: {
            where: { status: { in: ["QUEUED", "RUNNING"] } },
            take: 1,
          },
        },
      },
    },
  });
  const timeline = production?.timeline;
  const revision = timeline?.revisions[0];
  if (!timeline || !revision) {
    throw new AppError(
      "Create and save a non-destructive timeline first.",
      409,
      "TIMELINE_REQUIRED",
    );
  }
  if (timeline.proxyJobs.length > 0 || timeline.exportJobs.length > 0) {
    throw new AppError(
      "Wait for the active preview or export to finish, or cancel it first.",
      409,
      "RENDER_ALREADY_RUNNING",
    );
  }
  await cleanupOldProxyJobs(timeline.id);
  const reusable = await db.shortFormProxyJob.findFirst({
    where: {
      timelineId: timeline.id,
      timelineRevisionId: revision.id,
      status: "COMPLETED",
      relativePath: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (reusable?.relativePath) {
    try {
      const saved = await stat(resolveDataPath(reusable.relativePath));
      if (saved.isFile() && saved.size > 0) return reusable;
    } catch {
      // A missing cached proxy should be rendered again.
    }
  }
  const document = timelineDocumentSchema.parse(
    JSON.parse(revision.documentJson) as unknown,
  );
  if (!document.items.some((item) => item.track === "VIDEO")) {
    throw new AppError(
      "Add at least one video or card item before rendering a preview.",
      400,
      "EMPTY_TIMELINE",
    );
  }
  const job = await db.shortFormProxyJob.create({
    data: {
      timelineId: timeline.id,
      timelineRevisionId: revision.id,
      pipelineVersion: SHORT_FORM_PROXY_PIPELINE_VERSION,
      renderSpecJson: JSON.stringify({
        timelineVersion: revision.version,
        aspectRatio: document.aspectRatio,
      }),
    },
  });
  scheduleProxyJob(job.id);
  return job;
}

export async function cancelShortFormProxyJob(
  jobId: string,
  studioProjectId?: string,
) {
  const job = await db.shortFormProxyJob.findUnique({
    where: { id: jobId },
    include: {
      timeline: {
        include: { production: { select: { studioProjectId: true } } },
      },
    },
  });
  if (
    !job ||
    (studioProjectId &&
      job.timeline.production.studioProjectId !== studioProjectId)
  ) {
    throw new AppError(
      "That preview job does not exist.",
      404,
      "PROXY_JOB_NOT_FOUND",
    );
  }
  if (!["QUEUED", "RUNNING"].includes(job.status)) return job;
  await db.shortFormProxyJob.update({
    where: { id: jobId },
    data: { cancelRequestedAt: new Date(), stage: "Cancelling preview" },
  });
  const controller = activeControllers.get(jobId);
  if (controller) {
    controller.cancelRequested = true;
    const child = controller.child;
    child?.kill("SIGTERM");
    if (child) {
      const forceKill = setTimeout(() => child.kill("SIGKILL"), 2_000);
      child.once("close", () => clearTimeout(forceKill));
    }
  } else {
    await db.shortFormProxyJob.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED",
        progress: 0,
        stage: "Cancelled",
        completedAt: new Date(),
      },
    });
    await cleanupTemporaryDirectory(jobId);
  }
  return db.shortFormProxyJob.findUniqueOrThrow({ where: { id: jobId } });
}
