import { gunzipSync, gzipSync } from "node:zlib";

import { z } from "zod";

export const SIGNAL_CHUNK_SCHEMA_VERSION = "r6-signal-curve-chunk/v1";
export const DEFAULT_SIGNAL_CHUNK_SIZE = 500;
export const MAX_DECOMPRESSED_CHUNK_BYTES = 2 * 1024 * 1024;

const finiteNumber = z.number().finite();

export const timeSeriesPointSchema = z
  .object({
    timestampSeconds: finiteNumber.nonnegative(),
    windowStartSeconds: finiteNumber.nonnegative(),
    windowEndSeconds: finiteNumber.nonnegative(),
    rawValue: finiteNumber,
    normalizedValue: finiteNumber.min(0).max(1),
    localBaseline: finiteNumber,
    globalBaseline: finiteNumber.optional(),
    relativeDeviation: finiteNumber,
    sourceStreamIndex: z.number().int().nonnegative().optional(),
    qualityWarning: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((point, context) => {
    if (
      point.windowStartSeconds > point.timestampSeconds ||
      point.timestampSeconds > point.windowEndSeconds
    ) {
      context.addIssue({
        code: "custom",
        message: "A signal timestamp must fall inside its measurement window.",
      });
    }
  });

export type TimeSeriesPoint = z.infer<typeof timeSeriesPointSchema>;

export type RawTimeSeriesPoint = {
  timestampSeconds: number;
  windowStartSeconds: number;
  windowEndSeconds: number;
  rawValue: number;
  sourceStreamIndex?: number;
  qualityWarning?: string;
};

export type SignalAggregationMethod =
  "MAXIMUM" | "MEAN" | "MEDIAN" | "PERCENTILE" | "EVENT_PRESERVING";

export type EncodedSignalChunk = {
  chunkIndex: number;
  startSeconds: number;
  endSeconds: number;
  pointCount: number;
  encoding: "gzip-json-v1";
  payload: Uint8Array<ArrayBuffer>;
  rawSizeBytes: number;
  compressedSizeBytes: number;
  minimumNormalizedValue: number | null;
  maximumNormalizedValue: number | null;
  maximumAbsoluteDeviation: number | null;
};

const chunkDocumentSchema = z
  .object({
    schemaVersion: z.literal(SIGNAL_CHUNK_SCHEMA_VERSION),
    points: z.array(timeSeriesPointSchema).max(DEFAULT_SIGNAL_CHUNK_SIZE),
  })
  .strict();

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function median(values: number[]) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2
    : (ordered[middle] ?? 0);
}

export function percentile(values: number[], quantile: number) {
  if (values.length === 0) return 0;
  const bounded = clamp(quantile, 0, 1);
  const ordered = [...values].sort((left, right) => left - right);
  const position = (ordered.length - 1) * bounded;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  const lowerValue = ordered[lower] ?? ordered[0] ?? 0;
  const upperValue = ordered[upper] ?? ordered.at(-1) ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * fraction;
}

export function medianAbsoluteDeviation(values: number[], center?: number) {
  if (values.length === 0) return 0;
  const baseline = center ?? median(values);
  return median(values.map((value) => Math.abs(value - baseline)));
}

export function validateTimeSeries(
  points: TimeSeriesPoint[],
  durationSeconds: number,
) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Signal duration must be a positive finite number.");
  }
  let previousTimestamp = -1;
  for (const [index, input] of points.entries()) {
    const point = timeSeriesPointSchema.parse(input);
    if (point.timestampSeconds < previousTimestamp) {
      throw new Error(`Signal point ${index} is out of timestamp order.`);
    }
    if (point.windowEndSeconds > durationSeconds + 0.001) {
      throw new Error(`Signal point ${index} extends beyond the video.`);
    }
    previousTimestamp = point.timestampSeconds;
  }
  return points;
}

