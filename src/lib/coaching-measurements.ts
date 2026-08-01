import { spawn } from "node:child_process";

import type {
  CoachingFindingCategory,
  CoachingFindingSeverity,
  Prisma,
} from "@prisma/client";
import { z } from "zod";

import { COACHING_RULE_SET_VERSION } from "@/lib/coaching";
import { appConfig } from "@/lib/config";
import { resolveDataPath } from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const COACHING_CALIBRATION_VERSION = "u6-coaching-calibration-v1";
export const COACHING_MEASUREMENT_VERSION = "u6-local-measurements-v1";
export const REPEATED_VIEW_METHOD_VERSION =
  "u6-downscaled-grayscale-similarity-v1";

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().optional();

export const coachingCalibrationSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    crosshairNormalizedX: z.number().min(0).max(1).default(0.5),
    crosshairNormalizedY: z.number().min(0).max(1).default(0.5),
    hudScalePercent: z.number().min(25).max(200).nullable().optional(),
    sensitivityAssumptions: optionalText(1_000),
    aspectRatio: z.string().trim().min(3).max(40).nullable().optional(),
    fovDegrees: z.number().min(1).max(180).nullable().optional(),
    colorSettings: optionalText(1_000),
    safeAreaNotes: optionalText(1_000),
    overlayNotes: optionalText(1_000),
    userConfirmed: z.literal(true, {
      error:
        "Confirm that these calibration values are user-supplied assumptions.",
    }),
  })
  .strict();

const measurementBase = {
  calibrationId: z.string().trim().min(1).max(191).nullable().optional(),
  userConfirmed: z.literal(true, {
    error:
      "Confirm that you reviewed the selected timestamps and any marked points.",
  }),
};

export const coachingMeasurementSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("CROSSHAIR_OFFSET"),
      timestampSeconds: z.number().min(0),
      targetNormalizedX: z.number().min(0).max(1),
      targetNormalizedY: z.number().min(0).max(1),
      ...measurementBase,
    })
    .strict(),
  z
    .object({
      kind: z.literal("CROSSHAIR_CORRECTION"),
      timestampSeconds: z.number().min(0),
      alignedTimestampSeconds: z.number().min(0),
      targetNormalizedX: z.number().min(0).max(1),
      targetNormalizedY: z.number().min(0).max(1),
      ...measurementBase,
    })
    .strict()
    .refine((value) => value.alignedTimestampSeconds > value.timestampSeconds, {
      message: "The aligned timestamp must be after the first visible threat.",
      path: ["alignedTimestampSeconds"],
    }),
  z
    .object({
      kind: z.literal("EXPOSURE_DURATION"),
      startSeconds: z.number().min(0),
      endSeconds: z.number().min(0),
      ...measurementBase,
    })
    .strict()
    .refine((value) => value.endSeconds > value.startSeconds, {
      message: "The exposure end must be after its start.",
      path: ["endSeconds"],
    }),
  z
    .object({
      kind: z.literal("REPEATED_VIEW_SIMILARITY"),
      firstTimestampSeconds: z.number().min(0),
      secondTimestampSeconds: z.number().min(0),
      sameViewConfirmed: z.literal(true, {
        error:
          "Confirm that you reviewed both timestamps as the same visible view.",
      }),
      ...measurementBase,
    })
    .strict()
    .refine(
      (value) => value.secondTimestampSeconds > value.firstTimestampSeconds,
      {
        message: "The second timestamp must be after the first.",
        path: ["secondTimestampSeconds"],
      },
    ),
]);

type CrosshairInput = {
  crosshairNormalizedX: number;
  crosshairNormalizedY: number;
  targetNormalizedX: number;
  targetNormalizedY: number;
  width: number;
  height: number;
};

export function measureCrosshairOffset(input: CrosshairInput) {
  const normalizedDeltaX = input.targetNormalizedX - input.crosshairNormalizedX;
  const normalizedDeltaY = input.targetNormalizedY - input.crosshairNormalizedY;
  const pixelDeltaX = normalizedDeltaX * input.width;
  const pixelDeltaY = normalizedDeltaY * input.height;
  return {
    normalizedDeltaX,
    normalizedDeltaY,
    normalizedDistance: Math.hypot(normalizedDeltaX, normalizedDeltaY),
    pixelDeltaX,
    pixelDeltaY,
    pixelDistance: Math.hypot(pixelDeltaX, pixelDeltaY),
    verticalDirection:
      normalizedDeltaY < -0.005
        ? "target-above-crosshair"
        : normalizedDeltaY > 0.005
          ? "target-below-crosshair"
          : "similar-height",
  };
}

