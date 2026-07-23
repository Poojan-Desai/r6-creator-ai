import type {
  AudioTrack,
  AudioTrackRole,
  DetectorSourceSignal,
} from "@prisma/client";

import { db } from "@/lib/db";
import type {
  DetectorEventResult,
  DetectorRunContext,
  DetectorSignalCurveResult,
  LocalDetector,
} from "@/lib/detectors/types";
import {
  clamp,
  normalizeTimeSeries,
  percentile,
  type RawTimeSeriesPoint,
  type TimeSeriesPoint,
} from "@/lib/signals/time-series";

import { runFfmpegAudioMetadata } from "./ffmpeg-signals";
import {
  buildVideoEvent,
  findSignalIntervals,
  numberParameter,
} from "./video-signal-utils";

const VERSION = "1.0.0";
const ANALYSIS_SAMPLE_RATE = 16_000;

type ConfirmedTrack = AudioTrack & {
  analysisRole: AudioTrackRole;
  roleConfirmedAt: Date;
};

type AudioMeasurement = {
  track: ConfirmedTrack;
  windowSeconds: number;
  rmsRaw: RawTimeSeriesPoint[];
  peakRaw: RawTimeSeriesPoint[];
  rms: ReturnType<typeof normalizeTimeSeries>;
  peak: ReturnType<typeof normalizeTimeSeries>;
  clippedWindowCount: number;
  processedSeconds: number;
};

function sourceSignal(role: AudioTrackRole): DetectorSourceSignal {
  if (role === "CREATOR_MICROPHONE") return "CREATOR_MICROPHONE";
  if (role === "GAME_AUDIO") return "GAME_AUDIO";
  return "AUDIO";
}

function roleLabel(role: AudioTrackRole) {
  if (role === "CREATOR_MICROPHONE") return "creator microphone";
  if (role === "GAME_AUDIO") return "game audio";
  if (role === "MIXED_AUDIO") return "mixed audio";
  return "unknown-role audio";
}

function rolePrefix(role: AudioTrackRole) {
  if (role === "CREATOR_MICROPHONE") return "CREATOR";
  if (role === "GAME_AUDIO") return "GAME";
  if (role === "MIXED_AUDIO") return "MIXED";
  return "UNKNOWN";
}

async function confirmedTracks(projectId: string) {
  const tracks = await db.audioTrack.findMany({
    where: {
      projectId,
      analysisRole: { not: null },
      roleConfirmedAt: { not: null },
    },
    orderBy: { streamIndex: "asc" },
  });
  return tracks.filter(
    (track): track is ConfirmedTrack =>
      track.analysisRole !== null && track.roleConfirmedAt !== null,
  );
}

export function parseAudioLevelWindows(input: {
  records: Awaited<ReturnType<typeof runFfmpegAudioMetadata>>["records"];
  key: string;
  durationSeconds: number;
  windowSeconds: number;
  streamIndex: number;
}) {
  const points: RawTimeSeriesPoint[] = [];
  for (const record of input.records) {
    const raw = record.values[input.key];
    const value =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.toLowerCase().includes("inf")
          ? -120
          : null;
    if (value === null || !Number.isFinite(value)) continue;
    const windowStartSeconds = clamp(record.ptsTime, 0, input.durationSeconds);
    const windowEndSeconds = clamp(
      windowStartSeconds + input.windowSeconds,
      0,
      input.durationSeconds,
    );
    points.push({
      timestampSeconds: (windowStartSeconds + windowEndSeconds) / 2,
      windowStartSeconds,
      windowEndSeconds,
      rawValue: value,
      sourceStreamIndex: input.streamIndex,
      qualityWarning:
        value <= -119 ? "Digital silence or unmeasurable level" : undefined,
    });
  }
  return points;
}

