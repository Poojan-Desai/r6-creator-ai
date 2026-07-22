import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

import type { GroundTruthCategory, GroundTruthLabel } from "@prisma/client";
import { z } from "zod";

import { resolveDataPath } from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const LABEL_SCHEMA_VERSION = "r6-creator-benchmark-labels/v1";
export const LABEL_TIMESTAMP_UNITS = "seconds";

export const GROUND_TRUTH_CATEGORY_OPTIONS = [
  ["KILL", "Kill"],
  ["DEATH", "Death"],
  ["MULTI_KILL", "Multi-kill"],
  ["ROUND_WIN", "Round win"],
  ["ROUND_LOSS", "Round loss"],
  ["MATCH_ENDING", "Match ending"],
  ["POSSIBLE_CLUTCH", "Possible clutch"],
  ["DEFUSER_PLANT", "Defuser plant"],
  ["DEFUSER_DISABLE", "Defuser disable"],
  ["HIGH_ACTION_GAMEPLAY", "High-action gameplay"],
  ["LOUD_CREATOR_REACTION", "Loud creator reaction"],
  ["FUNNY_CONVERSATION", "Funny conversation"],
  ["RAGE_OR_FRUSTRATION", "Rage or frustration"],
  ["FAIL_OR_MISTAKE", "Fail or mistake"],
  ["EDUCATIONAL_EXPLANATION", "Educational explanation"],
  ["QUIET_OR_LOW_INTEREST", "Quiet or low-interest section"],
  ["MENU", "Menu"],
  ["SCOREBOARD", "Scoreboard"],
  ["REPLAY", "Replay"],
  ["SPECTATOR_SCREEN", "Spectator screen"],
  ["LOADING_SCREEN", "Loading screen"],
  ["OTHER_INTERESTING", "Other interesting moment"],
  ["OTHER_UNINTERESTING", "Other uninteresting moment"],
] as const satisfies ReadonlyArray<readonly [GroundTruthCategory, string]>;

const categoryValues = GROUND_TRUTH_CATEGORY_OPTIONS.map(
  ([value]) => value,
) as [GroundTruthCategory, ...GroundTruthCategory[]];

export const groundTruthCategorySchema = z.enum(categoryValues);

const timestampSchema = z.number().finite().min(0);

const groundTruthLabelFieldsSchema = z
  .object({
    category: groundTruthCategorySchema,
    startSeconds: timestampSchema,
    peakSeconds: timestampSchema,
    endSeconds: timestampSchema,
    description: z.string().trim().max(2_000).nullable().optional(),
    humanConfidence: z.number().finite().min(0).max(1),
    approved: z.boolean(),
  })
  .strict();

export const groundTruthLabelInputSchema =
  groundTruthLabelFieldsSchema.superRefine((value, context) => {
    if (value.peakSeconds < value.startSeconds) {
      context.addIssue({
        code: "custom",
        path: ["peakSeconds"],
        message: "Peak time must be at or after the start time.",
      });
    }
    if (value.endSeconds <= value.startSeconds) {
      context.addIssue({
        code: "custom",
        path: ["endSeconds"],
        message: "End time must be later than the start time.",
      });
    }
    if (value.peakSeconds > value.endSeconds) {
      context.addIssue({
        code: "custom",
        path: ["peakSeconds"],
        message: "Peak time must not be later than the end time.",
      });
    }
  });

export const groundTruthLabelPatchSchema =
  groundTruthLabelFieldsSchema.partial();

export type GroundTruthLabelInput = z.infer<typeof groundTruthLabelInputSchema>;