export function calculateFrameSimilarity(
  first: Uint8Array,
  second: Uint8Array,
) {
  if (first.length === 0 || first.length !== second.length) {
    throw new Error("Frame samples must have the same non-zero byte length.");
  }
  let absoluteDifference = 0;
  for (let index = 0; index < first.length; index += 1) {
    absoluteDifference += Math.abs((first[index] ?? 0) - (second[index] ?? 0));
  }
  const meanAbsoluteDifference = absoluteDifference / first.length;
  return {
    meanAbsoluteDifference,
    similarity: Math.max(0, Math.min(1, 1 - meanAbsoluteDifference / 255)),
    sampleCount: first.length,
  };
}

async function extractGrayFrame(
  inputPath: string,
  timestampSeconds: number,
  width = 96,
  height = 54,
) {
  if (!appConfig.ffmpegPath) {
    throw new AppError(
      "FFmpeg is not available for the local frame measurement.",
      503,
      "FFMPEG_UNAVAILABLE",
    );
  }
  const expectedBytes = width * height;
  return new Promise<Uint8Array>((resolve, reject) => {
    const child = spawn(
      appConfig.ffmpegPath!,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        timestampSeconds.toFixed(3),
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-vf",
        `scale=${width}:${height}:flags=area,format=gray`,
        "-f",
        "rawvideo",
        "pipe:1",
      ],
      { shell: false, stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks: Buffer[] = [];
    let byteCount = 0;
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      if (!settled) {
        settled = true;
        reject(new Error("The local frame sample timed out."));
      }
    }, 20_000);
    child.stdout.on("data", (chunk: Buffer) => {
      if (byteCount <= expectedBytes * 2) {
        chunks.push(chunk);
        byteCount += chunk.length;
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 20_000) stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      const bytes = Buffer.concat(chunks);
      if (code !== 0 || bytes.length !== expectedBytes) {
        reject(
          new Error(
            stderr.trim() ||
              "The selected timestamp did not produce a readable frame.",
          ),
        );
        return;
      }
      resolve(new Uint8Array(bytes));
    });
  });
}

export async function measureRepeatedFrameSimilarity(
  inputPath: string,
  firstTimestampSeconds: number,
  secondTimestampSeconds: number,
) {
  const first = await extractGrayFrame(inputPath, firstTimestampSeconds);
  const second = await extractGrayFrame(inputPath, secondTimestampSeconds);
  return calculateFrameSimilarity(first, second);
}

async function requireMeasurementProject(studioProjectId: string) {
  const project = await db.studioProject.findUnique({
    where: { id: studioProjectId },
    include: {
      inputs: {
        include: { videoProject: true },
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
      },
      coachingCalibrations: {
        orderBy: { version: "desc" },
      },
    },
  });
  if (!project) {
    throw new AppError(
      "That Creator Studio project no longer exists.",
      404,
      "STUDIO_PROJECT_NOT_FOUND",
    );
  }
  const recording = project.inputs.find(
    (input) => input.kind === "PRIMARY_RECORDING",
  )?.videoProject;
  if (!recording) {
    throw new AppError(
      "Recording measurements require a primary screen recording.",
      409,
      "COACHING_RECORDING_REQUIRED",
    );
  }
  return { project, recording };
}

export async function createCoachingCalibration(
  studioProjectId: string,
  input: unknown,
) {
  const value = coachingCalibrationSchema.parse(input);
  const { project, recording } =
    await requireMeasurementProject(studioProjectId);
  const version = (project.coachingCalibrations[0]?.version ?? 0) + 1;
  await db.$transaction([
    db.coachingCalibration.updateMany({
      where: { studioProjectId, isActive: true },
      data: { isActive: false },
    }),
    db.coachingCalibration.create({
      data: {
        studioProjectId,
        videoProjectId: recording.id,
        version,
        name: value.name,
        isActive: true,
        crosshairNormalizedX: value.crosshairNormalizedX,
        crosshairNormalizedY: value.crosshairNormalizedY,
        hudScalePercent: value.hudScalePercent ?? null,
        sensitivityAssumptions: value.sensitivityAssumptions ?? null,
        aspectRatio:
          value.aspectRatio ?? `${recording.width}:${recording.height}`,
        fovDegrees: value.fovDegrees ?? null,
        sourceWidth: recording.width,
        sourceHeight: recording.height,
        colorSettings: value.colorSettings ?? null,
        safeAreaNotes: value.safeAreaNotes ?? null,
        overlayNotes: value.overlayNotes ?? null,
        userConfirmed: true,
        calibrationVersion: COACHING_CALIBRATION_VERSION,
      },
    }),
  ]);
}