async function measureTrack(
  context: DetectorRunContext,
  track: ConfirmedTrack,
  windowSeconds: number,
  baselineWindowSeconds: number,
) {
  const samplesPerWindow = Math.max(
    800,
    Math.round(ANALYSIS_SAMPLE_RATE * windowSeconds),
  );
  const output = await runFfmpegAudioMetadata({
    context,
    streamIndex: track.streamIndex,
    stage: `Measuring ${roleLabel(track.analysisRole)} stream ${track.streamIndex}`,
    filterGraph: [
      `aresample=${ANALYSIS_SAMPLE_RATE}`,
      `asetnsamples=n=${samplesPerWindow}:p=1`,
      "astats=metadata=1:reset=1",
      "ametadata=mode=print:file=-",
    ].join(","),
  });
  const rmsRaw = parseAudioLevelWindows({
    records: output.records,
    key: "lavfi.astats.Overall.RMS_level",
    durationSeconds: context.project.durationSeconds,
    windowSeconds,
    streamIndex: track.streamIndex,
  });
  const peakRaw = parseAudioLevelWindows({
    records: output.records,
    key: "lavfi.astats.Overall.Peak_level",
    durationSeconds: context.project.durationSeconds,
    windowSeconds,
    streamIndex: track.streamIndex,
  });
  if (rmsRaw.length === 0 || peakRaw.length === 0) {
    throw new Error(
      `FFmpeg returned no loudness windows for audio stream ${track.streamIndex}.`,
    );
  }
  const baselineWindowPoints = Math.max(
    3,
    Math.round(baselineWindowSeconds / windowSeconds),
  );
  return {
    track,
    windowSeconds,
    rmsRaw,
    peakRaw,
    rms: normalizeTimeSeries(rmsRaw, {
      durationSeconds: context.project.durationSeconds,
      baselineWindowPoints,
      minimumScale: 0.1,
    }),
    peak: normalizeTimeSeries(peakRaw, {
      durationSeconds: context.project.durationSeconds,
      baselineWindowPoints,
      minimumScale: 0.1,
    }),
    clippedWindowCount: peakRaw.filter((point) => point.rawValue >= -0.2)
      .length,
    processedSeconds: output.processedSeconds,
  } satisfies AudioMeasurement;
}

async function collectMeasurements(
  context: DetectorRunContext,
  windowSeconds: number,
  baselineWindowSeconds: number,
) {
  const selected = await confirmedTracks(context.project.id);
  const allTrackCount = await db.audioTrack.count({
    where: { projectId: context.project.id },
  });
  if (selected.length === 0) {
    return {
      measurements: [] as AudioMeasurement[],
      warnings: [
        allTrackCount === 0
          ? "This recording has no audio tracks. The audio detector completed without results."
          : "No audio track has a user-confirmed analysis role. Confirm a creator, game, mixed, or unknown role before rerunning audio detectors.",
      ],
    };
  }
  const measurements: AudioMeasurement[] = [];
  const errors: string[] = [];
  for (const track of selected) {
    try {
      context.throwIfCancellationRequested();
      measurements.push(
        await measureTrack(
          context,
          track,
          windowSeconds,
          baselineWindowSeconds,
        ),
      );
    } catch (error) {
      context.throwIfCancellationRequested();
      errors.push(
        `Stream ${track.streamIndex}: ${error instanceof Error ? error.message : "analysis failed"}`,
      );
    }
  }
  if (measurements.length === 0 && errors.length > 0) {
    throw new Error(
      `No confirmed audio track could be analyzed. ${errors.join(" ")}`,
    );
  }
  return { measurements, warnings: errors };
}

function audioCurve(input: {
  measurement: AudioMeasurement;
  type: "rms" | "peak";
  detectorPurpose: string;
}): DetectorSignalCurveResult {
  const { measurement } = input;
  const normalized = input.type === "rms" ? measurement.rms : measurement.peak;
  return {
    stableId: `audio.${input.detectorPurpose}.${input.type}.stream-${measurement.track.streamIndex}`,
    audioTrackId: measurement.track.id,
    kind: input.type === "rms" ? "AUDIO_LOUDNESS" : "AUDIO_PEAK",
    displayName: `${roleLabel(measurement.track.analysisRole)} ${input.type === "rms" ? "RMS loudness" : "peak level"}`,
    unit: "dBFS",
    sourceSignal: sourceSignal(measurement.track.analysisRole),
    sourceTrackRole: measurement.track.analysisRole,
    sourceStreamIndex: measurement.track.streamIndex,
    sampleIntervalSeconds: measurement.windowSeconds,
    aggregation: "EVENT_PRESERVING",
    configuration: {
      sourceStreamIndex: measurement.track.streamIndex,
      userConfirmedRole: measurement.track.analysisRole,
      sampleRate: ANALYSIS_SAMPLE_RATE,
      channelCount: measurement.track.channels,
      analysisWindowSeconds: measurement.windowSeconds,
      loudnessMethod: "FFmpeg astats per-window RMS_level and Peak_level",
    },
    statistics: {
      ...normalized.statistics,
      noiseFloorTenthPercentileDbfs: percentile(
        measurement.rmsRaw.map((point) => point.rawValue),
        0.1,
      ),
      clippedWindowCount: measurement.clippedWindowCount,
    },
    rawPointCount:
      input.type === "rms"
        ? measurement.rmsRaw.length
        : measurement.peakRaw.length,
    points: normalized.points,
  };
}

