import type { DetectorEventResult } from "@/lib/detectors/types";
import {
  clamp,
  normalizeTimeSeries,
  type RawTimeSeriesPoint,
  type TimeSeriesPoint,
} from "@/lib/signals/time-series";

import type { FfmpegMetadataRecord } from "./ffmpeg-signals";

export type SignalInterval = {
  startSeconds: number;
  peakSeconds: number;
  endSeconds: number;
  points: TimeSeriesPoint[];
};

export function numberParameter(
  parameters: Record<string, unknown>,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const candidate = parameters[key];
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? clamp(candidate, minimum, maximum)
    : fallback;
}

export function metadataMeasurements(input: {
  records: FfmpegMetadataRecord[];
  key: string;
  durationSeconds: number;
  sampleIntervalSeconds: number;
  transform?: (value: number) => number;
}) {
  const byTimestamp = new Map<number, RawTimeSeriesPoint>();
  for (const record of input.records) {
    const raw = record.values[input.key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const timestampSeconds = clamp(record.ptsTime, 0, input.durationSeconds);
    const halfWindow = input.sampleIntervalSeconds / 2;
    byTimestamp.set(timestampSeconds, {
      timestampSeconds,
      windowStartSeconds: clamp(
        timestampSeconds - halfWindow,
        0,
        input.durationSeconds,
      ),
      windowEndSeconds: clamp(
        timestampSeconds + halfWindow,
        0,
        input.durationSeconds,
      ),
      rawValue: input.transform ? input.transform(raw) : raw,
    });
  }
  return [...byTimestamp.values()].sort(
    (left, right) => left.timestampSeconds - right.timestampSeconds,
  );
}

export function normalizeMeasurements(
  rawPoints: RawTimeSeriesPoint[],
  durationSeconds: number,
  sampleIntervalSeconds: number,
) {
  if (rawPoints.length === 0) {
    throw new Error("FFmpeg returned no usable signal measurements.");
  }
  return normalizeTimeSeries(rawPoints, {
    durationSeconds,
    baselineWindowPoints: Math.max(
      5,
      Math.round(10 / Math.max(sampleIntervalSeconds, 0.01)),
    ),
  });
}

export function findSignalIntervals(input: {
  points: TimeSeriesPoint[];
  predicate: (point: TimeSeriesPoint) => boolean;
  minimumDurationSeconds: number;
  maximumGapSeconds: number;
  peakBy?: (point: TimeSeriesPoint) => number;
}) {
  const groups: TimeSeriesPoint[][] = [];
  let current: TimeSeriesPoint[] = [];
  for (const point of input.points) {
    if (!input.predicate(point)) {
      if (current.length > 0) groups.push(current);
      current = [];
      continue;
    }
    const previous = current.at(-1);
    if (
      previous &&
      point.windowStartSeconds - previous.windowEndSeconds >
        input.maximumGapSeconds
    ) {
      groups.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 0) groups.push(current);
  return groups
    .map((points) => {
      const peak = points.reduce((selected, point) =>
        (input.peakBy?.(point) ?? point.rawValue) >
        (input.peakBy?.(selected) ?? selected.rawValue)
          ? point
          : selected,
      );
      return {
        startSeconds: points[0]!.windowStartSeconds,
        peakSeconds: peak.timestampSeconds,
        endSeconds: points.at(-1)!.windowEndSeconds,
        points,
      };
    })
    .filter(
      (interval) =>
        interval.endSeconds - interval.startSeconds + 0.001 >=
        input.minimumDurationSeconds,
    );
}

export function eventWindow(
  timestampSeconds: number,
  durationSeconds: number,
  radiusSeconds: number,
) {
  const startSeconds = clamp(
    timestampSeconds - radiusSeconds,
    0,
    durationSeconds,
  );
  let endSeconds = clamp(timestampSeconds + radiusSeconds, 0, durationSeconds);
  if (endSeconds <= startSeconds) {
    endSeconds = Math.min(durationSeconds, startSeconds + 0.01);
  }
  return { startSeconds, peakSeconds: timestampSeconds, endSeconds };
}

export function buildVideoEvent(input: {
  eventType: string;
  interval: Pick<SignalInterval, "startSeconds" | "peakSeconds" | "endSeconds">;
  confidence: number;
  supportingEvidence: string[];
  conflictingEvidence?: string[];
  sourceSignal: "VIDEO" | "FRAME_DIFFERENCE" | "MOTION";
  rawMeasurements: Record<string, unknown>;
  thresholds: Record<string, unknown>;
  warningMessages?: string[];
  processingDurationMs: number;
}): DetectorEventResult {
  return {
    eventType: input.eventType,
    ...input.interval,
    confidence: clamp(input.confidence, 0, 1),
    supportingEvidence: input.supportingEvidence,
    conflictingEvidence: input.conflictingEvidence ?? [],
    sourceSignal: input.sourceSignal,
    rawMeasurements: input.rawMeasurements,
    thresholds: input.thresholds,
    processingDurationMs: input.processingDurationMs,
    warningMessages: input.warningMessages,
    evidence: input.supportingEvidence.map((summary) => ({
      kind: "SUPPORTING",
      sourceSignal: input.sourceSignal,
      summary,
      timestampSeconds: input.interval.peakSeconds,
    })),
  };
}
