import { db } from "@/lib/db";
import type {
  DetectorEventResult,
  DetectorSignalCurveResult,
  LocalDetector,
} from "@/lib/detectors/types";
import { normalizeTimeSeries, percentile } from "@/lib/signals/time-series";

import { runFfmpegVideoMetadata } from "./ffmpeg-signals";
import {
  buildVideoEvent,
  eventWindow,
  findSignalIntervals,
  metadataMeasurements,
  normalizeMeasurements,
  numberParameter,
} from "./video-signal-utils";

const VERSION = "1.0.0";

function videoFilter(sampleRate: number, filters: string) {
  return `fps=${sampleRate},scale=320:-2:flags=fast_bilinear,format=gray,${filters}`;
}

function curve(input: {
  stableId: string;
  kind: DetectorSignalCurveResult["kind"];
  displayName: string;
  unit: string;
  sourceSignal: DetectorSignalCurveResult["sourceSignal"];
  sampleIntervalSeconds: number;
  configuration: Record<string, unknown>;
  statistics: Record<string, unknown>;
  rawPointCount: number;
  points: DetectorSignalCurveResult["points"];
}): DetectorSignalCurveResult {
  return { ...input, aggregation: "EVENT_PRESERVING" };
}

function commonSampleParameter() {
  return {
    sampleRate: {
      type: "number" as const,
      label: "Samples per second",
      description:
        "How often the detector inspects a downscaled frame. Higher values take longer.",
      defaultValue: 2,
      minimum: 0.25,
      maximum: 8,
    },
  };
}

export const sceneChangeDetector: LocalDetector = {
  stableId: "video.scene-change",
  name: "Scene-change evidence",
  version: VERSION,
  description:
    "Measures broad frame changes and labels cuts or transitions. It does not interpret gameplay events.",
  requiredInputs: ["VIDEO"],
  parameters: {
    ...commonSampleParameter(),
    minorThreshold: {
      type: "number",
      label: "Minor scene threshold",
      description: "Minimum FFmpeg scene-change score for a minor change.",
      defaultValue: 4,
      minimum: 0.5,
      maximum: 100,
    },
    strongThreshold: {
      type: "number",
      label: "Strong scene threshold",
      description: "Minimum score for a strong visual transition.",
      defaultValue: 10,
      minimum: 1,
      maximum: 100,
    },
    editedCutThreshold: {
      type: "number",
      label: "Probable edited-cut threshold",
      description:
        "A conservative high threshold. A result remains visual evidence, not proof of an edit.",
      defaultValue: 20,
      minimum: 2,
      maximum: 100,
    },
  },
  enabledByDefault: true,
  estimatedCost: "MEDIUM",
  executionOrder: 10,
  implementationState: "ACTIVE",
  async run(context) {
    const started = performance.now();
    const sampleRate = numberParameter(
      context.parameters,
      "sampleRate",
      2,
      0.25,
      8,
    );
    const sampleIntervalSeconds = 1 / sampleRate;
    const minorThreshold = numberParameter(
      context.parameters,
      "minorThreshold",
      4,
      0.5,
      100,
    );
    const strongThreshold = Math.max(
      minorThreshold,
      numberParameter(context.parameters, "strongThreshold", 10, 1, 100),
    );
    const editedCutThreshold = Math.max(
      strongThreshold,
      numberParameter(context.parameters, "editedCutThreshold", 20, 2, 100),
    );
    const measurement = await runFfmpegVideoMetadata({
      context,
      stage: "Measuring scene changes",
      filterGraph: videoFilter(
        sampleRate,
        "scdet=t=0,metadata=mode=print:file=-",
      ),
    });
    const rawPoints = metadataMeasurements({
      records: measurement.records,
      key: "lavfi.scd.score",
      durationSeconds: context.project.durationSeconds,
      sampleIntervalSeconds,
    });
    const normalized = normalizeMeasurements(
      rawPoints,
      context.project.durationSeconds,
      sampleIntervalSeconds,
    );
    const processingDurationMs = Math.round(performance.now() - started);
    const events = normalized.points
      .filter((point) => point.rawValue >= minorThreshold)
      .map((point) => {
        const eventType =
          point.rawValue >= editedCutThreshold
            ? "PROBABLE_EDITED_CUT"
            : point.rawValue >= strongThreshold
              ? "STRONG_SCENE_CHANGE"
              : "MINOR_SCENE_CHANGE";
        const threshold =
          eventType === "PROBABLE_EDITED_CUT"
            ? editedCutThreshold
            : eventType === "STRONG_SCENE_CHANGE"
              ? strongThreshold
              : minorThreshold;
        return buildVideoEvent({
          eventType,
          interval: eventWindow(
            point.timestampSeconds,
            context.project.durationSeconds,
            sampleIntervalSeconds / 2,
          ),
          confidence: Math.min(0.95, 0.35 + point.rawValue / 100),
          supportingEvidence: [
            `FFmpeg scene-change score ${point.rawValue.toFixed(2)} met the ${threshold.toFixed(2)} threshold.`,
          ],
          sourceSignal: "VIDEO",
          rawMeasurements: {
            sceneChangeScore: point.rawValue,
            localBaseline: point.localBaseline,
            relativeDeviation: point.relativeDeviation,
          },
          thresholds: { minorThreshold, strongThreshold, editedCutThreshold },
          processingDurationMs,
        });
      });
    return {
      events,
      curves: [
        curve({
          stableId: "video.scene-change.score",
          kind: "SCENE_CHANGE_SCORE",
          displayName: "Scene-change score",
          unit: "FFmpeg scdet score",
          sourceSignal: "VIDEO",
          sampleIntervalSeconds,
          configuration: {
            sampleRate,
            downscaledWidth: 320,
            colorMode: "grayscale",
            ffmpegFilter: "scdet",
          },
          statistics: normalized.statistics,
          rawPointCount: rawPoints.length,
          points: normalized.points,
        }),
      ],
      warnings: [
        "Scene changes are broad visual evidence. They do not confirm a menu, death, round result, or edit.",
      ],
      performance: { processedSourceSeconds: measurement.processedSeconds },
    };
  },
};