const audioWindowParameters = {
  windowSeconds: {
    type: "number" as const,
    label: "Audio window",
    description: "Seconds represented by each stored loudness measurement.",
    defaultValue: 0.5,
    minimum: 0.1,
    maximum: 2,
  },
  baselineWindowSeconds: {
    type: "number" as const,
    label: "Local baseline window",
    description: "Seconds used for the rolling median and deviation baseline.",
    defaultValue: 10,
    minimum: 2,
    maximum: 60,
  },
};

function audioParameters(context: DetectorRunContext) {
  return {
    windowSeconds: numberParameter(
      context.parameters,
      "windowSeconds",
      0.5,
      0.1,
      2,
    ),
    baselineWindowSeconds: numberParameter(
      context.parameters,
      "baselineWindowSeconds",
      10,
      2,
      60,
    ),
  };
}

export const audioLoudnessDetector: LocalDetector = {
  stableId: "audio.loudness-energy",
  name: "Audio loudness and energy curves",
  version: VERSION,
  description:
    "Measures per-track RMS and peak levels for user-confirmed audio roles. It does not diagnose reactions or identify speakers.",
  requiredInputs: ["AUDIO"],
  parameters: audioWindowParameters,
  enabledByDefault: true,
  estimatedCost: "MEDIUM",
  executionOrder: 50,
  implementationState: "ACTIVE",
  async run(context) {
    const started = performance.now();
    const settings = audioParameters(context);
    const result = await collectMeasurements(
      context,
      settings.windowSeconds,
      settings.baselineWindowSeconds,
    );
    const processingDurationMs = Math.round(performance.now() - started);
    const events: DetectorEventResult[] = [];
    for (const measurement of result.measurements) {
      const clipped = findSignalIntervals({
        points: measurement.peak.points,
        predicate: (point) => point.rawValue >= -0.2,
        minimumDurationSeconds: measurement.windowSeconds,
        maximumGapSeconds: measurement.windowSeconds * 0.25,
      });
      for (const interval of clipped) {
        events.push(
          buildVideoEvent({
            eventType: `${rolePrefix(measurement.track.analysisRole)}_AUDIO_CLIPPING_WARNING`,
            interval,
            confidence: 0.9,
            supportingEvidence: [
              `${roleLabel(measurement.track.analysisRole)} reached ${Math.max(...interval.points.map((point) => point.rawValue)).toFixed(2)} dBFS, near digital full scale.`,
            ],
            sourceSignal: sourceSignal(measurement.track.analysisRole),
            rawMeasurements: {
              peakDbfs: Math.max(
                ...interval.points.map((point) => point.rawValue),
              ),
              streamIndex: measurement.track.streamIndex,
              role: measurement.track.analysisRole,
            },
            thresholds: { clippingWarningDbfs: -0.2 },
            processingDurationMs,
          }),
        );
      }
    }
    return {
      events,
      curves: result.measurements.flatMap((measurement) => [
        audioCurve({ measurement, type: "rms", detectorPurpose: "loudness" }),
        audioCurve({ measurement, type: "peak", detectorPurpose: "loudness" }),
      ]),
      warnings: [
        ...result.warnings,
        "Loudness is an audio measurement, not proof of speech, excitement, frustration, or a highlight.",
      ],
      performance: {
        processedSourceSeconds:
          result.measurements.length > 0
            ? Math.min(
                ...result.measurements.map((item) => item.processedSeconds),
              )
            : 0,
      },
    };
  },
};

