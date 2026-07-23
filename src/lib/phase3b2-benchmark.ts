import { createHash } from "node:crypto";

import type { GroundTruthCategory } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  getProjectVideoFingerprint,
  LABEL_SCHEMA_VERSION,
} from "@/lib/ground-truth";

export const PHASE3B2_MATCHING_RULE_VERSION = "phase3b2-broad-signal-v1";
export const MINIMUM_BENCHMARK_EXAMPLES = 5;
export const MINIMUM_INTERSECTION_OVER_UNION = 0.3;
export const MAXIMUM_PEAK_ERROR_SECONDS = 2;

export const PHASE3B2_BENCHMARK_CATEGORIES = [
  "HIGH_ACTION_GAMEPLAY",
  "QUIET_OR_LOW_INTEREST",
  "LOUD_CREATOR_REACTION",
  "MENU",
  "LOADING_SCREEN",
] as const satisfies readonly GroundTruthCategory[];

export type Phase3b2BenchmarkCategory =
  (typeof PHASE3B2_BENCHMARK_CATEGORIES)[number];

export const PHASE3B2_CATEGORY_LABELS: Record<
  Phase3b2BenchmarkCategory,
  string
> = {
  HIGH_ACTION_GAMEPLAY: "High-action gameplay",
  QUIET_OR_LOW_INTEREST: "Quiet or low-interest section",
  LOUD_CREATOR_REACTION: "Loud creator reaction",
  MENU: "Menu transition boundary",
  LOADING_SCREEN: "Loading transition boundary",
};

const categorySchema = z.enum(PHASE3B2_BENCHMARK_CATEGORIES);
const reviewScopeSchema = z
  .object({
    fullyReviewedCategories: z.array(categorySchema).max(5),
    humanReviewMinutes: z.number().finite().min(0).max(100_000).nullable(),
  })
  .strict();

export type BenchmarkSpan = {
  id: string;
  category: Phase3b2BenchmarkCategory;
  startSeconds: number;
  peakSeconds: number;
  endSeconds: number;
};

export type BenchmarkMatch = {
  labelId: string;
  eventId: string;
  intersectionOverUnion: number;
  peakErrorSeconds: number;
  startErrorSeconds: number;
  endErrorSeconds: number;
};

export type CalculatedBenchmarkMetric = {
  category: Phase3b2BenchmarkCategory;
  sampleCount: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  medianPeakError: number | null;
  medianStartError: number | null;
  medianEndError: number | null;
  insufficientExamples: boolean;
  falsePositiveScopeComplete: boolean;
  unmatchedCandidateCount: number;
  matches: BenchmarkMatch[];
};

function overlapSeconds(left: BenchmarkSpan, right: BenchmarkSpan) {
  return Math.max(
    0,
    Math.min(left.endSeconds, right.endSeconds) -
      Math.max(left.startSeconds, right.startSeconds),
  );
}

