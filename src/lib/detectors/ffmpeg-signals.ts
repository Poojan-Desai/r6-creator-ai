import { spawn } from "node:child_process";

import { appConfig } from "@/lib/config";
import type { DetectorRunContext } from "@/lib/detectors/types";

const MAX_METADATA_RECORDS = 500_000;
const MAX_DIAGNOSTIC_CHARACTERS = 32_000;

export type FfmpegMetadataRecord = {
  frame: number;
  pts: number;
  ptsTime: number;
  values: Record<string, number | string>;
};

function parseFiniteNumber(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFfmpegMetadata(text: string) {
  const records: FfmpegMetadataRecord[] = [];
  let current: FfmpegMetadataRecord | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const header = /^frame:(\d+)\s+pts:(-?\d+)\s+pts_time:([-+\d.eE]+)$/.exec(
      line,
    );
    if (header) {
      if (current) records.push(current);
      current = {
        frame: Number(header[1]),
        pts: Number(header[2]),
        ptsTime: Number(header[3]),
        values: {},
      };
      continue;
    }
    const separator = line.indexOf("=");
    if (!current || separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    current.values[key] = parseFiniteNumber(rawValue) ?? rawValue;
  }
  if (current) records.push(current);
  return records.filter(
    (record) => Number.isFinite(record.ptsTime) && record.ptsTime >= 0,
  );
}

class MetadataStreamCollector {
  private remainder = "";
  private readonly blocks: string[] = [];
  private currentLines: string[] = [];

  push(chunk: string) {
    const complete = `${this.remainder}${chunk}`.split(/\r?\n/);
    this.remainder = complete.pop() ?? "";
    for (const line of complete) this.pushLine(line);
  }

  finish() {
    if (this.remainder) this.pushLine(this.remainder);
    if (this.currentLines.length > 0)
      this.blocks.push(this.currentLines.join("\n"));
    const records = this.blocks.flatMap(parseFfmpegMetadata);
    if (records.length > MAX_METADATA_RECORDS) {
      throw new Error(
        "FFmpeg produced too many signal measurements for the configured sample rate.",
      );
    }
    return records;
  }

  private pushLine(line: string) {
    if (/^frame:\d+\s+pts:/.test(line.trim()) && this.currentLines.length > 0) {
      this.blocks.push(this.currentLines.join("\n"));
      this.currentLines = [];
    }
    this.currentLines.push(line);
  }
}

async function runFfmpegMetadataProcess(input: {
  context: DetectorRunContext;
  mediaArguments: string[];
  stage: string;
}) {
  if (!appConfig.ffmpegPath) {
    throw new Error("FFmpeg is not configured for local signal analysis.");
  }
  const { context } = input;
  context.throwIfCancellationRequested();
  const args = [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-i",
    context.project.sourcePath,
    ...input.mediaArguments,
    "-progress",
    "pipe:2",
    "-nostats",
    "-f",
    "null",
    "-",
  ];
  const child = spawn(appConfig.ffmpegPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const unregister = context.registerChildProcess(child);
  const metadata = new MetadataStreamCollector();
  let stderrRemainder = "";
  let diagnostics = "";
  let processedSeconds = 0;
  let lastReported = -1;
  let progressQueue = Promise.resolve();
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => metadata.push(chunk));
  child.stderr.on("data", (chunk: string) => {
    if (diagnostics.length < MAX_DIAGNOSTIC_CHARACTERS) {
      diagnostics = `${diagnostics}${chunk}`.slice(-MAX_DIAGNOSTIC_CHARACTERS);
    }
    const lines = `${stderrRemainder}${chunk}`.split(/\r?\n/);
    stderrRemainder = lines.pop() ?? "";
    for (const line of lines) {
      const match = /^(?:out_time_us|out_time_ms)=([0-9]+)$/.exec(line.trim());
      if (!match) continue;
      processedSeconds = Math.min(
        context.project.durationSeconds,
        Number(match[1]) / 1_000_000,
      );
      const progress = Math.min(
        98,
        Math.floor((processedSeconds / context.project.durationSeconds) * 100),
      );
      if (progress >= lastReported + 2) {
        lastReported = progress;
        progressQueue = progressQueue
          .then(() => context.reportProgress({ progress, stage: input.stage }))
          .catch(() => undefined);
      }
    }
  });

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? -1));
    });
    if (context.isCancellationRequested()) {
      context.throwIfCancellationRequested();
    }
    if (exitCode !== 0) {
      const message = diagnostics
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-6)
        .join(" ");
      throw new Error(
        `FFmpeg signal analysis failed${message ? `: ${message}` : "."}`,
      );
    }
    await progressQueue;
    await context.reportProgress({ progress: 99, stage: input.stage });
    return {
      records: metadata.finish(),
      processedSeconds: Math.max(
        processedSeconds,
        context.project.durationSeconds,
      ),
    };
  } finally {
    unregister();
  }
}

export function runFfmpegVideoMetadata(input: {
  context: DetectorRunContext;
  filterGraph: string;
  stage: string;
}) {
  return runFfmpegMetadataProcess({
    context: input.context,
    stage: input.stage,
    mediaArguments: ["-map", "0:v:0", "-vf", input.filterGraph, "-an"],
  });
}

export function runFfmpegAudioMetadata(input: {
  context: DetectorRunContext;
  streamIndex: number;
  filterGraph: string;
  stage: string;
}) {
  if (!Number.isSafeInteger(input.streamIndex) || input.streamIndex < 0) {
    throw new Error("The selected audio stream index is invalid.");
  }
  return runFfmpegMetadataProcess({
    context: input.context,
    stage: input.stage,
    mediaArguments: [
      "-map",
      `0:${input.streamIndex}`,
      "-af",
      input.filterGraph,
      "-vn",
    ],
  });
}