export const audioPeakDetector: LocalDetector = {
  stableId: "audio.relative-peaks",
  name: "Relative audio peaks",
  version: VERSION,
  description:
    "Finds sudden and sustained loud audio relative to each confirmed track's own rolling baseline.",
  requiredInputs: ["AUDIO"],
  parameters: {
    ...audioWindowParameters,
    peakDeviation: {
      type: "number",
      label: "Peak deviation",
      description:
        "Local median-absolute-deviation distance required for a sudden peak.",
      defaultValue: 3.5,
      minimum: 1,
      maximum: 20,
    },
    sustainedLoudSeconds: {
      type: "number",
      label: "Sustained loud duration",
      description: "Seconds of elevated audio required for a sustained event.",
      defaultValue: 2,
      minimum: 0.5,
      maximum: 30,
    },
    mergeGapSeconds: {
      type: "number",
      label: "Peak merge gap",
      description: "Maximum quiet gap allowed inside one peak event.",
      defaultValue: 0.5,
      minimum: 0,
      maximum: 5,
    },
    cooldownSeconds: {
      type: "number",
      label: "Duplicate cooldown",
      description: "Minimum time between separate sudden-peak events.",
      defaultValue: 1,
      minimum: 0,
      maximum: 10,
    },
  },
  enabledByDefault: true,
  estimatedCost: "MEDIUM",
  executionOrder: 60,
  implementationState: "ACTIVE",
  async run(context) {
    const started = performance.now();
    const settings = audioParameters(context);
    const peakDeviation = numberParameter(
      context.parameters,
      "peakDeviation",
      3.5,
      1,
      20,
    );
    const sustainedLoudSeconds = numberParameter(
      context.parameters,
      "sustainedLoudSeconds",
      2,
      0.5,
      30,
    );
    const mergeGapSeconds = numberParameter(
      context.parameters,
      "mergeGapSeconds",
      0.5,
      0,
      5,
    );
    const cooldownSeconds = numberParameter(
      context.parameters,
      "cooldownSeconds",
      1,
      0,
      10,
    );
    const result = await collectMeasurements(
      context,
      settings.windowSeconds,
      settings.baselineWindowSeconds,
    );
    const processingDurationMs = Math.round(performance.now() - started);
    const events: DetectorEventResult[] = [];
    for (const measurement of result.measurements) {
      const sudden = findSignalIntervals({
        points: measurement.rms.points,
        predicate: (point) => point.relativeDeviation >= peakDeviation,
        minimumDurationSeconds: settings.windowSeconds,
        maximumGapSeconds: mergeGapSeconds,
      });
      let previousPeak = -Infinity;
      for (const interval of sudden) {
        if (interval.peakSeconds - previousPeak < cooldownSeconds) continue;
        previousPeak = interval.peakSeconds;
        const peakPoint = interval.points.reduce((selected, point) =>
          point.relativeDeviation > selected.relativeDeviation
            ? point
            : selected,
        );
        events.push(
          buildVideoEvent({
            eventType: `SUDDEN_${rolePrefix(measurement.track.analysisRole)}_AUDIO_PEAK`,
            interval,
            confidence: Math.min(0.92, 0.48 + peakPoint.relativeDeviation / 20),
            supportingEvidence: [
              `${roleLabel(measurement.track.analysisRole)} rose ${peakPoint.relativeDeviation.toFixed(1)} local deviations above a ${peakPoint.localBaseline.toFixed(1)} dBFS baseline.`,
            ],
            sourceSignal: sourceSignal(measurement.track.analysisRole),
            rawMeasurements: {
              rawPeakRmsDbfs: peakPoint.rawValue,
              localBaselineDbfs: peakPoint.localBaseline,
              relativeDeviation: peakPoint.relativeDeviation,
              streamIndex: measurement.track.streamIndex,
              role: measurement.track.analysisRole,
              clippingWarning: measurement.clippedWindowCount > 0,
            },
            thresholds: {
              peakDeviation,
              mergeGapSeconds,
              cooldownSeconds,
            },
            processingDurationMs,
          }),
        );
      }
      const sustained = findSignalIntervals({
        points: measurement.rms.points,
        predicate: (point) => point.normalizedValue >= 0.8,
        minimumDurationSeconds: sustainedLoudSeconds,
        maximumGapSeconds: mergeGapSeconds,
      });
      for (const interval of sustained) {
        events.push(
          buildVideoEvent({
            eventType: `SUSTAINED_LOUD_${rolePrefix(measurement.track.analysisRole)}_AUDIO`,
            interval,
            confidence: Math.min(0.88, 0.5 + interval.points.length * 0.02),
            supportingEvidence: [
              `${roleLabel(measurement.track.analysisRole)} stayed in the track's top normalized loudness range for ${(interval.endSeconds - interval.startSeconds).toFixed(1)} seconds.`,
            ],
            sourceSignal: sourceSignal(measurement.track.analysisRole),
            rawMeasurements: {
              maximumRmsDbfs: Math.max(
                ...interval.points.map((point) => point.rawValue),
              ),
              streamIndex: measurement.track.streamIndex,
              role: measurement.track.analysisRole,
            },
            thresholds: {
              normalizedLoudness: 0.8,
              sustainedLoudSeconds,
            },
            processingDurationMs,
          }),
        );
      }
    }
    return {
      events,
      curves: result.measurements.map((measurement) =>
        audioCurve({ measurement, type: "rms", detectorPurpose: "peaks" }),
      ),
      warnings: [
        ...result.warnings,
        "Audio peaks are not labeled as reactions or highlights without separate transcript evidence.",
      ],
      performance: {
        processedSourceSeconds:
          result.measurements.length > 0
            ? Math.min(
                ...result.measurements.map((item) => item.processedSeconds),
              )
            : 0,
      },
    };
  },
};