export async function deleteCoachingCalibration(
  studioProjectId: string,
  calibrationId: string,
) {
  const calibration = await db.coachingCalibration.findFirst({
    where: { id: calibrationId, studioProjectId },
  });
  if (!calibration) {
    throw new AppError(
      "That coaching calibration no longer exists.",
      404,
      "COACHING_CALIBRATION_NOT_FOUND",
    );
  }
  await db.coachingCalibration.delete({ where: { id: calibration.id } });
  const latest = await db.coachingCalibration.findFirst({
    where: { studioProjectId },
    orderBy: { version: "desc" },
  });
  if (latest) {
    await db.coachingCalibration.update({
      where: { id: latest.id },
      data: { isActive: true },
    });
  }
}

async function requireCalibration(
  studioProjectId: string,
  calibrationId: string | null | undefined,
) {
  const calibration = await db.coachingCalibration.findFirst({
    where: calibrationId
      ? { id: calibrationId, studioProjectId }
      : { studioProjectId, isActive: true },
    orderBy: { version: "desc" },
  });
  if (!calibration || !calibration.userConfirmed) {
    throw new AppError(
      "Save and confirm a coaching calibration before measuring crosshair placement.",
      409,
      "COACHING_CALIBRATION_REQUIRED",
    );
  }
  return calibration;
}