export function normalizeTimeSeries(
  rawPoints: RawTimeSeriesPoint[],
  options: {
    durationSeconds: number;
    baselineWindowPoints?: number;
    minimumScale?: number;
  },
) {
  const baselineWindowPoints = Math.max(
    1,
    Math.floor(options.baselineWindowPoints ?? 21),
  );
  const minimumScale = Math.max(Number.EPSILON, options.minimumScale ?? 1e-6);
  const ordered = [...rawPoints].sort(
    (left, right) => left.timestampSeconds - right.timestampSeconds,
  );
  const rawValues = ordered.map((point) => point.rawValue);
  if (!rawValues.every(Number.isFinite)) {
    throw new Error("Signal measurements must be finite numbers.");
  }
  const globalBaseline = median(rawValues);
  const globalMad = Math.max(
    minimumScale,
    medianAbsoluteDeviation(rawValues, globalBaseline),
  );
  const lower = percentile(rawValues, 0.05);
  const upper = percentile(rawValues, 0.95);
  const normalizationRange = Math.max(minimumScale, upper - lower);
  const halfWindow = Math.floor(baselineWindowPoints / 2);

  const points: TimeSeriesPoint[] = ordered.map((point, index) => {
    const localValues = rawValues.slice(
      Math.max(0, index - halfWindow),
      Math.min(rawValues.length, index + halfWindow + 1),
    );
    const localBaseline = median(localValues);
    const localMad = Math.max(
      minimumScale,
      medianAbsoluteDeviation(localValues, localBaseline),
      globalMad * 0.25,
    );
    return {
      ...point,
      windowStartSeconds: clamp(
        point.windowStartSeconds,
        0,
        options.durationSeconds,
      ),
      timestampSeconds: clamp(
        point.timestampSeconds,
        0,
        options.durationSeconds,
      ),
      windowEndSeconds: clamp(
        point.windowEndSeconds,
        0,
        options.durationSeconds,
      ),
      normalizedValue: clamp(
        (point.rawValue - lower) / normalizationRange,
        0,
        1,
      ),
      localBaseline,
      globalBaseline,
      relativeDeviation: (point.rawValue - localBaseline) / localMad,
    };
  });
  validateTimeSeries(points, options.durationSeconds);
  return {
    points,
    statistics: {
      globalBaseline,
      globalMedianAbsoluteDeviation: globalMad,
      fifthPercentile: lower,
      ninetyFifthPercentile: upper,
      baselineWindowPoints,
      normalizationFormula:
        "clamp((raw - p05) / max(p95 - p05, epsilon), 0, 1)",
      deviationFormula:
        "(raw - rolling median) / max(local MAD, 0.25 × global MAD, epsilon)",
    },
  };
}

function aggregateNumber(
  values: number[],
  method: Exclude<SignalAggregationMethod, "EVENT_PRESERVING">,
  quantile: number,
) {
  if (values.length === 0) return 0;
  if (method === "MAXIMUM") return Math.max(...values);
  if (method === "MEAN")
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (method === "MEDIAN") return median(values);
  return percentile(values, quantile);
}

function aggregateBucket(
  bucket: TimeSeriesPoint[],
  method: SignalAggregationMethod,
  quantile: number,
) {
  if (method === "EVENT_PRESERVING") {
    return bucket.reduce((selected, point) =>
      Math.abs(point.relativeDeviation) > Math.abs(selected.relativeDeviation)
        ? point
        : selected,
    );
  }
  const timestamp =
    bucket.reduce((sum, point) => sum + point.timestampSeconds, 0) /
    bucket.length;
  const warnings = [
    ...new Set(
      bucket
        .map((point) => point.qualityWarning)
        .filter((warning): warning is string => Boolean(warning)),
    ),
  ];
  return {
    timestampSeconds: timestamp,
    windowStartSeconds: bucket[0]?.windowStartSeconds ?? timestamp,
    windowEndSeconds: bucket.at(-1)?.windowEndSeconds ?? timestamp,
    rawValue: aggregateNumber(
      bucket.map((point) => point.rawValue),
      method,
      quantile,
    ),
    normalizedValue: clamp(
      aggregateNumber(
        bucket.map((point) => point.normalizedValue),
        method,
        quantile,
      ),
      0,
      1,
    ),
    localBaseline: aggregateNumber(
      bucket.map((point) => point.localBaseline),
      method,
      quantile,
    ),
    globalBaseline: aggregateNumber(
      bucket.map((point) => point.globalBaseline ?? point.localBaseline),
      method,
      quantile,
    ),
    relativeDeviation: aggregateNumber(
      bucket.map((point) => point.relativeDeviation),
      method,
      quantile,
    ),
    sourceStreamIndex: bucket[0]?.sourceStreamIndex,
    qualityWarning: warnings.length > 0 ? warnings.join("; ") : undefined,
  } satisfies TimeSeriesPoint;
}