function silenceCurve(
  measurement: AudioMeasurement,
  points: TimeSeriesPoint[],
  thresholdDbfs: number,
): DetectorSignalCurveResult {
  return {
    stableId: `audio.silence.state.stream-${measurement.track.streamIndex}`,
    audioTrackId: measurement.track.id,
    kind: "SILENCE_STATE",
    displayName: `${roleLabel(measurement.track.analysisRole)} silence state`,
    unit: "binary state",
    sourceSignal: sourceSignal(measurement.track.analysisRole),
    sourceTrackRole: measurement.track.analysisRole,
    sourceStreamIndex: measurement.track.streamIndex,
    sampleIntervalSeconds: measurement.windowSeconds,
    aggregation: "MAXIMUM",
    configuration: {
      sourceStreamIndex: measurement.track.streamIndex,
      userConfirmedRole: measurement.track.analysisRole,
      sampleRate: ANALYSIS_SAMPLE_RATE,
      analysisWindowSeconds: measurement.windowSeconds,
      silenceThresholdDbfs: thresholdDbfs,
      formula:
        "RMS <= min(absolute safeguard, global median - relative margin), floored at -100 dBFS",
    },
    statistics: {
      silenceWindowCount: points.filter((point) => point.rawValue === 1).length,
      totalWindowCount: points.length,
      silenceThresholdDbfs: thresholdDbfs,
    },
    rawPointCount: points.length,
    points,
  };
}

export function calculateSilenceThreshold(input: {
  globalBaselineDbfs: number;
  relativeMarginDb: number;
  absoluteSafeguardDbfs: number;
}) {
  return Math.max(
    -100,
    Math.min(
      input.absoluteSafeguardDbfs,
      input.globalBaselineDbfs - input.relativeMarginDb,
    ),
  );
}