export type GroundTruthLabelDto = {
  id: string;
  projectId: string;
  category: GroundTruthCategory;
  startSeconds: number;
  peakSeconds: number;
  endSeconds: number;
  description: string | null;
  humanConfidence: number;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GroundTruthStateDto = {
  labels: GroundTruthLabelDto[];
  categories: Array<{ value: GroundTruthCategory; label: string }>;
  schemaVersion: typeof LABEL_SCHEMA_VERSION;
  timestampUnits: typeof LABEL_TIMESTAMP_UNITS;
};

const importedLabelSchema = groundTruthLabelInputSchema.safeExtend({
  labelId: z.string().trim().min(1).max(200),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const benchmarkLabelDocumentSchema = z
  .object({
    schemaVersion: z.literal(LABEL_SCHEMA_VERSION),
    timestampUnits: z.literal(LABEL_TIMESTAMP_UNITS),
    video: z
      .object({
        fingerprint: z.object({
          algorithm: z.literal("sha256"),
          value: z.string().regex(/^[a-f0-9]{64}$/),
        }),
        durationSeconds: z.number().finite().positive(),
        resolution: z.object({
          width: z.number().int().positive(),
          height: z.number().int().positive(),
        }),
      })
      .strict(),
    creationMetadata: z
      .object({
        application: z.literal("R6 Creator AI"),
        applicationVersion: z.string().min(1),
        createdAt: z.string().datetime(),
        labelCount: z.number().int().min(0),
      })
      .strict(),
    labels: z.array(importedLabelSchema).max(50_000),
  })
  .strict();

export type BenchmarkLabelDocument = z.infer<
  typeof benchmarkLabelDocumentSchema
>;

export function serializeGroundTruthLabel(
  label: GroundTruthLabel,
): GroundTruthLabelDto {
  return {
    id: label.id,
    projectId: label.projectId,
    category: label.category,
    startSeconds: label.startSeconds,
    peakSeconds: label.peakSeconds,
    endSeconds: label.endSeconds,
    description: label.description,
    humanConfidence: label.humanConfidence,
    approved: label.approved,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  };
}

export function assertLabelWithinVideo(
  label: GroundTruthLabelInput,
  durationSeconds: number,
) {
  if (label.endSeconds > durationSeconds + 0.001) {
    throw new AppError(
      "The label must end inside the recording.",
      400,
      "LABEL_OUT_OF_RANGE",
    );
  }
}

async function requireProject(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new AppError(
      "That project no longer exists.",
      404,
      "PROJECT_NOT_FOUND",
    );
  }
  return project;
}

export async function getGroundTruthState(
  projectId: string,
): Promise<GroundTruthStateDto> {
  await requireProject(projectId);
  const labels = await db.groundTruthLabel.findMany({
    where: { projectId },
    orderBy: [{ startSeconds: "asc" }, { createdAt: "asc" }],
  });
  return {
    labels: labels.map(serializeGroundTruthLabel),
    categories: GROUND_TRUTH_CATEGORY_OPTIONS.map(([value, label]) => ({
      value,
      label,
    })),
    schemaVersion: LABEL_SCHEMA_VERSION,
    timestampUnits: LABEL_TIMESTAMP_UNITS,
  };
}

export async function createGroundTruthLabel(
  projectId: string,
  value: unknown,
) {
  const project = await requireProject(projectId);
  const input = groundTruthLabelInputSchema.parse(value);
  assertLabelWithinVideo(input, project.durationSeconds);
  const label = await db.groundTruthLabel.create({
    data: {
      projectId,
      ...input,
      description: input.description || null,
    },
  });
  return serializeGroundTruthLabel(label);
}

export async function updateGroundTruthLabel(labelId: string, value: unknown) {
  const existing = await db.groundTruthLabel.findUnique({
    where: { id: labelId },
    include: { project: { select: { durationSeconds: true } } },
  });
  if (!existing) {
    throw new AppError(
      "That benchmark label no longer exists.",
      404,
      "LABEL_NOT_FOUND",
    );
  }
  const patch = groundTruthLabelPatchSchema.parse(value);
  const merged = groundTruthLabelInputSchema.parse({
    category: patch.category ?? existing.category,
    startSeconds: patch.startSeconds ?? existing.startSeconds,
    peakSeconds: patch.peakSeconds ?? existing.peakSeconds,
    endSeconds: patch.endSeconds ?? existing.endSeconds,
    description:
      patch.description === undefined
        ? existing.description
        : patch.description || null,
    humanConfidence: patch.humanConfidence ?? existing.humanConfidence,
    approved: patch.approved ?? existing.approved,
  });
  assertLabelWithinVideo(merged, existing.project.durationSeconds);
  const updated = await db.groundTruthLabel.update({
    where: { id: labelId },
    data: { ...merged, description: merged.description || null },
  });
  return serializeGroundTruthLabel(updated);
}

export async function deleteGroundTruthLabel(labelId: string) {
  const existing = await db.groundTruthLabel.findUnique({
    where: { id: labelId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError(
      "That benchmark label no longer exists.",
      404,
      "LABEL_NOT_FOUND",
    );
  }
  await db.groundTruthLabel.delete({ where: { id: labelId } });
}

export function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function getProjectVideoFingerprint(projectId: string) {
  const project = await requireProject(projectId);
  if (project.videoFingerprintSha256) return project.videoFingerprintSha256;
  const fingerprint = await hashFileSha256(
    resolveDataPath(project.sourceRelativePath),
  );
  await db.project.update({
    where: { id: project.id },
    data: {
      videoFingerprintSha256: fingerprint,
      fingerprintComputedAt: new Date(),
    },
  });
  return fingerprint;
}

export function createBenchmarkLabelDocument(input: {
  fingerprint: string;
  durationSeconds: number;
  width: number;
  height: number;
  labels: GroundTruthLabelDto[];
  createdAt?: Date;
}): BenchmarkLabelDocument {
  return {
    schemaVersion: LABEL_SCHEMA_VERSION,
    timestampUnits: LABEL_TIMESTAMP_UNITS,
    video: {
      fingerprint: { algorithm: "sha256", value: input.fingerprint },
      durationSeconds: input.durationSeconds,
      resolution: { width: input.width, height: input.height },
    },
    creationMetadata: {
      application: "R6 Creator AI",
      applicationVersion: "phase3b1",
      createdAt: (input.createdAt ?? new Date()).toISOString(),
      labelCount: input.labels.length,
    },
    labels: input.labels.map((label) => ({
      labelId: label.id,
      category: label.category,
      startSeconds: label.startSeconds,
      peakSeconds: label.peakSeconds,
      endSeconds: label.endSeconds,
      description: label.description,
      humanConfidence: label.humanConfidence,
      approved: label.approved,
      createdAt: label.createdAt,
      updatedAt: label.updatedAt,
    })),
  };
}

export async function exportGroundTruthLabels(projectId: string) {
  const project = await requireProject(projectId);
  const [fingerprint, labels] = await Promise.all([
    getProjectVideoFingerprint(projectId),
    db.groundTruthLabel.findMany({
      where: { projectId },
      orderBy: [{ startSeconds: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return createBenchmarkLabelDocument({
    fingerprint,
    durationSeconds: project.durationSeconds,
    width: project.width,
    height: project.height,
    labels: labels.map(serializeGroundTruthLabel),
  });
}

export async function importGroundTruthLabels(
  projectId: string,
  value: unknown,
) {
  const project = await requireProject(projectId);
  const document = benchmarkLabelDocumentSchema.parse(value);
  if (document.creationMetadata.labelCount !== document.labels.length) {
    throw new AppError(
      "The benchmark file's label count does not match its contents.",
      400,
      "INVALID_LABEL_DOCUMENT",
    );
  }
  const fingerprint = await getProjectVideoFingerprint(projectId);
  if (document.video.fingerprint.value !== fingerprint) {
    throw new AppError(
      "This benchmark file belongs to a different video.",
      409,
      "VIDEO_FINGERPRINT_MISMATCH",
    );
  }
  if (
    Math.abs(document.video.durationSeconds - project.durationSeconds) > 0.05 ||
    document.video.resolution.width !== project.width ||
    document.video.resolution.height !== project.height
  ) {
    throw new AppError(
      "This benchmark file's duration or resolution does not match the project.",
      409,
      "VIDEO_METADATA_MISMATCH",
    );
  }
  for (const label of document.labels) {
    assertLabelWithinVideo(label, project.durationSeconds);
  }
  await db.$transaction([
    db.groundTruthLabel.deleteMany({ where: { projectId } }),
    db.groundTruthLabel.createMany({
      data: document.labels.map((label) => ({
        projectId,
        category: label.category,
        startSeconds: label.startSeconds,
        peakSeconds: label.peakSeconds,
        endSeconds: label.endSeconds,
        description: label.description || null,
        humanConfidence: label.humanConfidence,
        approved: label.approved,
      })),
    }),
  ]);
  return getGroundTruthState(projectId);
}
