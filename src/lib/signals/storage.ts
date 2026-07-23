import type {
  AudioTrackRole,
  DetectorSourceSignal,
  Prisma,
  SignalAggregation,
  SignalCurveKind,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  aggregateTimeSeries,
  decodeTimeSeriesChunk,
  encodeTimeSeriesChunks,
  validateTimeSeries,
  type TimeSeriesPoint,
} from "@/lib/signals/time-series";

const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/);

const readOptionsSchema = z.object({
  startSeconds: z.number().finite().nonnegative().optional(),
  endSeconds: z.number().finite().nonnegative().optional(),
  maxPoints: z.number().int().min(1).max(10_000).default(2_000),
});

export type SignalCurveInput = {
  detectorRunId: string;
  audioTrackId?: string | null;
  stableId: string;
  kind: SignalCurveKind;
  displayName: string;
  unit: string;
  sourceSignal: DetectorSourceSignal;
  sourceTrackRole?: AudioTrackRole | null;
  sourceStreamIndex?: number | null;
  sampleIntervalSeconds: number;
  aggregation: SignalAggregation;
  configuration: Record<string, unknown>;
  statistics: Record<string, unknown>;
  rawPointCount: number;
  points: TimeSeriesPoint[];
};

function serializeBoundedObject(value: Record<string, unknown>, label: string) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > 100_000) {
    throw new Error(`${label} is too large to store safely.`);
  }
  return serialized;
}

export function prepareSignalCurve(
  input: SignalCurveInput,
  durationSeconds: number,
) {
  const stableId = stableIdSchema.parse(input.stableId);
  if (!input.displayName.trim() || input.displayName.length > 160) {
    throw new Error("Signal curve display name is invalid.");
  }
  if (!input.unit.trim() || input.unit.length > 80) {
    throw new Error("Signal curve unit is invalid.");
  }
  if (
    !Number.isFinite(input.sampleIntervalSeconds) ||
    input.sampleIntervalSeconds <= 0
  ) {
    throw new Error("Signal sample interval must be positive.");
  }
  if (
    !Number.isSafeInteger(input.rawPointCount) ||
    input.rawPointCount < input.points.length
  ) {
    throw new Error(
      "Raw signal count cannot be smaller than the stored point count.",
    );
  }
  validateTimeSeries(input.points, durationSeconds);
  const chunks = encodeTimeSeriesChunks(input.points);
  const configurationJson = serializeBoundedObject(
    input.configuration,
    "Signal configuration",
  );
  const statisticsJson = serializeBoundedObject(
    input.statistics,
    "Signal statistics",
  );
  const permanentDataBytes =
    Buffer.byteLength(configurationJson, "utf8") +
    Buffer.byteLength(statisticsJson, "utf8") +
    chunks.reduce((total, chunk) => total + chunk.compressedSizeBytes, 0);
  return {
    curve: {
      detectorRunId: input.detectorRunId,
      audioTrackId: input.audioTrackId ?? null,
      stableId,
      kind: input.kind,
      displayName: input.displayName.trim(),
      unit: input.unit.trim(),
      sourceSignal: input.sourceSignal,
      sourceTrackRole: input.sourceTrackRole ?? null,
      sourceStreamIndex: input.sourceStreamIndex ?? null,
      sampleIntervalSeconds: input.sampleIntervalSeconds,
      aggregation: input.aggregation,
      configurationJson,
      statisticsJson,
      rawPointCount: input.rawPointCount,
      storedPointCount: input.points.length,
    },
    chunks,
    permanentDataBytes,
  };
}

type DatabaseTransaction = Prisma.TransactionClient;

export async function refreshDetectorRunSignalMetrics(
  transaction: DatabaseTransaction,
  detectorRunId: string,
) {
  const curves = await transaction.signalCurve.findMany({
    where: { detectorRunId },
    include: { chunks: true },
  });
  const rawMeasurementCount = curves.reduce(
    (total, curve) => total + curve.rawPointCount,
    0,
  );
  const aggregatedMeasurementCount = curves.reduce(
    (total, curve) => total + curve.storedPointCount,
    0,
  );
  const curveChunkCount = curves.reduce(
    (total, curve) => total + curve.chunks.length,
    0,
  );
  const permanentDataBytes = curves.reduce(
    (curveTotal, curve) =>
      curveTotal +
      Buffer.byteLength(curve.configurationJson, "utf8") +
      Buffer.byteLength(curve.statisticsJson, "utf8") +
      curve.chunks.reduce(
        (chunkTotal, chunk) => chunkTotal + chunk.compressedSizeBytes,
        0,
      ),
    0,
  );
  await transaction.detectorRun.update({
    where: { id: detectorRunId },
    data: {
      rawMeasurementCount,
      aggregatedMeasurementCount,
      curveChunkCount,
      permanentDataBytes: BigInt(permanentDataBytes),
    },
  });
  return {
    rawMeasurementCount,
    aggregatedMeasurementCount,
    curveChunkCount,
    permanentDataBytes,
  };
}