export const audioSilenceDetector: LocalDetector = {
  stableId: "audio.relative-silence",
  name: "Relative audio silence",
  version: VERSION,
  description:
    "Finds sustained low-energy intervals and sudden silence using each confirmed track's own baseline plus an absolute safeguard.",
  requiredInputs: ["AUDIO"],
  parameters: {
    ...audioWindowParameters,
    relativeMarginDb: {
      type: "number",
      label: "Relative silence margin",
      description: "Decibels below the recording median required for silence.",
      defaultValue: 12,
      minimum: 3,
      maximum: 40,
    },
    absoluteSafeguardDbfs: {
      type: "number",
      label: "Absolute silence safeguard",
      description: "Silence must also stay below this dBFS ceiling.",
      defaultValue: -40,
      minimum: -100,
      maximum: -20,
    },
    minimumSilenceSeconds: {
      type: "number",
      label: "Minimum silence duration",
      description: "Seconds of low energy required for a silence event.",
      defaultValue: 2,
      minimum: 0.5,
      maximum: 60,
    },
  },
  enabledByDefault: true,
  estimatedCost: "MEDIUM",
  executionOrder: 70,
  implementationState: "ACTIVE",
  async run(context) {
    const started = performance.now();
    const settings = audioParameters(context);
    const relativeMarginDb = numberParameter(
      context.parameters,
      "relativeMarginDb",
      12,
      3,
      40,
    );
    const absoluteSafeguardDbfs = numberParameter(
      context.parameters,
      "absoluteSafeguardDbfs",
      -40,
      -100,
      -20,
    );
    const minimumSilenceSeconds = numberParameter(
      context.parameters,
      "minimumSilenceSeconds",
      2,
      0.5,
      60,
    );
    const result = await collectMeasurements(
      context,
      settings.windowSeconds,
      settings.baselineWindowSeconds,
    );
    const processingDurationMs = Math.round(performance.now() - started);
    const events: DetectorEventResult[] = [];
    const curves: DetectorSignalCurveResult[] = [];
    for (const measurement of result.measurements) {
      const globalBaseline = measurement.rms.statistics.globalBaseline;
      const thresholdDbfs = calculateSilenceThreshold({
        globalBaselineDbfs: globalBaseline,
        relativeMarginDb,
        absoluteSafeguardDbfs,
      });
      const statePoints = measurement.rms.points.map((point) => {
        const silent = point.rawValue <= thresholdDbfs ? 1 : 0;
        return {
          ...point,
          rawValue: silent,
          normalizedValue: silent,
          localBaseline: 0,
          globalBaseline: 0,
          relativeDeviation: silent,
        };
      });
      curves.push(silenceCurve(measurement, statePoints, thresholdDbfs));
      const intervals = findSignalIntervals({
        points: statePoints,
        predicate: (point) => point.rawValue === 1,
        minimumDurationSeconds: minimumSilenceSeconds,
        maximumGapSeconds: settings.windowSeconds * 0.25,
      });
      for (const interval of intervals) {
        const firstIndex = statePoints.findIndex(
          (point) =>
            point.timestampSeconds === interval.points[0]?.timestampSeconds,
        );
        const previousStart = Math.max(0, firstIndex - 4);
        const previous = statePoints.slice(previousStart, firstIndex);
        const suddenAfterHigh = previous.some((_, index) => {
          const sourcePoint = measurement.rms.points[previousStart + index];
          return (
            sourcePoint !== undefined && sourcePoint.normalizedValue >= 0.75
          );
        });
        events.push(
          buildVideoEvent({
            eventType: suddenAfterHigh
              ? `SUDDEN_${rolePrefix(measurement.track.analysisRole)}_SILENCE_AFTER_ACTIVITY`
              : `${rolePrefix(measurement.track.analysisRole)}_SILENCE_INTERVAL`,
            interval,
            confidence: Math.min(0.92, 0.55 + interval.points.length * 0.02),
            supportingEvidence: [
              `${roleLabel(measurement.track.analysisRole)} stayed below ${thresholdDbfs.toFixed(1)} dBFS for ${(interval.endSeconds - interval.startSeconds).toFixed(1)} seconds.`,
              ...(suddenAfterHigh
                ? ["The interval followed elevated audio energy."]
                : []),
            ],
            conflictingEvidence: [
              "Silence can represent tension, setup, concentration, or an intentionally quiet recording.",
            ],
            sourceSignal: sourceSignal(measurement.track.analysisRole),
            rawMeasurements: {
              thresholdDbfs,
              globalBaselineDbfs: globalBaseline,
              durationSeconds: interval.endSeconds - interval.startSeconds,
              streamIndex: measurement.track.streamIndex,
              role: measurement.track.analysisRole,
              suddenAfterHigh,
            },
            thresholds: {
              relativeMarginDb,
              absoluteSafeguardDbfs,
              minimumSilenceSeconds,
            },
            processingDurationMs,
          }),
        );
      }
    }
    return {
      events,
      curves,
      warnings: [
        ...result.warnings,
        "Silence is not automatically scored as bad content; quiet gameplay may be intentional or important.",
      ],
      performance: {
        processedSourceSeconds:
          result.measurements.length > 0
            ? Math.min(
                ...result.measurements.map((item) => item.processedSeconds),
              )
            : 0,
      },
    };
  },
};