export const actionIntensityDetector: LocalDetector = {
  stableId: "video.action-intensity",
  name: "Motion and action intensity",
  version: VERSION,
  description:
    "Uses downscaled sampled-frame differences to find visual spikes and sustained high or low activity.",
  requiredInputs: ["VIDEO", "FRAME_DIFFERENCE", "MOTION"],
  parameters: {
    ...commonSampleParameter(),
    spikeDeviation: {
      type: "number",
      label: "Spike deviation",
      description:
        "Rolling-baseline MAD distance required for an action spike.",
      defaultValue: 3.5,
      minimum: 1,
      maximum: 20,
    },
    highNormalized: {
      type: "number",
      label: "Sustained high level",
      description:
        "Normalized activity required for a sustained high interval.",
      defaultValue: 0.75,
      minimum: 0,
      maximum: 1,
    },
    lowNormalized: {
      type: "number",
      label: "Sustained low level",
      description: "Normalized activity ceiling for a sustained low interval.",
      defaultValue: 0.15,
      minimum: 0,
      maximum: 1,
    },
  },
  enabledByDefault: true,
  estimatedCost: "MEDIUM",
  executionOrder: 20,
  implementationState: "ACTIVE",
  async run(context) {
    const started = performance.now();
    const sampleRate = numberParameter(
      context.parameters,
      "sampleRate",
      2,
      0.25,
      8,
    );
    const sampleIntervalSeconds = 1 / sampleRate;
    const spikeDeviation = numberParameter(
      context.parameters,
      "spikeDeviation",
      3.5,
      1,
      20,
    );
    const highNormalized = numberParameter(
      context.parameters,
      "highNormalized",
      0.75,
      0,
      1,
    );
    const lowNormalized = Math.min(
      highNormalized,
      numberParameter(context.parameters, "lowNormalized", 0.15, 0, 1),
    );
    const measurement = await runFfmpegVideoMetadata({
      context,
      stage: "Measuring visual activity",
      filterGraph: videoFilter(
        sampleRate,
        "scdet=t=0,metadata=mode=print:file=-",
      ),
    });
    const rawPoints = metadataMeasurements({
      records: measurement.records,
      key: "lavfi.scd.mafd",
      durationSeconds: context.project.durationSeconds,
      sampleIntervalSeconds,
    });
    const normalized = normalizeMeasurements(
      rawPoints,
      context.project.durationSeconds,
      sampleIntervalSeconds,
    );
    const processingDurationMs = Math.round(performance.now() - started);
    const events: DetectorEventResult[] = [];
    for (const point of normalized.points.filter(
      (item) => item.relativeDeviation >= spikeDeviation,
    )) {
      events.push(
        buildVideoEvent({
          eventType: "ACTION_SPIKE",
          interval: eventWindow(
            point.timestampSeconds,
            context.project.durationSeconds,
            sampleIntervalSeconds,
          ),
          confidence: Math.min(0.9, 0.45 + point.relativeDeviation / 20),
          supportingEvidence: [
            `Frame difference rose ${point.relativeDeviation.toFixed(1)} local deviations above its rolling baseline.`,
          ],
          sourceSignal: "MOTION",
          rawMeasurements: {
            meanAbsoluteFrameDifference: point.rawValue,
            localBaseline: point.localBaseline,
            relativeDeviation: point.relativeDeviation,
          },
          thresholds: { spikeDeviation },
          processingDurationMs,
        }),
      );
    }
    const highIntervals = findSignalIntervals({
      points: normalized.points,
      predicate: (point) => point.normalizedValue >= highNormalized,
      minimumDurationSeconds: Math.max(1, sampleIntervalSeconds * 2),
      maximumGapSeconds: sampleIntervalSeconds * 0.6,
      peakBy: (point) => point.normalizedValue,
    });
    for (const interval of highIntervals) {
      events.push({
        ...buildVideoEvent({
          eventType: "SUSTAINED_HIGH_ACTION",
          interval,
          confidence: Math.min(0.88, 0.48 + interval.points.length * 0.025),
          supportingEvidence: [
            `Visual activity stayed above normalized level ${highNormalized.toFixed(2)} for ${(interval.endSeconds - interval.startSeconds).toFixed(1)} seconds.`,
          ],
          sourceSignal: "MOTION",
          rawMeasurements: {
            maximumNormalizedActivity: Math.max(
              ...interval.points.map((point) => point.normalizedValue),
            ),
            sampleCount: interval.points.length,
          },
          thresholds: { highNormalized },
          processingDurationMs,
        }),
        category: "HIGH_ACTION_GAMEPLAY",
      });
    }
    const lowIntervals = findSignalIntervals({
      points: normalized.points,
      predicate: (point) => point.normalizedValue <= lowNormalized,
      minimumDurationSeconds: 4,
      maximumGapSeconds: sampleIntervalSeconds * 0.6,
      peakBy: (point) => -point.normalizedValue,
    });
    for (const interval of lowIntervals) {
      events.push({
        ...buildVideoEvent({
          eventType: "SUSTAINED_LOW_ACTION",
          interval,
          confidence: Math.min(0.85, 0.45 + interval.points.length * 0.015),
          supportingEvidence: [
            `Visual activity stayed below normalized level ${lowNormalized.toFixed(2)} for ${(interval.endSeconds - interval.startSeconds).toFixed(1)} seconds.`,
          ],
          conflictingEvidence: [
            "Low motion can be tense or strategically important gameplay.",
          ],
          sourceSignal: "MOTION",
          rawMeasurements: {
            medianNormalizedActivity: percentile(
              interval.points.map((point) => point.normalizedValue),
              0.5,
            ),
            sampleCount: interval.points.length,
          },
          thresholds: { lowNormalized, minimumDurationSeconds: 4 },
          processingDurationMs,
        }),
        category: "QUIET_OR_LOW_INTEREST",
      });
    }
    return {
      events,
      curves: [
        curve({
          stableId: "video.action-intensity.frame-difference",
          kind: "ACTION_INTENSITY",
          displayName: "Visual action intensity",
          unit: "mean absolute frame difference",
          sourceSignal: "MOTION",
          sampleIntervalSeconds,
          configuration: {
            sampleRate,
            downscaledWidth: 320,
            colorMode: "grayscale",
            method: "FFmpeg scdet mean absolute frame difference",
          },
          statistics: normalized.statistics,
          rawPointCount: rawPoints.length,
          points: normalized.points,
        }),
      ],
      warnings: [
        "High motion is not a confirmed kill or highlight. Low motion is not automatically uninteresting.",
      ],
      performance: { processedSourceSeconds: measurement.processedSeconds },
    };
  },
};