async function ensureMeasurementAnalysis(
  transaction: Prisma.TransactionClient,
  studioProjectId: string,
  inputMode: "SCREEN_RECORDING_ONLY" | "SCREEN_RECORDING_AND_REPLAY",
  calibrationId: string | null,
  sourceSnapshotJson: string,
) {
  const existing = await transaction.coachingAnalysis.findFirst({
    where: {
      studioProjectId,
      analysisVersion: COACHING_MEASUREMENT_VERSION,
      calibrationId,
      status: "COMPLETED",
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  const now = new Date();
  return transaction.coachingAnalysis.create({
    data: {
      studioProjectId,
      calibrationId,
      inputMode,
      status: "COMPLETED",
      progress: 100,
      stage: "Local recording measurements ready",
      analysisVersion: COACHING_MEASUREMENT_VERSION,
      ruleSetVersion: COACHING_RULE_SET_VERSION,
      sourceSnapshotJson,
      detectorVersionsJson: JSON.stringify({
        recordingMeasurement: COACHING_MEASUREMENT_VERSION,
      }),
      completedRuleCount: 1,
      startedAt: now,
      completedAt: now,
    },
  });
}

type MeasurementResult = {
  kind:
    | "CROSSHAIR_OFFSET"
    | "CROSSHAIR_CORRECTION"
    | "EXPOSURE_DURATION"
    | "REPEATED_VIEW_SIMILARITY";
  startSeconds: number;
  peakSeconds: number;
  endSeconds: number;
  category: CoachingFindingCategory;
  severity: CoachingFindingSeverity;
  confidence: number;
  directObservation: string;
  inference: string;
  missingContext: string[];
  alternatives: string[];
  inputs: Record<string, unknown>;
  measurements: Record<string, unknown>;
  thresholds: Record<string, unknown>;
  warnings: string[];
  calibrationId: string | null;
  supportingFrames: Array<Record<string, unknown>>;
};

async function measureInput(
  studioProjectId: string,
  input: z.infer<typeof coachingMeasurementSchema>,
): Promise<MeasurementResult> {
  const { recording } = await requireMeasurementProject(studioProjectId);
  const maximumTimestamp = Math.max(
    "timestampSeconds" in input ? input.timestampSeconds : 0,
    "alignedTimestampSeconds" in input ? input.alignedTimestampSeconds : 0,
    "startSeconds" in input ? input.startSeconds : 0,
    "endSeconds" in input ? input.endSeconds : 0,
    "firstTimestampSeconds" in input ? input.firstTimestampSeconds : 0,
    "secondTimestampSeconds" in input ? input.secondTimestampSeconds : 0,
  );
  if (maximumTimestamp > recording.durationSeconds) {
    throw new AppError(
      `Choose timestamps between 0 and ${recording.durationSeconds.toFixed(2)} seconds.`,
      400,
      "COACHING_MEASUREMENT_TIMESTAMP_INVALID",
    );
  }

  if (
    input.kind === "CROSSHAIR_OFFSET" ||
    input.kind === "CROSSHAIR_CORRECTION"
  ) {
    const calibration = await requireCalibration(
      studioProjectId,
      input.calibrationId,
    );
    const offset = measureCrosshairOffset({
      crosshairNormalizedX: calibration.crosshairNormalizedX,
      crosshairNormalizedY: calibration.crosshairNormalizedY,
      targetNormalizedX: input.targetNormalizedX,
      targetNormalizedY: input.targetNormalizedY,
      width: recording.width,
      height: recording.height,
    });
    const issueThreshold = 0.075;
    const disciplinedThreshold = 0.025;
    const correctionSeconds =
      input.kind === "CROSSHAIR_CORRECTION"
        ? input.alignedTimestampSeconds - input.timestampSeconds
        : null;
    const category: CoachingFindingCategory =
      offset.normalizedDistance > issueThreshold ||
      (correctionSeconds != null && correctionSeconds > 0.45)
        ? "CROSSHAIR_PLACEMENT_ISSUE"
        : offset.normalizedDistance <= disciplinedThreshold &&
            (correctionSeconds == null || correctionSeconds <= 0.25)
          ? "GOOD_CROSSHAIR_DISCIPLINE"
          : "REVIEW_RECOMMENDED";
    const endSeconds =
      input.kind === "CROSSHAIR_CORRECTION"
        ? input.alignedTimestampSeconds
        : input.timestampSeconds;
    return {
      kind: input.kind,
      startSeconds: input.timestampSeconds,
      peakSeconds: input.timestampSeconds,
      endSeconds,
      category,
      severity:
        category === "CROSSHAIR_PLACEMENT_ISSUE" ? "MEDIUM" : "INFORMATIONAL",
      confidence: 0.7,
      directObservation: `At ${input.timestampSeconds.toFixed(3)}s, the user-marked visible target point was ${offset.pixelDistance.toFixed(1)} pixels (${(offset.normalizedDistance * 100).toFixed(2)}% of the normalized frame diagonal) from calibration ${calibration.version}'s crosshair center.`,
      inference:
        category === "CROSSHAIR_PLACEMENT_ISSUE"
          ? "The measured offset or correction time may justify reviewing pre-aim placement."
          : category === "GOOD_CROSSHAIR_DISCIPLINE"
            ? "The marked target was close to the calibrated crosshair in this reviewed frame."
            : "The measured offset is worth reviewing without classifying it as good or bad.",
      missingContext: [
        "The target's prior motion, the intended hold, recoil, weapon state, shot timing, and player intention are not established.",
        "A user-marked target point is not automatic threat recognition.",
      ],
      alternatives: [
        "The player may have been correcting for movement, recoil, perspective, or a threat that moved between reviewed frames.",
      ],
      inputs: {
        timestampSeconds: input.timestampSeconds,
        alignedTimestampSeconds:
          input.kind === "CROSSHAIR_CORRECTION"
            ? input.alignedTimestampSeconds
            : null,
        targetNormalizedX: input.targetNormalizedX,
        targetNormalizedY: input.targetNormalizedY,
        crosshairNormalizedX: calibration.crosshairNormalizedX,
        crosshairNormalizedY: calibration.crosshairNormalizedY,
        sourceWidth: recording.width,
        sourceHeight: recording.height,
      },
      measurements: {
        ...offset,
        correctionSeconds,
      },
      thresholds: {
        issueThreshold,
        disciplinedThreshold,
        slowCorrection: 0.45,
      },
      warnings: [
        "The target location and timing were supplied through deliberate human review.",
      ],
      calibrationId: calibration.id,
      supportingFrames: [
        {
          timestampSeconds: input.timestampSeconds,
          retainedImage: false,
          targetNormalizedX: input.targetNormalizedX,
          targetNormalizedY: input.targetNormalizedY,
        },
      ],
    };
  }

  if (input.kind === "EXPOSURE_DURATION") {
    const durationSeconds = input.endSeconds - input.startSeconds;
    return {
      kind: input.kind,
      startSeconds: input.startSeconds,
      peakSeconds: input.endSeconds,
      endSeconds: input.endSeconds,
      category: "REVIEW_RECOMMENDED",
      severity: durationSeconds >= 2 ? "MEDIUM" : "LOW",
      confidence: 0.6,
      directObservation: `The user-marked visible exposure lasted ${durationSeconds.toFixed(3)} seconds from ${input.startSeconds.toFixed(3)}s to ${input.endSeconds.toFixed(3)}s.`,
      inference:
        "This exposure duration may be useful for reviewing timing, cover, and the decision to remain visible.",
      missingContext: [
        "Threat location, available cover, teammate coverage, utility, objective pressure, and intention are not established.",
        "Exposure duration alone does not prove poor positioning or timing.",
      ],
      alternatives: [
        "Remaining exposed may have been necessary for information, pressure, a trade, or objective play.",
      ],
      inputs: {
        startSeconds: input.startSeconds,
        endSeconds: input.endSeconds,
      },
      measurements: { durationSeconds },
      thresholds: { reviewDurationSeconds: 1.5 },
      warnings: [
        "Exposure boundaries were marked by a human, not automatically detected.",
      ],
      calibrationId: input.calibrationId ?? null,
      supportingFrames: [
        { timestampSeconds: input.startSeconds, retainedImage: false },
        { timestampSeconds: input.endSeconds, retainedImage: false },
      ],
    };
  }

  const similarity = await measureRepeatedFrameSimilarity(
    resolveDataPath(recording.sourceRelativePath),
    input.firstTimestampSeconds,
    input.secondTimestampSeconds,
  );
  const gapSeconds = input.secondTimestampSeconds - input.firstTimestampSeconds;
  const repeatedThreshold = 0.88;
  const category: CoachingFindingCategory =
    similarity.similarity >= repeatedThreshold &&
    gapSeconds >= 0.75 &&
    gapSeconds <= 20
      ? "POSSIBLE_UNNECESSARY_REPEEK"
      : "REVIEW_RECOMMENDED";
  return {
    kind: input.kind,
    startSeconds: input.firstTimestampSeconds,
    peakSeconds: input.secondTimestampSeconds,
    endSeconds: input.secondTimestampSeconds,
    category,
    severity: category === "POSSIBLE_UNNECESSARY_REPEEK" ? "MEDIUM" : "LOW",
    confidence: category === "POSSIBLE_UNNECESSARY_REPEEK" ? 0.58 : 0.45,
    directObservation: `Downscaled grayscale samples at ${input.firstTimestampSeconds.toFixed(3)}s and ${input.secondTimestampSeconds.toFixed(3)}s had ${(similarity.similarity * 100).toFixed(1)}% pixel similarity; the user confirmed both timestamps show the same visible view.`,
    inference:
      category === "POSSIBLE_UNNECESSARY_REPEEK"
        ? "The repeated similar view may be an unnecessary re-peek and should be reviewed."
        : "The samples do not provide enough repeated-view similarity to classify a possible re-peek.",
    missingContext: [
      "Image similarity does not establish the same tactical angle, threat state, player intention, cover, or necessity.",
      "No validated camera orientation or room position is available from the replay provider.",
    ],
    alternatives: [
      "A static menu, held angle, spectator view, edited repeat, or necessary recheck can also produce similar frames.",
    ],
    inputs: {
      firstTimestampSeconds: input.firstTimestampSeconds,
      secondTimestampSeconds: input.secondTimestampSeconds,
      sameViewConfirmed: input.sameViewConfirmed,
      sampleWidth: 96,
      sampleHeight: 54,
      preprocessing: "area-downscale, grayscale",
    },
    measurements: { ...similarity, gapSeconds },
    thresholds: {
      repeatedThreshold,
      minimumGapSeconds: 0.75,
      maximumGapSeconds: 20,
    },
    warnings: [
      "No frame image was permanently stored.",
      "Repeated-view similarity is experimental and cannot diagnose tactical intent.",
    ],
    calibrationId: input.calibrationId ?? null,
    supportingFrames: [
      { timestampSeconds: input.firstTimestampSeconds, retainedImage: false },
      { timestampSeconds: input.secondTimestampSeconds, retainedImage: false },
    ],
  };
}

export async function createCoachingMeasurement(
  studioProjectId: string,
  rawInput: unknown,
) {
  const input = coachingMeasurementSchema.parse(rawInput);
  const { project, recording } =
    await requireMeasurementProject(studioProjectId);
  const result = await measureInput(studioProjectId, input);
  const sourceSnapshotJson = JSON.stringify({
    inputMode: project.inputMode,
    recordingId: recording.id,
    recordingDurationSeconds: recording.durationSeconds,
    calibrationId: result.calibrationId,
  });

  await db.$transaction(async (transaction) => {
    const analysis = await ensureMeasurementAnalysis(
      transaction,
      studioProjectId,
      project.inputMode === "SCREEN_RECORDING_AND_REPLAY"
        ? "SCREEN_RECORDING_AND_REPLAY"
        : "SCREEN_RECORDING_ONLY",
      result.calibrationId,
      sourceSnapshotJson,
    );
    const measurement = await transaction.coachingMeasurement.create({
      data: {
        studioProjectId,
        videoProjectId: recording.id,
        calibrationId: result.calibrationId,
        kind: result.kind,
        startSeconds: result.startSeconds,
        peakSeconds: result.peakSeconds,
        endSeconds: result.endSeconds,
        confidence: result.confidence,
        methodVersion:
          result.kind === "REPEATED_VIEW_SIMILARITY"
            ? REPEATED_VIEW_METHOD_VERSION
            : COACHING_MEASUREMENT_VERSION,
        inputsJson: JSON.stringify(result.inputs),
        measurementsJson: JSON.stringify(result.measurements),
        thresholdsJson: JSON.stringify(result.thresholds),
        userConfirmed: true,
        warningMessagesJson: JSON.stringify(result.warnings),
      },
    });
    const finding = await transaction.coachingFinding.create({
      data: {
        studioProjectId,
        analysisId: analysis.id,
        originalCategory: result.category,
        category: result.category,
        originalSeverity: result.severity,
        severity: result.severity,
        confidence: result.confidence,
        originalVideoTimestampSeconds: result.peakSeconds,
        videoTimestampSeconds: result.peakSeconds,
        directObservationsJson: JSON.stringify([result.directObservation]),
        supportingFramesJson: JSON.stringify(result.supportingFrames),
        missingContextJson: JSON.stringify(result.missingContext),
        explanation: `${result.inference} This is an inference from a bounded local measurement, not proof of intention or mechanical cause.`,
        alternativeExplanationsJson: JSON.stringify(result.alternatives),
        detectorVersionsJson: JSON.stringify({
          recordingMeasurement:
            result.kind === "REPEATED_VIEW_SIMILARITY"
              ? REPEATED_VIEW_METHOD_VERSION
              : COACHING_MEASUREMENT_VERSION,
        }),
        analysisVersion: COACHING_MEASUREMENT_VERSION,
        evidence: {
          create: [
            {
              evidenceClass: "DIRECT_VIDEO_OBSERVATION",
              summary: result.directObservation,
              sourceType: "LOCAL_USER_CONFIRMED_MEASUREMENT",
              sourceId: measurement.id,
              videoTimestampSeconds: result.peakSeconds,
              confidence: result.confidence,
              observationJson: JSON.stringify({
                inputs: result.inputs,
                measurements: result.measurements,
                thresholds: result.thresholds,
                userConfirmed: true,
              }),
            },
            {
              evidenceClass: "INFERENCE",
              summary: result.inference,
              sourceType: "LOCAL_MEASUREMENT_RULE",
              sourceId: measurement.id,
              confidence: result.confidence,
              inferenceJson: JSON.stringify({
                category: result.category,
                isInference: true,
              }),
            },
            ...result.missingContext.map((summary) => ({
              evidenceClass: "MISSING_CONTEXT" as const,
              summary,
              sourceType: "CAPABILITY_BOUNDARY",
              sourceId: measurement.id,
            })),
          ],
        },
      },
    });
    await transaction.coachingMeasurement.update({
      where: { id: measurement.id },
      data: { findingId: finding.id },
    });
  });
}
