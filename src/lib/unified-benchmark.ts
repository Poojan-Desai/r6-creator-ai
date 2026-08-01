import type {
  UnifiedReviewArea,
  UnifiedReviewCategory,
  UnifiedReviewLabel,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const UNIFIED_REVIEW_LABEL_VERSION = "unified-review-labels/v1";
export const UNIFIED_REVIEW_EXPORT_VERSION =
  "r6-creator-unified-review-export/v1";
export const UNIFIED_REVIEW_MINIMUM_SAMPLE = 5;

export const CONTENT_REVIEW_CATEGORIES = [
  ["USEFUL_CLIP", "Useful clip"],
  ["UNINTERESTING_CLIP", "Uninteresting clip"],
  ["GOOD_HOOK", "Good hook"],
  ["BAD_HOOK", "Bad hook"],
  ["CORRECT_BOUNDARY", "Correct boundary"],
  ["INCORRECT_BOUNDARY", "Incorrect boundary"],
  ["GOOD_SCRIPT", "Good script"],
  ["INCORRECT_FACT", "Incorrect fact"],
  ["GOOD_PACING", "Good pacing"],
  ["BAD_PACING", "Bad pacing"],
] as const satisfies ReadonlyArray<readonly [UnifiedReviewCategory, string]>;

export const COACHING_REVIEW_CATEGORIES = [
  ["CORRECT_REPEEK_FINDING", "Correct re-peek finding"],
  ["INCORRECT_REPEEK_FINDING", "Incorrect re-peek finding"],
  ["CORRECT_CROSSHAIR_FINDING", "Correct crosshair finding"],
  ["INCORRECT_CROSSHAIR_FINDING", "Incorrect crosshair finding"],
  ["CORRECT_POSITIONING_FINDING", "Correct positioning finding"],
  ["INCORRECT_POSITIONING_FINDING", "Incorrect positioning finding"],
  ["CORRECT_TRADE_FINDING", "Correct trade finding"],
  ["INCORRECT_TRADE_FINDING", "Incorrect trade finding"],
  ["CORRECT_TIMING", "Correct timing"],
  ["INCORRECT_TIMING", "Incorrect timing"],
  ["USEFUL_RECOMMENDATION", "Useful recommendation"],
  ["UNHELPFUL_RECOMMENDATION", "Unhelpful recommendation"],
] as const satisfies ReadonlyArray<readonly [UnifiedReviewCategory, string]>;

const contentCategoryValues = CONTENT_REVIEW_CATEGORIES.map(
  ([value]) => value,
) as [UnifiedReviewCategory, ...UnifiedReviewCategory[]];
const coachingCategoryValues = COACHING_REVIEW_CATEGORIES.map(
  ([value]) => value,
) as [UnifiedReviewCategory, ...UnifiedReviewCategory[]];

const contentCategorySet = new Set<UnifiedReviewCategory>(
  contentCategoryValues,
);
const coachingCategorySet = new Set<UnifiedReviewCategory>(
  coachingCategoryValues,
);

export const createUnifiedReviewLabelSchema = z
  .object({
    studioProjectId: z.string().trim().min(1).max(191),
    area: z.enum(["CONTENT", "COACHING"]),
    category: z.enum([...contentCategoryValues, ...coachingCategoryValues] as [
      UnifiedReviewCategory,
      UnifiedReviewCategory,
      ...UnifiedReviewCategory[],
    ]),
    startSeconds: z.number().finite().min(0).nullable().optional(),
    endSeconds: z.number().finite().positive().nullable().optional(),
    reviewerConfidence: z.number().finite().min(0).max(1).default(1),
    approvedAsBenchmark: z.boolean().default(false),
    note: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const allowed =
      value.area === "CONTENT" ? contentCategorySet : coachingCategorySet;
    if (!allowed.has(value.category)) {
      context.addIssue({
        code: "custom",
        path: ["category"],
        message: `Choose a ${value.area.toLowerCase()} review label.`,
      });
    }
    const hasStart = value.startSeconds !== null && value.startSeconds != null;
    const hasEnd = value.endSeconds !== null && value.endSeconds != null;
    if (hasStart !== hasEnd) {
      context.addIssue({
        code: "custom",
        path: ["startSeconds"],
        message: "Provide both a start and end time, or leave both blank.",
      });
    } else if (
      hasStart &&
      hasEnd &&
      Number(value.startSeconds) >= Number(value.endSeconds)
    ) {
      context.addIssue({
        code: "custom",
        path: ["endSeconds"],
        message: "The review end time must be after its start time.",
      });
    }
  });

export const updateUnifiedReviewLabelSchema = z
  .object({
    reviewerConfidence: z.number().finite().min(0).max(1).optional(),
    approvedAsBenchmark: z.boolean().optional(),
    note: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Choose at least one review-label change.",
  });

export type UnifiedReviewMetric = {
  key: string;
  label: string;
  numerator: number;
  denominator: number;
  value: number | null;
  unit: "rate";
  availability: "AVAILABLE" | "INSUFFICIENT_SAMPLE" | "UNAVAILABLE";
  explanation: string;
};

function categoryCount(
  categories: Iterable<UnifiedReviewCategory>,
  wanted: ReadonlySet<UnifiedReviewCategory>,
) {
  let count = 0;
  for (const category of categories) {
    if (wanted.has(category)) count += 1;
  }
  return count;
}

function rateMetric(options: {
  key: string;
  label: string;
  numerator: number;
  denominator: number;
  explanation: string;
}): UnifiedReviewMetric {
  return {
    ...options,
    value:
      options.denominator > 0 ? options.numerator / options.denominator : null,
    unit: "rate",
    availability:
      options.denominator === 0
        ? "UNAVAILABLE"
        : options.denominator < UNIFIED_REVIEW_MINIMUM_SAMPLE
          ? "INSUFFICIENT_SAMPLE"
          : "AVAILABLE",
  };
}

export function calculateUnifiedReviewMetrics(
  labels: Array<{
    category: UnifiedReviewCategory;
    approvedAsBenchmark: boolean;
  }>,
) {
  const approved = labels
    .filter((label) => label.approvedAsBenchmark)
    .map((label) => label.category);
  const usefulClips = categoryCount(
    approved,
    new Set(["USEFUL_CLIP"] satisfies UnifiedReviewCategory[]),
  );
  const uninterestingClips = categoryCount(
    approved,
    new Set(["UNINTERESTING_CLIP"] satisfies UnifiedReviewCategory[]),
  );
  const incorrectFacts = categoryCount(
    approved,
    new Set(["INCORRECT_FACT"] satisfies UnifiedReviewCategory[]),
  );
  const reviewedScripts = categoryCount(
    approved,
    new Set([
      "GOOD_SCRIPT",
      "INCORRECT_FACT",
    ] satisfies UnifiedReviewCategory[]),
  );
  const correctCoaching = categoryCount(
    approved,
    new Set([
      "CORRECT_REPEEK_FINDING",
      "CORRECT_CROSSHAIR_FINDING",
      "CORRECT_POSITIONING_FINDING",
      "CORRECT_TRADE_FINDING",
      "CORRECT_TIMING",
    ] satisfies UnifiedReviewCategory[]),
  );
  const incorrectCoaching = categoryCount(
    approved,
    new Set([
      "INCORRECT_REPEEK_FINDING",
      "INCORRECT_CROSSHAIR_FINDING",
      "INCORRECT_POSITIONING_FINDING",
      "INCORRECT_TRADE_FINDING",
      "INCORRECT_TIMING",
    ] satisfies UnifiedReviewCategory[]),
  );
  const usefulRecommendations = categoryCount(
    approved,
    new Set(["USEFUL_RECOMMENDATION"] satisfies UnifiedReviewCategory[]),
  );
  const unhelpfulRecommendations = categoryCount(
    approved,
    new Set(["UNHELPFUL_RECOMMENDATION"] satisfies UnifiedReviewCategory[]),
  );

  return [
    rateMetric({
      key: "clip_acceptance_rate",
      label: "Clip acceptance rate",
      numerator: usefulClips,
      denominator: usefulClips + uninterestingClips,
      explanation:
        "Approved useful-clip labels divided by approved useful plus uninteresting clip labels. It does not predict views.",
    }),
    rateMetric({
      key: "script_fact_error_rate",
      label: "Script fact-error rate",
      numerator: incorrectFacts,
      denominator: reviewedScripts,
      explanation:
        "Approved incorrect-fact labels divided by approved good-script plus incorrect-fact review labels.",
    }),
    rateMetric({
      key: "coaching_finding_correctness_rate",
      label: "Coaching finding correctness rate",
      numerator: correctCoaching,
      denominator: correctCoaching + incorrectCoaching,
      explanation:
        "Approved correct finding labels divided by all approved correct and incorrect finding labels. Recall is unavailable without exhaustive finding ground truth.",
    }),
    rateMetric({
      key: "recommendation_usefulness_rate",
      label: "Recommendation usefulness rate",
      numerator: usefulRecommendations,
      denominator: usefulRecommendations + unhelpfulRecommendations,
      explanation:
        "Approved useful recommendations divided by approved useful plus unhelpful recommendations.",
    }),
  ];
}

function serializeLabel(label: UnifiedReviewLabel) {
  return {
    id: label.id,
    studioProjectId: label.studioProjectId,
    area: label.area,
    category: label.category,
    targetKind: label.targetKind,
    targetId: label.targetId,
    startSeconds: label.startSeconds,
    endSeconds: label.endSeconds,
    reviewerConfidence: label.reviewerConfidence,
    approvedAsBenchmark: label.approvedAsBenchmark,
    note: label.note,
    labelVersion: label.labelVersion,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  };
}

export async function getUnifiedBenchmarkState() {
  const [projects, labels] = await Promise.all([
    db.studioProject.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        inputMode: true,
        outputGoal: true,
        updatedAt: true,
      },
    }),
    db.unifiedReviewLabel.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    }),
  ]);
  const serialized = labels.map(serializeLabel);
  return {
    labelVersion: UNIFIED_REVIEW_LABEL_VERSION,
    minimumSample: UNIFIED_REVIEW_MINIMUM_SAMPLE,
    projects: projects.map((project) => ({
      ...project,
      updatedAt: project.updatedAt.toISOString(),
    })),
    categories: {
      content: CONTENT_REVIEW_CATEGORIES.map(([value, label]) => ({
        value,
        label,
      })),
      coaching: COACHING_REVIEW_CATEGORIES.map(([value, label]) => ({
        value,
        label,
      })),
    },
    labels: serialized,
    metrics: calculateUnifiedReviewMetrics(serialized),
    limitations: [
      "Only labels explicitly approved as benchmark evidence enter the displayed rates.",
      "Fewer than five approved examples remains Insufficient sample.",
      "Recall is unavailable unless the complete eligible target set was exhaustively labeled.",
      "Content usefulness and pacing are human review decisions, not predictions of views or virality.",
    ],
  };
}