export async function saveSignalCurve(input: SignalCurveInput) {
  const run = await db.detectorRun.findUnique({
    where: { id: input.detectorRunId },
    include: { analysisJob: { include: { project: true } } },
  });
  if (!run) {
    throw new AppError(
      "That detector run no longer exists.",
      404,
      "DETECTOR_RUN_NOT_FOUND",
    );
  }
  if (input.audioTrackId) {
    const track = await db.audioTrack.findUnique({
      where: { id: input.audioTrackId },
    });
    if (!track || track.projectId !== run.analysisJob.projectId) {
      throw new AppError(
        "The selected audio track does not belong to this project.",
        409,
        "SIGNAL_AUDIO_TRACK_MISMATCH",
      );
    }
  }
  const prepared = prepareSignalCurve(
    input,
    run.analysisJob.project.durationSeconds,
  );
  return db.$transaction(async (transaction) => {
    await transaction.signalCurve.deleteMany({
      where: { detectorRunId: input.detectorRunId, stableId: input.stableId },
    });
    const curve = await transaction.signalCurve.create({
      data: {
        ...prepared.curve,
        chunks: {
          create: prepared.chunks.map((chunk) => ({
            chunkIndex: chunk.chunkIndex,
            startSeconds: chunk.startSeconds,
            endSeconds: chunk.endSeconds,
            pointCount: chunk.pointCount,
            encoding: chunk.encoding,
            payload: chunk.payload,
            rawSizeBytes: chunk.rawSizeBytes,
            compressedSizeBytes: chunk.compressedSizeBytes,
            minimumNormalizedValue: chunk.minimumNormalizedValue,
            maximumNormalizedValue: chunk.maximumNormalizedValue,
            maximumAbsoluteDeviation: chunk.maximumAbsoluteDeviation,
          })),
        },
      },
    });
    await refreshDetectorRunSignalMetrics(transaction, input.detectorRunId);
    return curve;
  });
}

export async function deleteSignalCurve(curveId: string) {
  const curve = await db.signalCurve.findUnique({ where: { id: curveId } });
  if (!curve) {
    throw new AppError(
      "That signal curve no longer exists.",
      404,
      "SIGNAL_CURVE_NOT_FOUND",
    );
  }
  await db.$transaction(async (transaction) => {
    await transaction.signalCurve.delete({ where: { id: curve.id } });
    await refreshDetectorRunSignalMetrics(transaction, curve.detectorRunId);
  });
}

export async function readSignalCurve(
  curveId: string,
  rawOptions: {
    startSeconds?: number;
    endSeconds?: number;
    maxPoints?: number;
  } = {},
) {
  const options = readOptionsSchema.parse(rawOptions);
  if (
    options.startSeconds !== undefined &&
    options.endSeconds !== undefined &&
    options.startSeconds >= options.endSeconds
  ) {
    throw new AppError(
      "The signal time range is not valid.",
      400,
      "SIGNAL_RANGE_INVALID",
    );
  }
  const curve = await db.signalCurve.findUnique({
    where: { id: curveId },
    include: {
      chunks: {
        where: {
          ...(options.startSeconds === undefined
            ? {}
            : { endSeconds: { gte: options.startSeconds } }),
          ...(options.endSeconds === undefined
            ? {}
            : { startSeconds: { lte: options.endSeconds } }),
        },
        orderBy: { chunkIndex: "asc" },
      },
    },
  });
  if (!curve) {
    throw new AppError(
      "That signal curve no longer exists.",
      404,
      "SIGNAL_CURVE_NOT_FOUND",
    );
  }
  const decoded = curve.chunks.flatMap((chunk) => {
    if (chunk.encoding !== "gzip-json-v1") {
      throw new AppError(
        "This saved signal uses an unsupported encoding.",
        409,
        "SIGNAL_ENCODING_UNSUPPORTED",
      );
    }
    return decodeTimeSeriesChunk(chunk.payload, chunk.pointCount);
  });
  const filtered = decoded.filter(
    (point) =>
      (options.startSeconds === undefined ||
        point.windowEndSeconds >= options.startSeconds) &&
      (options.endSeconds === undefined ||
        point.windowStartSeconds <= options.endSeconds),
  );
  const points = aggregateTimeSeries(filtered, {
    maxPoints: options.maxPoints,
    method: "EVENT_PRESERVING",
  });
  return {
    curve: {
      id: curve.id,
      stableId: curve.stableId,
      kind: curve.kind,
      displayName: curve.displayName,
      unit: curve.unit,
      sourceSignal: curve.sourceSignal,
      sourceTrackRole: curve.sourceTrackRole,
      sourceStreamIndex: curve.sourceStreamIndex,
      sampleIntervalSeconds: curve.sampleIntervalSeconds,
      aggregation: curve.aggregation,
      configuration: JSON.parse(curve.configurationJson) as unknown,
      statistics: JSON.parse(curve.statisticsJson) as unknown,
      rawPointCount: curve.rawPointCount,
      storedPointCount: curve.storedPointCount,
      returnedPointCount: points.length,
    },
    points,
  };
}

export async function listSignalCurvesForJob(analysisJobId: string) {
  return db.signalCurve.findMany({
    where: { detectorRun: { analysisJobId } },
    include: { chunks: { select: { id: true } } },
    orderBy: [{ kind: "asc" }, { displayName: "asc" }],
  });
}