export const blackIntervalDetector: LocalDetector = {
  stableId: "video.black-interval",
  name: "Black and dark intervals",
  version: VERSION,
  description:
    "Measures dark-pixel proportion and mean brightness with temporal consistency to find likely transitions.",
  requiredInputs: ["VIDEO"],
  parameters: {
    ...commonSampleParameter(),
    darkPixelLuma: {
      type: "number",
      label: "Dark-pixel luma",
      description: "8-bit luma below which a sampled pixel counts as dark.",
      defaultValue: 32,
      minimum: 1,
      maximum: 100,
    },
    blackRatio: {
      type: "number",
      label: "Black-frame ratio",
      description: "Minimum proportion of sampled pixels that must be dark.",
      defaultValue: 0.95,
      minimum: 0.5,
      maximum: 1,
    },
  },
  enabledByDefault: true,
  estimatedCost: "MEDIUM",
  executionOrder: 30,
  implementationState: "ACTIVE",
  async run(context) {
    const started = performance.now();
    const sampleRate = numberParameter(
      context.parameters,
      "sampleRate",
      2,
      0.25,
      8,
    );
    const sampleIntervalSeconds = 1 / sampleRate;
    const darkPixelLuma = Math.round(
      numberParameter(context.parameters, "darkPixelLuma", 32, 1, 100),
    );
    const blackRatio = numberParameter(
      context.parameters,
      "blackRatio",
      0.95,
      0.5,
      1,
    );
    const blackMeasurement = await runFfmpegVideoMetadata({
      context,
      stage: "Measuring dark pixels",
      filterGraph: videoFilter(
        sampleRate,
        `lut=y='if(lt(val,${darkPixelLuma}),255,0)',signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=-`,
      ),
    });
    const brightnessMeasurement = await runFfmpegVideoMetadata({
      context,
      stage: "Measuring frame brightness",
      filterGraph: videoFilter(
        sampleRate,
        "signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=-",
      ),
    });
    const ratioRaw = metadataMeasurements({
      records: blackMeasurement.records,
      key: "lavfi.signalstats.YAVG",
      durationSeconds: context.project.durationSeconds,
      sampleIntervalSeconds,
      transform: (value) => value / 255,
    });
    const brightnessRaw = metadataMeasurements({
      records: brightnessMeasurement.records,
      key: "lavfi.signalstats.YAVG",
      durationSeconds: context.project.durationSeconds,
      sampleIntervalSeconds,
    });
    const ratioNormalized = normalizeMeasurements(
      ratioRaw,
      context.project.durationSeconds,
      sampleIntervalSeconds,
    );
    const brightnessNormalized = normalizeMeasurements(
      brightnessRaw,
      context.project.durationSeconds,
      sampleIntervalSeconds,
    );
    const processingDurationMs = Math.round(performance.now() - started);
    const intervals = findSignalIntervals({
      points: ratioNormalized.points,
      predicate: (point) => point.rawValue >= blackRatio,
      minimumDurationSeconds: Math.max(0.5, sampleIntervalSeconds),
      maximumGapSeconds: sampleIntervalSeconds * 0.6,
    });
    const events = intervals.map((interval) => {
      const duration = interval.endSeconds - interval.startSeconds;
      const medianRatio = percentile(
        interval.points.map((point) => point.rawValue),
        0.5,
      );
      const eventType =
        duration >= 5 ? "EXTENDED_DARK_INTERVAL" : "PROBABLE_BLACK_TRANSITION";
      return buildVideoEvent({
        eventType,
        interval,
        confidence: Math.min(
          0.95,
          0.45 + medianRatio * 0.4 + Math.min(duration, 5) * 0.02,
        ),
        supportingEvidence: [
          `${(medianRatio * 100).toFixed(1)}% median dark-pixel ratio persisted for ${duration.toFixed(1)} seconds.`,
        ],
        conflictingEvidence: [
          "Dark gameplay, fades, and loading screens can look similar without HUD-specific evidence.",
        ],
        sourceSignal: "VIDEO",
        rawMeasurements: {
          medianDarkPixelRatio: medianRatio,
          durationSeconds: duration,
        },
        thresholds: {
          darkPixelLuma,
          blackRatio,
          temporalConsistencySeconds: Math.max(0.5, sampleIntervalSeconds),
        },
        processingDurationMs,
      });
    });
    const uncertainIntervals = findSignalIntervals({
      points: ratioNormalized.points,
      predicate: (point) =>
        point.rawValue >= Math.max(0.7, blackRatio - 0.15) &&
        point.rawValue < blackRatio,
      minimumDurationSeconds: 2,
      maximumGapSeconds: sampleIntervalSeconds * 0.6,
    });
    for (const interval of uncertainIntervals) {
      events.push(
        buildVideoEvent({
          eventType: "UNCERTAIN_DARK_GAMEPLAY",
          interval,
          confidence: 0.35,
          supportingEvidence: [
            "The frame remained mostly dark across several samples.",
          ],
          conflictingEvidence: [
            "The conservative black-frame ratio was not reached.",
          ],
          sourceSignal: "VIDEO",
          rawMeasurements: {
            medianDarkPixelRatio: percentile(
              interval.points.map((point) => point.rawValue),
              0.5,
            ),
          },
          thresholds: { blackRatio },
          processingDurationMs,
        }),
      );
    }
    return {
      events,
      curves: [
        curve({
          stableId: "video.black-interval.dark-pixel-ratio",
          kind: "BLACK_PIXEL_RATIO",
          displayName: "Dark-pixel ratio",
          unit: "proportion",
          sourceSignal: "VIDEO",
          sampleIntervalSeconds,
          configuration: {
            sampleRate,
            downscaledWidth: 320,
            darkPixelLuma,
            binaryMask: true,
          },
          statistics: ratioNormalized.statistics,
          rawPointCount: ratioRaw.length,
          points: ratioNormalized.points,
        }),
        curve({
          stableId: "video.black-interval.brightness",
          kind: "BRIGHTNESS",
          displayName: "Mean frame brightness",
          unit: "8-bit luma",
          sourceSignal: "VIDEO",
          sampleIntervalSeconds,
          configuration: {
            sampleRate,
            downscaledWidth: 320,
            colorMode: "grayscale",
          },
          statistics: brightnessNormalized.statistics,
          rawPointCount: brightnessRaw.length,
          points: brightnessNormalized.points,
        }),
      ],
      warnings: [
        "A black interval may be a transition, fade, loading boundary, or intentionally dark gameplay.",
      ],
      performance: {
        processedSourceSeconds: Math.min(
          blackMeasurement.processedSeconds,
          brightnessMeasurement.processedSeconds,
        ),
      },
    };
  },
};