export async function createUnifiedReviewLabel(value: unknown) {
  const input = createUnifiedReviewLabelSchema.parse(value);
  const project = await db.studioProject.findUnique({
    where: { id: input.studioProjectId },
    select: { id: true },
  });
  if (!project) {
    throw new AppError(
      "That Creator Studio project no longer exists.",
      404,
      "STUDIO_PROJECT_NOT_FOUND",
    );
  }
  await db.unifiedReviewLabel.create({
    data: {
      studioProjectId: input.studioProjectId,
      area: input.area,
      category: input.category,
      targetKind: "PROJECT",
      startSeconds: input.startSeconds ?? null,
      endSeconds: input.endSeconds ?? null,
      reviewerConfidence: input.reviewerConfidence,
      approvedAsBenchmark: input.approvedAsBenchmark,
      note: input.note || null,
      labelVersion: UNIFIED_REVIEW_LABEL_VERSION,
    },
  });
  return getUnifiedBenchmarkState();
}

export async function updateUnifiedReviewLabel(
  labelId: string,
  value: unknown,
) {
  const input = updateUnifiedReviewLabelSchema.parse(value);
  const existing = await db.unifiedReviewLabel.findUnique({
    where: { id: labelId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError(
      "That review label no longer exists.",
      404,
      "REVIEW_LABEL_NOT_FOUND",
    );
  }
  await db.unifiedReviewLabel.update({
    where: { id: labelId },
    data: input,
  });
  return getUnifiedBenchmarkState();
}

export async function deleteUnifiedReviewLabel(labelId: string) {
  const deleted = await db.unifiedReviewLabel.deleteMany({
    where: { id: labelId },
  });
  if (deleted.count === 0) {
    throw new AppError(
      "That review label no longer exists.",
      404,
      "REVIEW_LABEL_NOT_FOUND",
    );
  }
  return getUnifiedBenchmarkState();
}

export async function exportUnifiedReviewLabels() {
  const state = await getUnifiedBenchmarkState();
  return {
    schemaVersion: UNIFIED_REVIEW_EXPORT_VERSION,
    timestampUnits: "seconds",
    createdAt: new Date().toISOString(),
    labelVersion: state.labelVersion,
    labels: state.labels.map((label) => ({
      projectId: label.studioProjectId,
      area: label.area,
      category: label.category,
      targetKind: label.targetKind,
      startSeconds: label.startSeconds,
      endSeconds: label.endSeconds,
      reviewerConfidence: label.reviewerConfidence,
      approvedAsBenchmark: label.approvedAsBenchmark,
      note: label.note,
      labelVersion: label.labelVersion,
      createdAt: label.createdAt,
      updatedAt: label.updatedAt,
    })),
    metrics: state.metrics,
    limitations: state.limitations,
  };
}

export type UnifiedBenchmarkState = Awaited<
  ReturnType<typeof getUnifiedBenchmarkState>
>;
export type UnifiedReviewAreaValue = UnifiedReviewArea;