export function intersectionOverUnion(
  left: BenchmarkSpan,
  right: BenchmarkSpan,
) {
  const intersection = overlapSeconds(left, right);
  const union =
    Math.max(left.endSeconds, right.endSeconds) -
    Math.min(left.startSeconds, right.startSeconds);
  return union > 0 ? intersection / union : 0;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function matchBenchmarkSpans(
  labels: BenchmarkSpan[],
  events: BenchmarkSpan[],
): BenchmarkMatch[] {
  const pairs = labels.flatMap((label) =>
    events.flatMap((event) => {
      const overlap = overlapSeconds(label, event);
      const iou = intersectionOverUnion(label, event);
      const peakError = Math.abs(label.peakSeconds - event.peakSeconds);
      if (
        iou < MINIMUM_INTERSECTION_OVER_UNION &&
        !(overlap > 0 && peakError <= MAXIMUM_PEAK_ERROR_SECONDS)
      ) {
        return [];
      }
      return [
        {
          labelId: label.id,
          eventId: event.id,
          intersectionOverUnion: iou,
          peakErrorSeconds: peakError,
          startErrorSeconds: Math.abs(label.startSeconds - event.startSeconds),
          endErrorSeconds: Math.abs(label.endSeconds - event.endSeconds),
        },
      ];
    }),
  );
  pairs.sort(
    (left, right) =>
      right.intersectionOverUnion - left.intersectionOverUnion ||
      left.peakErrorSeconds - right.peakErrorSeconds ||
      left.labelId.localeCompare(right.labelId) ||
      left.eventId.localeCompare(right.eventId),
  );
  const matchedLabels = new Set<string>();
  const matchedEvents = new Set<string>();
  return pairs.filter((pair) => {
    if (matchedLabels.has(pair.labelId) || matchedEvents.has(pair.eventId)) {
      return false;
    }
    matchedLabels.add(pair.labelId);
    matchedEvents.add(pair.eventId);
    return true;
  });
}

export function calculateBenchmarkMetric(input: {
  category: Phase3b2BenchmarkCategory;
  labels: BenchmarkSpan[];
  events: BenchmarkSpan[];
  falsePositiveScopeComplete: boolean;
}): CalculatedBenchmarkMetric {
  const matches = matchBenchmarkSpans(input.labels, input.events);
  const truePositives = matches.length;
  const falseNegatives = input.labels.length - truePositives;
  const unmatchedCandidateCount = input.events.length - truePositives;
  const falsePositives = input.falsePositiveScopeComplete
    ? unmatchedCandidateCount
    : 0;
  const recall =
    input.labels.length > 0 ? truePositives / input.labels.length : null;
  const precision = input.falsePositiveScopeComplete
    ? truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : null
    : null;
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
  return {
    category: input.category,
    sampleCount: input.labels.length,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1,
    medianPeakError: median(matches.map((match) => match.peakErrorSeconds)),
    medianStartError: median(matches.map((match) => match.startErrorSeconds)),
    medianEndError: median(matches.map((match) => match.endErrorSeconds)),
    insufficientExamples: input.labels.length < MINIMUM_BENCHMARK_EXAMPLES,
    falsePositiveScopeComplete: input.falsePositiveScopeComplete,
    unmatchedCandidateCount,
    matches,
  };
}

function parseReviewedCategories(value: string) {
  try {
    const parsed = z.array(categorySchema).safeParse(JSON.parse(value));
    return parsed.success ? [...new Set(parsed.data)] : [];
  } catch {
    return [];
  }
}

function eventCategories(event: {
  eventType: string;
  category: GroundTruthCategory | null;
}): Phase3b2BenchmarkCategory[] {
  if (
    event.category &&
    PHASE3B2_BENCHMARK_CATEGORIES.includes(
      event.category as Phase3b2BenchmarkCategory,
    )
  ) {
    return [event.category as Phase3b2BenchmarkCategory];
  }
  if (event.eventType === "SUSTAINED_HIGH_ACTION") {
    return ["HIGH_ACTION_GAMEPLAY"];
  }
  if (event.eventType === "SUSTAINED_LOW_ACTION") {
    return ["QUIET_OR_LOW_INTEREST"];
  }
  if (
    event.eventType === "POSSIBLE_GAMEPLAY_TO_MENU_TRANSITION" ||
    event.eventType === "POSSIBLE_GAMEPLAY_INTERRUPTION" ||
    event.eventType === "POSSIBLE_EDITED_BOUNDARY" ||
    event.eventType === "MAJOR_VISUAL_TRANSITION" ||
    event.eventType === "PROBABLE_BLACK_TRANSITION"
  ) {
    return ["MENU", "LOADING_SCREEN"];
  }
  return [];
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

async function getOrCreateDatasetProject(projectId: string) {
  const existing = await db.benchmarkDatasetProject.findFirst({
    where: { projectId, dataset: { split: "DEVELOPMENT" } },
    include: { dataset: true },
    orderBy: { addedAt: "desc" },
  });
  if (existing) return existing;
  const project = await requireProject(projectId);
  const fingerprint = await getProjectVideoFingerprint(projectId);
  const dataset = await db.benchmarkDataset.create({
    data: {
      name: `Phase 3B.2 development — ${project.name}`,
      description:
        "Local development benchmark. It is not a verified public accuracy claim.",
      split: "DEVELOPMENT",
      projects: {
        create: {
          projectId,
          videoFingerprint: fingerprint,
          durationSeconds: project.durationSeconds,
          width: project.width,
          height: project.height,
          labelSchemaVersion: LABEL_SCHEMA_VERSION,
        },
      },
    },
    include: { projects: true },
  });
  const link = dataset.projects[0];
  if (!link) throw new Error("Benchmark dataset link was not created.");
  return { ...link, dataset };
}

export async function updateBenchmarkReviewScope(
  projectId: string,
  rawInput: unknown,
) {
  const input = reviewScopeSchema.parse(rawInput);
  const link = await getOrCreateDatasetProject(projectId);
  await db.benchmarkDatasetProject.update({
    where: {
      datasetId_projectId: { datasetId: link.datasetId, projectId },
    },
    data: {
      fullyReviewedCategoriesJson: JSON.stringify([
        ...new Set(input.fullyReviewedCategories),
      ]),
      humanReviewMinutes: input.humanReviewMinutes,
    },
  });
  return getProjectBenchmarkState(projectId);
}

function serializeMetric(metric: {
  category: GroundTruthCategory | null;
  sampleCount: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  medianPeakError: number | null;
  medianStartError: number | null;
  medianEndError: number | null;
  insufficientExamples: boolean;
  extraMetricsJson: string;
}) {
  let extra: Record<string, unknown> = {};
  try {
    extra = JSON.parse(metric.extraMetricsJson) as Record<string, unknown>;
  } catch {}
  return { ...metric, extra };
}

export async function getProjectBenchmarkState(projectId: string) {
  await requireProject(projectId);
  const link = await db.benchmarkDatasetProject.findFirst({
    where: { projectId, dataset: { split: "DEVELOPMENT" } },
    include: {
      dataset: {
        include: {
          runs: {
            where: { status: "COMPLETED" },
            include: { metrics: { orderBy: { category: "asc" } } },
            orderBy: { completedAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { addedAt: "desc" },
  });
  const latestRun = link?.dataset.runs[0] ?? null;
  return {
    categories: PHASE3B2_BENCHMARK_CATEGORIES.map((value) => ({
      value,
      label: PHASE3B2_CATEGORY_LABELS[value],
    })),
    matchingRuleVersion: PHASE3B2_MATCHING_RULE_VERSION,
    minimumExamples: MINIMUM_BENCHMARK_EXAMPLES,
    reviewScope: {
      fullyReviewedCategories: link
        ? parseReviewedCategories(link.fullyReviewedCategoriesJson)
        : [],
      humanReviewMinutes: link?.humanReviewMinutes ?? null,
    },
    dataset: link
      ? {
          id: link.dataset.id,
          name: link.dataset.name,
          split: link.dataset.split,
          durationSeconds: link.durationSeconds,
          recordingType: link.recordingType,
        }
      : null,
    latestRun: latestRun
      ? {
          id: latestRun.id,
          status: latestRun.status,
          detectorSetVersion: latestRun.detectorSetVersion,
          completedAt: latestRun.completedAt?.toISOString() ?? null,
          report: latestRun.reportJson
            ? (JSON.parse(latestRun.reportJson) as Record<string, unknown>)
            : null,
          metrics: latestRun.metrics.map(serializeMetric),
        }
      : null,
  };
}

export type ProjectBenchmarkStateDto = Awaited<
  ReturnType<typeof getProjectBenchmarkState>
>;

export async function runProjectBenchmark(projectId: string) {
  const project = await requireProject(projectId);
  const link = await getOrCreateDatasetProject(projectId);
  const reviewed = new Set(
    parseReviewedCategories(link.fullyReviewedCategoriesJson),
  );
  const completedRuns = await db.detectorRun.findMany({
    where: { analysisJob: { projectId }, status: "COMPLETED" },
    include: { events: true, analysisJob: true },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });
  const latestByDetector = new Map<string, (typeof completedRuns)[number]>();
  for (const run of completedRuns) {
    if (!latestByDetector.has(run.detectorStableId)) {
      latestByDetector.set(run.detectorStableId, run);
    }
  }
  const selectedRuns = [...latestByDetector.values()];
  if (selectedRuns.length === 0) {
    throw new AppError(
      "Run at least one local detector before calculating a benchmark.",
      400,
      "BENCHMARK_NO_DETECTOR_RESULTS",
    );
  }
  const approvedLabels = await db.groundTruthLabel.findMany({
    where: {
      projectId,
      approved: true,
      category: { in: [...PHASE3B2_BENCHMARK_CATEGORIES] },
    },
  });
  const eventsByCategory = new Map<
    Phase3b2BenchmarkCategory,
    BenchmarkSpan[]
  >();
  for (const category of PHASE3B2_BENCHMARK_CATEGORIES) {
    eventsByCategory.set(category, []);
  }
  for (const run of selectedRuns) {
    for (const event of run.events) {
      for (const category of eventCategories(event)) {
        eventsByCategory.get(category)?.push({
          id: event.id,
          category,
          startSeconds: event.startSeconds,
          peakSeconds: event.peakSeconds,
          endSeconds: event.endSeconds,
        });
      }
    }
  }
  const metrics = PHASE3B2_BENCHMARK_CATEGORIES.map((category) =>
    calculateBenchmarkMetric({
      category,
      labels: approvedLabels
        .filter((label) => label.category === category)
        .map((label) => ({
          id: label.id,
          category,
          startSeconds: label.startSeconds,
          peakSeconds: label.peakSeconds,
          endSeconds: label.endSeconds,
        })),
      events: eventsByCategory.get(category) ?? [],
      falsePositiveScopeComplete: reviewed.has(category),
    }),
  );
  const detectorManifest = selectedRuns
    .map((run) => ({
      stableId: run.detectorStableId,
      version: run.detectorVersion,
      parameters: run.parametersJson,
      runId: run.id,
    }))
    .sort((left, right) => left.stableId.localeCompare(right.stableId));
  const detectorSetVersion = createHash("sha256")
    .update(JSON.stringify(detectorManifest))
    .digest("hex")
    .slice(0, 16);
  const jobIds = new Set(selectedRuns.map((run) => run.analysisJobId));
  const processingDurationMs = selectedRuns.reduce(
    (total, run) => total + (run.processingDurationMs ?? 0),
    0,
  );
  const report = {
    schemaVersion: "r6-creator-phase3b2-benchmark/v1",
    classification: "DEVELOPMENT_ESTIMATE",
    projectId,
    videoDurationSeconds: project.durationSeconds,
    matching: {
      version: PHASE3B2_MATCHING_RULE_VERSION,
      minimumIntersectionOverUnion: MINIMUM_INTERSECTION_OVER_UNION,
      maximumPeakErrorSeconds: MAXIMUM_PEAK_ERROR_SECONDS,
      oneToOne: true,
    },
    detectorManifest,
    processing: {
      processingDurationMs,
      processingSecondsPerVideoHour:
        project.durationSeconds > 0
          ? (processingDurationMs / 1000 / project.durationSeconds) * 3600
          : null,
      temporaryDiskUsageBytes: selectedRuns.reduce(
        (total, run) => total + Number(run.temporaryDiskUsageBytes),
        0,
      ),
      peakMemoryBytes:
        selectedRuns.reduce(
          (maximum, run) => Math.max(maximum, Number(run.peakMemoryBytes ?? 0)),
          0,
        ) || null,
      humanReviewMinutes: link.humanReviewMinutes,
    },
    limitations: [
      "These are broad local signal detectors, not R6 gameplay-event recognition.",
      "Precision is not measured for a category until full-recording false-positive review is explicitly confirmed.",
      `Fewer than ${MINIMUM_BENCHMARK_EXAMPLES} approved positive labels is insufficient for a quality claim.`,
    ],
  };
  const run = await db.benchmarkRun.create({
    data: {
      datasetId: link.datasetId,
      analysisJobId: jobIds.size === 1 ? [...jobIds][0] : null,
      status: "COMPLETED",
      matchingRuleVersion: PHASE3B2_MATCHING_RULE_VERSION,
      detectorSetVersion,
      reportJson: JSON.stringify(report),
      startedAt: new Date(),
      completedAt: new Date(),
      metrics: {
        create: metrics.map((metric) => ({
          category: metric.category,
          sampleCount: metric.sampleCount,
          truePositives: metric.truePositives,
          falsePositives: metric.falsePositives,
          falseNegatives: metric.falseNegatives,
          precision: metric.precision,
          recall: metric.recall,
          f1: metric.f1,
          medianPeakError: metric.medianPeakError,
          medianStartError: metric.medianStartError,
          medianEndError: metric.medianEndError,
          insufficientExamples: metric.insufficientExamples,
          extraMetricsJson: JSON.stringify({
            falsePositiveScopeComplete: metric.falsePositiveScopeComplete,
            unmatchedCandidateCount: metric.unmatchedCandidateCount,
            falsePositivesNotCounted: metric.falsePositiveScopeComplete
              ? 0
              : metric.unmatchedCandidateCount,
            matches: metric.matches,
          }),
        })),
      },
    },
  });
  return {
    runId: run.id,
    benchmark: await getProjectBenchmarkState(projectId),
  };
}

export async function getBenchmarkExport(
  runId: string,
  format: "json" | "markdown",
) {
  const run = await db.benchmarkRun.findUnique({
    where: { id: runId },
    include: {
      dataset: { include: { projects: { include: { project: true } } } },
      metrics: { orderBy: { category: "asc" } },
    },
  });
  if (!run) {
    throw new AppError(
      "That benchmark run no longer exists.",
      404,
      "BENCHMARK_NOT_FOUND",
    );
  }
  const document = {
    schemaVersion: "r6-creator-phase3b2-benchmark/v1",
    classification: run.dataset.split,
    dataset: { id: run.dataset.id, name: run.dataset.name },
    run: {
      id: run.id,
      matchingRuleVersion: run.matchingRuleVersion,
      detectorSetVersion: run.detectorSetVersion,
      completedAt: run.completedAt?.toISOString() ?? null,
    },
    videos: run.dataset.projects.map((link) => ({
      projectId: link.projectId,
      projectName: link.project.name,
      durationSeconds: link.durationSeconds,
      width: link.width,
      height: link.height,
      // Deliberately excludes filenames and absolute paths.
    })),
    report: run.reportJson ? JSON.parse(run.reportJson) : null,
    metrics: run.metrics.map(serializeMetric),
  };
  if (format === "json") return JSON.stringify(document, null, 2);
  const lines = [
    "# R6 Creator AI Phase 3B.2 Benchmark Report",
    "",
    `Classification: **${run.dataset.split === "VERIFICATION" ? "Verified benchmark result" : "Development estimate"}**`,
    "",
    `Matching rule: \`${run.matchingRuleVersion}\``,
    "",
    "| Category | Examples | TP | FP | FN | Precision | Recall | F1 | Status |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...run.metrics.map((metric) => {
      const extra = serializeMetric(metric).extra;
      const scopeComplete = extra.falsePositiveScopeComplete === true;
      const number = (value: number | null) =>
        value === null ? "Not measured" : value.toFixed(3);
      return `| ${metric.category ?? "Overall"} | ${metric.sampleCount} | ${metric.truePositives} | ${scopeComplete ? metric.falsePositives : "Not measured"} | ${metric.falseNegatives} | ${number(metric.precision)} | ${number(metric.recall)} | ${number(metric.f1)} | ${metric.insufficientExamples ? "Insufficient benchmark examples" : "Measured"} |`;
    }),
    "",
    "Precision remains unmeasured unless the full recording was reviewed for false positives in that category. Broad signals do not confirm R6 events.",
  ];
  return lines.join("\n");
}

export async function listBenchmarkDashboard() {
  const datasets = await db.benchmarkDataset.findMany({
    include: {
      projects: { include: { project: true } },
      runs: {
        where: { status: "COMPLETED" },
        include: { metrics: true },
        orderBy: { completedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return datasets.map((dataset) => ({
    id: dataset.id,
    name: dataset.name,
    split: dataset.split,
    projectCount: dataset.projects.length,
    totalDurationSeconds: dataset.projects.reduce(
      (sum, link) => sum + link.durationSeconds,
      0,
    ),
    projects: dataset.projects.map((link) => ({
      id: link.projectId,
      name: link.project.name,
    })),
    latestRun: dataset.runs[0]
      ? {
          id: dataset.runs[0].id,
          completedAt: dataset.runs[0].completedAt?.toISOString() ?? null,
          insufficientCategoryCount: dataset.runs[0].metrics.filter(
            (metric) => metric.insufficientExamples,
          ).length,
        }
      : null,
  }));
}