export const staticIntervalDetector: LocalDetector = {
  stableId: "video.static-interval",
  name: "Static-frame intervals",
  version: VERSION,
  description:
    "Finds sustained near-identical sampled frames that may indicate menus, loading, pauses, or still footage.",
  requiredInputs: ["VIDEO", "FRAME_DIFFERENCE"],
  parameters: {
    ...commonSampleParameter(),
    maximumDifference: {
      type: "number",
      label: "Maximum static difference",
      description:
        "Maximum FFmpeg mean absolute frame difference treated as near-static.",
      defaultValue: 0.35,
      minimum: 0,
      maximum: 10,
    },
    minimumDuration: {
      type: "number",
      label: "Minimum static duration",
      description: "Seconds of consistent near-static imagery required.",
      defaultValue: 2,
      minimum: 0.5,
      maximum: 30,
    },
  },
  enabledByDefault: true,
  estimatedCost: "MEDIUM",
  executionOrder: 40,
  implementationState: "ACTIVE",
  async run(context) {
    const started = performance.now();
    const sampleRate = numberParameter(
      context.parameters,
      "sampleRate",
      2,
      0.25,
      8,
    );
    const sampleIntervalSeconds = 1 / sampleRate;
    const maximumDifference = numberParameter(
      context.parameters,
      "maximumDifference",
      0.35,
      0,
      10,
    );
    const minimumDuration = numberParameter(
      context.parameters,
      "minimumDuration",
      2,
      0.5,
      30,
    );
    const measurement = await runFfmpegVideoMetadata({
      context,
      stage: "Measuring static frames",
      filterGraph: videoFilter(
        sampleRate,
        "scdet=t=0,metadata=mode=print:file=-",
      ),
    });
    const differenceRaw = metadataMeasurements({
      records: measurement.records,
      key: "lavfi.scd.mafd",
      durationSeconds: context.project.durationSeconds,
      sampleIntervalSeconds,
    });
    const similarityRaw = differenceRaw.map((point) => ({
      ...point,
      rawValue: Math.max(
        0,
        1 - point.rawValue / Math.max(maximumDifference * 4, 1),
      ),
    }));
    const similarityNormalized = normalizeTimeSeries(similarityRaw, {
      durationSeconds: context.project.durationSeconds,
      baselineWindowPoints: Math.max(5, Math.round(10 * sampleRate)),
    });
    const processingDurationMs = Math.round(performance.now() - started);
    // Use the original difference values to avoid classifying a merely relative low as static.
    const staticIntervals = findSignalIntervals({
      points: similarityNormalized.points.filter(
        (_, index) =>
          (differenceRaw[index]?.rawValue ?? Infinity) <= maximumDifference,
      ),
      predicate: () => true,
      minimumDurationSeconds: minimumDuration,
      maximumGapSeconds: sampleIntervalSeconds * 0.6,
    });
    const events = staticIntervals.map((interval) => {
      const duration = interval.endSeconds - interval.startSeconds;
      return buildVideoEvent({
        eventType:
          duration >= 8 ? "EXTENDED_STATIC_INTERVAL" : "PROBABLE_STATIC_FRAME",
        interval,
        confidence: Math.min(0.9, 0.5 + Math.min(duration, 10) * 0.035),
        supportingEvidence: [
          `Sampled frames remained below mean-difference threshold ${maximumDifference.toFixed(2)} for ${duration.toFixed(1)} seconds.`,
        ],
        conflictingEvidence: [
          "A static camera angle can still contain important gameplay or speech.",
        ],
        sourceSignal: "FRAME_DIFFERENCE",
        rawMeasurements: {
          durationSeconds: duration,
          minimumSimilarity: Math.min(
            ...interval.points.map((point) => point.rawValue),
          ),
        },
        thresholds: { maximumDifference, minimumDuration },
        processingDurationMs,
      });
    });
    return {
      events,
      curves: [
        curve({
          stableId: "video.static-interval.similarity",
          kind: "STATIC_SIMILARITY",
          displayName: "Static-frame similarity",
          unit: "relative similarity",
          sourceSignal: "FRAME_DIFFERENCE",
          sampleIntervalSeconds,
          configuration: {
            sampleRate,
            downscaledWidth: 320,
            maximumDifference,
          },
          statistics: {
            ...similarityNormalized.statistics,
            similarityFormula:
              "max(0, 1 - mean_absolute_frame_difference / max(4 × static_threshold, 1))",
          },
          rawPointCount: similarityRaw.length,
          points: similarityNormalized.points,
        }),
      ],
      warnings: [
        "Static imagery is a broad screen-state clue, not proof of a menu, loading screen, or gameplay interruption.",
      ],
      performance: { processedSourceSeconds: measurement.processedSeconds },
    };
  },
};