export const overlappingAudioPeakDetector: LocalDetector = {
  stableId: "audio.overlapping-peaks",
  name: "Overlapping creator and game peaks",
  version: VERSION,
  description:
    "Combines already measured creator-microphone and game-audio peak evidence when their ranges overlap.",
  requiredInputs: ["CREATOR_MICROPHONE", "GAME_AUDIO", "COMBINED_EVIDENCE"],
  parameters: {
    proximitySeconds: {
      type: "number",
      label: "Overlap proximity",
      description:
        "Extra seconds allowed between creator and game peak ranges.",
      defaultValue: 0.5,
      minimum: 0,
      maximum: 3,
    },
  },
  enabledByDefault: true,
  estimatedCost: "LOW",
  executionOrder: 80,
  implementationState: "ACTIVE",
  async run(context) {
    const started = performance.now();
    const proximitySeconds = numberParameter(
      context.parameters,
      "proximitySeconds",
      0.5,
      0,
      3,
    );
    const sourceEvents = await db.detectorEvent.findMany({
      where: {
        detectorRun: {
          analysisJobId: context.analysisJobId,
          status: "COMPLETED",
          detectorStableId: "audio.relative-peaks",
        },
        eventType: { startsWith: "SUDDEN_" },
      },
      orderBy: { startSeconds: "asc" },
    });
    const creator = sourceEvents.filter((event) =>
      event.eventType.includes("CREATOR_AUDIO_PEAK"),
    );
    const game = sourceEvents.filter((event) =>
      event.eventType.includes("GAME_AUDIO_PEAK"),
    );
    const processingDurationMs = Math.round(performance.now() - started);
    const events: DetectorEventResult[] = [];
    const seen = new Set<string>();
    for (const creatorEvent of creator) {
      for (const gameEvent of game) {
        if (
          creatorEvent.startSeconds > gameEvent.endSeconds + proximitySeconds ||
          gameEvent.startSeconds > creatorEvent.endSeconds + proximitySeconds
        ) {
          continue;
        }
        const key = `${creatorEvent.id}:${gameEvent.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        events.push(
          buildVideoEvent({
            eventType: "OVERLAPPING_CREATOR_AND_GAME_AUDIO_PEAKS",
            interval: {
              startSeconds: Math.min(
                creatorEvent.startSeconds,
                gameEvent.startSeconds,
              ),
              peakSeconds:
                creatorEvent.confidence >= gameEvent.confidence
                  ? creatorEvent.peakSeconds
                  : gameEvent.peakSeconds,
              endSeconds: Math.max(
                creatorEvent.endSeconds,
                gameEvent.endSeconds,
              ),
            },
            confidence: Math.min(
              0.95,
              (creatorEvent.confidence + gameEvent.confidence) / 2 + 0.08,
            ),
            supportingEvidence: [
              `Creator-microphone peak ${creatorEvent.id} overlaps game-audio peak ${gameEvent.id}.`,
            ],
            conflictingEvidence: [
              "Overlapping loudness does not establish what happened or how anyone felt.",
            ],
            sourceSignal: "COMBINED_EVIDENCE",
            rawMeasurements: {
              creatorEventId: creatorEvent.id,
              gameEventId: gameEvent.id,
            },
            thresholds: { proximitySeconds },
            processingDurationMs,
          }),
        );
      }
    }
    return {
      events,
      warnings:
        sourceEvents.length === 0
          ? [
              "No completed creator/game sudden-peak events were available. Enable the relative audio peak detector and confirm both roles.",
            ]
          : [
              "Overlapping audio peaks remain measurements, not confirmed reactions or highlights.",
            ],
      performance: { processedSourceSeconds: context.project.durationSeconds },
    };
  },
};

export const generalAudioDetectors = [
  audioLoudnessDetector,
  audioPeakDetector,
  audioSilenceDetector,
  overlappingAudioPeakDetector,
] as const;