export function aggregateTimeSeries(
  points: TimeSeriesPoint[],
  options: {
    maxPoints: number;
    method: SignalAggregationMethod;
    percentile?: number;
  },
) {
  const maxPoints = Math.max(1, Math.floor(options.maxPoints));
  if (points.length <= maxPoints) return [...points];
  const bucketSize = Math.ceil(points.length / maxPoints);
  const result: TimeSeriesPoint[] = [];
  for (let index = 0; index < points.length; index += bucketSize) {
    const bucket = points.slice(index, index + bucketSize);
    if (bucket.length > 0) {
      result.push(
        aggregateBucket(bucket, options.method, options.percentile ?? 0.95),
      );
    }
  }
  return result;
}

export function encodeTimeSeriesChunks(
  points: TimeSeriesPoint[],
  chunkSize = DEFAULT_SIGNAL_CHUNK_SIZE,
) {
  const boundedChunkSize = Math.max(
    1,
    Math.min(DEFAULT_SIGNAL_CHUNK_SIZE, Math.floor(chunkSize)),
  );
  const chunks: EncodedSignalChunk[] = [];
  for (let index = 0; index < points.length; index += boundedChunkSize) {
    const chunkPoints = points.slice(index, index + boundedChunkSize);
    const raw = Buffer.from(
      JSON.stringify({
        schemaVersion: SIGNAL_CHUNK_SCHEMA_VERSION,
        points: chunkPoints,
      }),
      "utf8",
    );
    if (raw.byteLength > MAX_DECOMPRESSED_CHUNK_BYTES) {
      throw new Error("A signal chunk is too large to store safely.");
    }
    const payload = Uint8Array.from(gzipSync(raw, { level: 6 }));
    const normalizedValues = chunkPoints.map((point) => point.normalizedValue);
    const deviations = chunkPoints.map((point) =>
      Math.abs(point.relativeDeviation),
    );
    chunks.push({
      chunkIndex: chunks.length,
      startSeconds: chunkPoints[0]?.windowStartSeconds ?? 0,
      endSeconds: chunkPoints.at(-1)?.windowEndSeconds ?? 0,
      pointCount: chunkPoints.length,
      encoding: "gzip-json-v1",
      payload,
      rawSizeBytes: raw.byteLength,
      compressedSizeBytes: payload.byteLength,
      minimumNormalizedValue:
        normalizedValues.length > 0 ? Math.min(...normalizedValues) : null,
      maximumNormalizedValue:
        normalizedValues.length > 0 ? Math.max(...normalizedValues) : null,
      maximumAbsoluteDeviation:
        deviations.length > 0 ? Math.max(...deviations) : null,
    });
  }
  return chunks;
}

export function decodeTimeSeriesChunk(
  payload: Uint8Array,
  expectedPointCount?: number,
) {
  const raw = gunzipSync(payload, {
    maxOutputLength: MAX_DECOMPRESSED_CHUNK_BYTES,
  });
  const document = chunkDocumentSchema.parse(
    JSON.parse(raw.toString("utf8")) as unknown,
  );
  if (
    expectedPointCount !== undefined &&
    document.points.length !== expectedPointCount
  ) {
    throw new Error("Stored signal chunk point count does not match metadata.");
  }
  return document.points;
}