type StoredBroadEvent = {
  id: string;
  eventType: string;
  startSeconds: number;
  peakSeconds: number;
  endSeconds: number;
  confidence: number;
  detectorRun: { detectorStableId: string; detectorVersion: string };
};

function mergeStoredEvents(
  events: StoredBroadEvent[],
  proximitySeconds: number,
) {
  const groups: StoredBroadEvent[][] = [];
  for (const event of [...events].sort(
    (left, right) => left.startSeconds - right.startSeconds,
  )) {
    const group = groups.at(-1);
    const latestEnd = group
      ? Math.max(...group.map((item) => item.endSeconds))
      : -Infinity;
    if (!group || event.startSeconds > latestEnd + proximitySeconds)
      groups.push([event]);
    else group.push(event);
  }
  return groups;
}

export const generalTransitionDetector: LocalDetector = {
  stableId: "video.general-transition",
  name: "Broad transition evidence fusion",
  version: VERSION,
  description:
    "Combines completed general visual signals into cautious transition candidates without assigning R6 events.",
  requiredInputs: ["VIDEO", "COMBINED_EVIDENCE"],
  parameters: {
    proximitySeconds: {
      type: "number",
      label: "Evidence proximity",
      description: "Seconds within which broad visual evidence may be grouped.",
      defaultValue: 1,
      minimum: 0,
      maximum: 5,
    },
  },
  enabledByDefault: true,
  estimatedCost: "LOW",
  executionOrder: 90,
  implementationState: "ACTIVE",
  async run(context) {
    const started = performance.now();
    await context.reportProgress({
      progress: 20,
      stage: "Loading completed broad visual evidence",
    });
    const proximitySeconds = numberParameter(
      context.parameters,
      "proximitySeconds",
      1,
      0,
      5,
    );
    const stored = await db.detectorEvent.findMany({
      where: {
        detectorRun: {
          analysisJobId: context.analysisJobId,
          status: "COMPLETED",
          detectorStableId: { startsWith: "video." },
        },
      },
      include: {
        detectorRun: {
          select: { detectorStableId: true, detectorVersion: true },
        },
      },
      orderBy: { startSeconds: "asc" },
    });
    context.throwIfCancellationRequested();
    await context.reportProgress({
      progress: 60,
      stage: "Grouping broad visual evidence",
    });
    const groups = mergeStoredEvents(stored, proximitySeconds);
    const processingDurationMs = Math.round(performance.now() - started);
    const events: DetectorEventResult[] = groups.flatMap((group) => {
      const types = new Set(group.map((item) => item.eventType));
      const hasScene = [...types].some(
        (type) => type.includes("SCENE_CHANGE") || type.includes("EDITED_CUT"),
      );
      const hasBlack = [...types].some(
        (type) => type.includes("BLACK") || type.includes("DARK"),
      );
      const hasStatic = [...types].some((type) => type.includes("STATIC"));
      if (!hasScene && !hasBlack && !hasStatic) return [];
      const eventType =
        hasScene && hasBlack
          ? "POSSIBLE_EDITED_BOUNDARY"
          : hasScene && hasStatic
            ? "POSSIBLE_GAMEPLAY_TO_MENU_TRANSITION"
            : hasStatic
              ? "POSSIBLE_GAMEPLAY_INTERRUPTION"
              : "MAJOR_VISUAL_TRANSITION";
      const peak = group.reduce((selected, item) =>
        item.confidence > selected.confidence ? item : selected,
      );
      const distinctDetectors = [
        ...new Set(
          group.map(
            (item) =>
              `${item.detectorRun.detectorStableId}@${item.detectorRun.detectorVersion}`,
          ),
        ),
      ];
      return [
        buildVideoEvent({
          eventType,
          interval: {
            startSeconds: Math.max(
              0,
              Math.min(...group.map((item) => item.startSeconds)),
            ),
            peakSeconds: peak.peakSeconds,
            endSeconds: Math.min(
              context.project.durationSeconds,
              Math.max(...group.map((item) => item.endSeconds)),
            ),
          },
          confidence: Math.min(
            0.92,
            0.35 +
              group.reduce((sum, item) => sum + item.confidence, 0) /
                (group.length * 3) +
              distinctDetectors.length * 0.08,
          ),
          supportingEvidence: group.map(
            (item) =>
              `${item.eventType} from ${item.detectorRun.detectorStableId}@${item.detectorRun.detectorVersion}.`,
          ),
          conflictingEvidence: [
            "No R6 HUD, OCR, or semantic screen-state evidence was used.",
          ],
          sourceSignal: "VIDEO",
          rawMeasurements: {
            sourceEventCount: group.length,
            distinctDetectorCount: distinctDetectors.length,
            sourceEventTypes: [...types],
          },
          thresholds: { proximitySeconds },
          processingDurationMs,
        }),
      ];
    });
    await context.reportProgress({
      progress: 95,
      stage: "Saving broad transition candidates",
    });
    return {
      events,
      warnings: [
        "These labels are broad transition candidates only. R6-specific screen-state interpretation begins in Phase 3B.3.",
      ],
      performance: { processedSourceSeconds: context.project.durationSeconds },
    };
  },
};

export const generalVideoDetectors = [
  sceneChangeDetector,
  actionIntensityDetector,
  blackIntervalDetector,
  staticIntervalDetector,
  generalTransitionDetector,
] as const;
