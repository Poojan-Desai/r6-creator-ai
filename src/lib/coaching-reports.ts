import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  CoachingFindingCategory,
  CoachingReportFormat,
} from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";

import { createProjectClip } from "@/lib/clips";
import { getCoachingState, type CoachingState } from "@/lib/coaching";
import { coachingReportDirectory, toDataRelativePath } from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const COACHING_REPORT_VERSION = "u6-coaching-report-v1";
export const COACHING_REPORT_SCHEMA_VERSION = "r6-creator-coaching-report/v1";

export const createPracticeDrillSchema = z
  .object({
    findingId: z.string().trim().min(1).max(191),
    name: z.string().trim().min(1).max(120).optional(),
    observation: z.string().trim().min(1).max(2_000).optional(),
    instructions: z.string().trim().min(1).max(4_000).optional(),
    measurableGoal: z.string().trim().min(1).max(1_000).optional(),
    nextFiveMatchGoal: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

export const updatePracticeDrillSchema = z
  .object({
    completed: z.boolean().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    observation: z.string().trim().min(1).max(2_000).optional(),
    instructions: z.string().trim().min(1).max(4_000).optional(),
    measurableGoal: z.string().trim().min(1).max(1_000).optional(),
    nextFiveMatchGoal: z
      .string()
      .trim()
      .min(1)
      .max(1_000)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Choose at least one practice-drill change.",
  });

export const createCoachingReportSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, "Explain why you are creating this report.")
      .max(500),
  })
  .strict();

export const createCoachingReportExportSchema = z
  .object({
    format: z.enum(["JSON", "MARKDOWN", "PDF"]),
  })
  .strict();

export const createReviewClipSchema = z
  .object({
    contextBeforeSeconds: z.number().min(0).max(30).default(6),
    contextAfterSeconds: z.number().min(0.5).max(45).default(8),
  })
  .strict();

type ReportFinding = CoachingState["findings"][number];

export type CoachingReportDocument = {
  schemaVersion: typeof COACHING_REPORT_SCHEMA_VERSION;
  reportVersion: typeof COACHING_REPORT_VERSION;
  generatedAt: string;
  project: {
    id: string;
    name: string;
    inputMode: string;
    selectedPlayerAlias: string | null;
    coachingGoals: string | null;
  };
  disclaimer: string;
  evidenceBoundary: string[];
  matchSummary: {
    map: string | null;
    mode: string | null;
    provider: string | null;
    validationStatus: string | null;
    roundCount: number;
    selectedPlayerKills: number;
    selectedPlayerLikelyDeaths: number;
  };
  roundSummary: Array<{
    roundNumber: number;
    supportedEvents: string[];
  }>;
  attackDefenseBreakdown: string[];
  openingEngagements: string[];
  objectiveInvolvement: string[];
  strongDecisions: Array<ReturnType<typeof findingSummary>>;
  topReviewPriorities: Array<ReturnType<typeof findingSummary>>;
  trends: {
    crosshairPlacement: Array<ReturnType<typeof findingSummary>>;
    rePeeks: Array<ReturnType<typeof findingSummary>>;
    possiblePositioning: Array<ReturnType<typeof findingSummary>>;
    possibleTrades: Array<ReturnType<typeof findingSummary>>;
    timing: Array<ReturnType<typeof findingSummary>>;
    operators: string[];
  };
  reviewClips: Array<{
    findingId: string;
    clipId: string;
    name: string;
    startSeconds: number;
    endSeconds: number;
  }>;
  practiceDrills: CoachingState["drills"];
  nextFiveMatchGoals: string[];
  sourceVersions: string[];
};

const strengthCategories = new Set<CoachingFindingCategory>([
  "STRONG_DECISION",
  "STRONG_PATIENCE",
  "GOOD_TRADE",
  "GOOD_POSITIONING",
  "GOOD_CROSSHAIR_DISCIPLINE",
  "OBJECTIVE_INVOLVEMENT",
]);

function findingSummary(finding: ReportFinding) {
  return {
    id: finding.id,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    decision: finding.decision,
    videoTimestampSeconds: finding.videoTimestampSeconds,
    replayTimestampSeconds: finding.replayTimestampSeconds,
    explanation: finding.explanation,
    directObservations: finding.directObservations,
    replayFacts: finding.replayFacts,
    transcriptEvidence: finding.transcriptEvidence,
    conflictingEvidence: finding.conflictingEvidence,
    missingContext: finding.missingContext,
    alternatives: finding.alternativeExplanations,
    detectorVersions: finding.detectorVersions,
  };
}

function priorityWeight(finding: ReportFinding) {
  const severity = { HIGH: 4, MEDIUM: 3, LOW: 2, INFORMATIONAL: 1 };
  const decision =
    finding.decision === "ACCEPTED" || finding.decision === "GOOD_OBSERVATION"
      ? 2
      : finding.decision === "NOT_ENOUGH_CONTEXT"
        ? -1
        : 0;
  return severity[finding.severity] * 10 + decision + finding.confidence;
}

function trend(
  findings: ReportFinding[],
  categories: CoachingFindingCategory[],
) {
  return findings
    .filter((finding) => categories.includes(finding.category))
    .map(findingSummary);
}

export function buildCoachingReportDocument(
  state: CoachingState,
  generatedAt = new Date().toISOString(),
): CoachingReportDocument {
  const selectedAlias = state.project.selectedPlayerAlias ?? "User";
  const includedFindings = state.findings.filter(
    (finding) =>
      finding.decision !== "REJECTED" && finding.decision !== "WRONG_CATEGORY",
  );
  const reviewFindings = includedFindings.filter(
    (finding) => !strengthCategories.has(finding.category),
  );
  const replayEvents = state.replayEvents;
  const roundNumbers = [
    ...new Set(
      replayEvents
        .map((event) =>
          event.roundIndex == null ? null : event.roundIndex + 1,
        )
        .filter((round): round is number => round != null),
    ),
  ].sort((first, second) => first - second);
  const selectedPlayerKills = replayEvents.filter(
    (event) =>
      event.category === "KILL" &&
      event.summary.includes(`from ${selectedAlias} to `),
  ).length;
  const selectedPlayerLikelyDeaths = replayEvents.filter(
    (event) =>
      event.category === "KILL" &&
      event.summary.includes(` to ${selectedAlias}`),
  ).length;
  const openingEngagements = roundNumbers
    .map((roundNumber) =>
      replayEvents.find(
        (event) =>
          event.roundIndex === roundNumber - 1 && event.category === "KILL",
      ),
    )
    .filter((event): event is (typeof replayEvents)[number] => Boolean(event))
    .map((event) => event.summary);
  const objectiveInvolvement = replayEvents
    .filter((event) =>
      ["DEFUSER_PLANT", "DEFUSER_DISABLE", "OBJECTIVE_LOCATE"].includes(
        event.category,
      ),
    )
    .map((event) => event.summary);

  return {
    schemaVersion: COACHING_REPORT_SCHEMA_VERSION,
    reportVersion: COACHING_REPORT_VERSION,
    generatedAt,
    project: {
      id: state.project.id,
      name: state.project.name,
      inputMode: state.project.inputMode,
      selectedPlayerAlias: state.project.selectedPlayerAlias,
      coachingGoals: state.project.coachingGoals,
    },
    disclaimer:
      "AI-assisted replay and POV review. This report does not replace a professional coach and does not guarantee performance outcomes.",
    evidenceBoundary: [
      "Direct observations require the owned screen recording or an explicit human review.",
      "Replay-confirmed facts are limited to validated canonical provider output.",
      "Transcript statements are supporting evidence, not proof of a gameplay event.",
      "Position, orientation, line of sight, health, weapon, shots, damage, and intention remain unknown unless a finding explicitly supplies reliable evidence.",
      "Rejected and wrong-category findings are preserved in history but excluded from report priorities.",
    ],
    matchSummary: {
      map: state.project.replay?.mapName ?? null,
      mode: state.project.replay?.gameMode ?? null,
      provider: state.project.replay
        ? `${state.project.replay.providerId}@${state.project.replay.providerVersion}`
        : null,
      validationStatus: state.project.replay?.validationStatus ?? null,
      roundCount: roundNumbers.length,
      selectedPlayerKills,
      selectedPlayerLikelyDeaths,
    },
    roundSummary: roundNumbers.map((roundNumber) => ({
      roundNumber,
      supportedEvents: replayEvents
        .filter((event) => event.roundIndex === roundNumber - 1)
        .map((event) => event.summary),
    })),
    attackDefenseBreakdown:
      state.project.userConfirmedContext.filter((item) => /^Side:/i.test(item))
        .length > 0
        ? state.project.userConfirmedContext.filter((item) =>
            /^Side:/i.test(item),
          )
        : [
            "Attack and defense breakdown is not reported because the current evidence does not provide a user-confirmed side for this project.",
          ],
    openingEngagements,
    objectiveInvolvement,
    strongDecisions: includedFindings
      .filter((finding) => strengthCategories.has(finding.category))
      .map(findingSummary),
    topReviewPriorities: [...reviewFindings]
      .sort((first, second) => priorityWeight(second) - priorityWeight(first))
      .slice(0, 3)
      .map(findingSummary),
    trends: {
      crosshairPlacement: trend(includedFindings, [
        "CROSSHAIR_PLACEMENT_ISSUE",
        "GOOD_CROSSHAIR_DISCIPLINE",
      ]),
      rePeeks: trend(includedFindings, ["POSSIBLE_UNNECESSARY_REPEEK"]),
      possiblePositioning: trend(includedFindings, [
        "POSSIBLE_BAD_POSITIONING",
        "GOOD_POSITIONING",
        "POSSIBLE_FLANK_EXPOSURE",
        "POSSIBLE_WRONG_ANGLE",
        "LINE_OF_SIGHT_ISSUE",
      ]),
      possibleTrades: trend(includedFindings, [
        "POSSIBLE_MISSED_TRADE",
        "GOOD_TRADE",
      ]),
      timing: trend(includedFindings, [
        "POOR_TIMING",
        "EARLY_ROUND_DEATH",
        "UTILITY_TIMING",
        "ROTATION_ISSUE",
      ]),
      operators: state.project.userConfirmedContext.filter((item) =>
        /^Operator:/i.test(item),
      ),
    },
    reviewClips: state.findings.flatMap((finding) =>
      finding.reviewClip
        ? [
            {
              findingId: finding.id,
              clipId: finding.reviewClip.id,
              name: finding.reviewClip.name,
              startSeconds: finding.reviewClip.startSeconds,
              endSeconds: finding.reviewClip.endSeconds,
            },
          ]
        : [],
    ),
    practiceDrills: state.drills,
    nextFiveMatchGoals: [
      ...new Set(
        state.drills
          .map((drill) => drill.nextFiveMatchGoal)
          .filter((goal): goal is string => Boolean(goal)),
      ),
    ],
    sourceVersions: [
      ...new Set([
        ...state.analyses.map(
          (analysis) =>
            `${analysis.analysisVersion} / ${analysis.ruleSetVersion}`,
        ),
        ...state.findings.map((finding) => finding.analysisVersion),
      ]),
    ],
  };
}

function reportList(title: string, items: string[]) {
  return [
    `## ${title}`,
    "",
    ...(items.length > 0
      ? items.map((item) => `- ${item}`)
      : ["- No supported items were available."]),
    "",
  ];
}

function findingLine(
  finding: CoachingReportDocument["topReviewPriorities"][number],
) {
  return `${finding.category.replaceAll("_", " ")} (${Math.round(
    finding.confidence * 100,
  )}% confidence, ${finding.decision.replaceAll("_", " ")}): ${
    finding.explanation
  } Missing context: ${finding.missingContext.join("; ") || "none recorded"}`;
}

export function renderCoachingReportMarkdown(report: CoachingReportDocument) {
  return [
    `# R6 Creator AI Coaching Report`,
    "",
    `Project: ${report.project.name}`,
    `Generated: ${report.generatedAt}`,
    `Input mode: ${report.project.inputMode}`,
    "",
    `> ${report.disclaimer}`,
    "",
    "## Match summary",
    "",
    `- Map: ${report.matchSummary.map ?? "Unknown"}`,
    `- Mode: ${report.matchSummary.mode ?? "Unknown"}`,
    `- Validated rounds represented: ${report.matchSummary.roundCount}`,
    `- Supported selected-player kills: ${report.matchSummary.selectedPlayerKills}`,
    `- Likely deaths inferred from validated kill-target feedback: ${report.matchSummary.selectedPlayerLikelyDeaths}`,
    "",
    ...reportList("Evidence boundaries", report.evidenceBoundary),
    ...reportList(
      "Top three review priorities",
      report.topReviewPriorities.map(findingLine),
    ),
    ...reportList(
      "Strong decisions and objective involvement",
      report.strongDecisions.map(findingLine),
    ),
    ...reportList("Opening engagements", report.openingEngagements),
    ...reportList("Objective involvement", report.objectiveInvolvement),
    ...reportList(
      "Attack and defense breakdown",
      report.attackDefenseBreakdown,
    ),
    ...reportList(
      "Practice drills",
      report.practiceDrills.map(
        (drill) =>
          `${drill.name}: ${drill.instructions} Goal: ${drill.measurableGoal}`,
      ),
    ),
    ...reportList("Goals for the next five matches", report.nextFiveMatchGoals),
    ...reportList("Source versions", report.sourceVersions),
  ].join("\n");
}

function safePdfText(value: string) {
  return value
    .normalize("NFKD")
    .replaceAll(/[^\x20-\x7E]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function wrapText(value: string, maximumCharacters = 94) {
  const words = safePdfText(value).split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maximumCharacters && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderCoachingReportPdf(report: CoachingReportDocument) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([612, 792]);
  let y = 752;

  const addLine = (
    text: string,
    options: { heading?: boolean; gapAfter?: number } = {},
  ) => {
    const font = options.heading ? bold : regular;
    const size = options.heading ? 14 : 9;
    for (const line of wrapText(text, options.heading ? 76 : 94)) {
      if (y < 48) {
        page = document.addPage([612, 792]);
        y = 752;
      }
      page.drawText(line, {
        x: 42,
        y,
        size,
        font,
        color: options.heading ? rgb(0.1, 0.23, 0.16) : rgb(0.12, 0.12, 0.14),
      });
      y -= options.heading ? 19 : 13;
    }
    y -= options.gapAfter ?? 0;
  };

  addLine("R6 Creator AI Coaching Report", { heading: true, gapAfter: 8 });
  addLine(`Project: ${report.project.name}`);
  addLine(`Generated: ${report.generatedAt}`, { gapAfter: 8 });
  addLine(report.disclaimer, { gapAfter: 10 });
  addLine("Match summary", { heading: true, gapAfter: 2 });
  addLine(`Map: ${report.matchSummary.map ?? "Unknown"}`);
  addLine(`Mode: ${report.matchSummary.mode ?? "Unknown"}`);
  addLine(`Rounds represented: ${report.matchSummary.roundCount}`);
  addLine(
    `Supported selected-player kills: ${report.matchSummary.selectedPlayerKills}`,
  );
  addLine(
    `Likely deaths from validated kill-target feedback: ${report.matchSummary.selectedPlayerLikelyDeaths}`,
    { gapAfter: 8 },
  );
  addLine("Evidence boundaries", { heading: true, gapAfter: 2 });
  report.evidenceBoundary.forEach((item) => addLine(`- ${item}`));
  addLine("Top three review priorities", { heading: true, gapAfter: 2 });
  if (report.topReviewPriorities.length === 0) {
    addLine("- No supported priorities were available.");
  } else {
    report.topReviewPriorities.forEach((item) =>
      addLine(`- ${findingLine(item)}`),
    );
  }
  addLine("Practice drills", { heading: true, gapAfter: 2 });
  if (report.practiceDrills.length === 0) {
    addLine("- No practice drill was saved.");
  } else {
    report.practiceDrills.forEach((drill) => {
      addLine(`- ${drill.name}: ${drill.instructions}`);
      addLine(`  Measurable goal: ${drill.measurableGoal}`);
    });
  }
  addLine("Goals for the next five matches", { heading: true, gapAfter: 2 });
  if (report.nextFiveMatchGoals.length === 0) {
    addLine("- No next-five-match goal was saved.");
  } else {
    report.nextFiveMatchGoals.forEach((goal) => addLine(`- ${goal}`));
  }
  addLine("Source versions", { heading: true, gapAfter: 2 });
  report.sourceVersions.forEach((version) => addLine(`- ${version}`));
  return document.save();
}

function drillTemplate(finding: ReportFinding) {
  const category = finding.category;
  if (
    category === "CROSSHAIR_PLACEMENT_ISSUE" ||
    category === "GOOD_CROSSHAIR_DISCIPLINE"
  ) {
    return {
      name: "Crosshair checkpoint review",
      instructions:
        "Before the next five visible doorway or corner entries, pause the replay and mark the expected threat point. Compare that marked point with the visible crosshair without assuming universal head height.",
      measurableGoal:
        "Record five reviewed entries and keep at least four within the user-marked acceptable area.",
      nextFiveMatchGoal:
        "Review one doorway or corner entry after each of the next five matches.",
    };
  }
  if (category === "POSSIBLE_UNNECESSARY_REPEEK") {
    return {
      name: "Second-challenge decision check",
      instructions:
        "For each accepted repeated-challenge example, write one alternative before replaying it: disengage, use visible utility, wait for pressure, or take a different angle. Keep communication and unseen threats marked unknown.",
      measurableGoal:
        "Review five second challenges and identify a supported alternative for at least four.",
      nextFiveMatchGoal:
        "After each of the next five matches, review one repeated challenge or record that none was found.",
    };
  }
  if (category === "POSSIBLE_MISSED_TRADE" || category === "GOOD_TRADE") {
    return {
      name: "Trade evidence checklist",
      instructions:
        "Review the event order, selected-player view, and any user-confirmed teammate context. Mark distance, line of sight, cover, and communication unknown unless they are directly visible.",
      measurableGoal:
        "Complete the evidence checklist for five teammate deaths without labeling a missed trade from timing alone.",
      nextFiveMatchGoal:
        "Review one teammate-death sequence after each of the next five matches.",
    };
  }
  return {
    name: "Evidence-first decision review",
    instructions:
      "Replay the saved moment, list what is directly visible, list replay-confirmed facts, then write one inference and one alternative explanation. Keep every unavailable tactical detail marked unknown.",
    measurableGoal:
      "Complete five reviews with observation, fact, inference, missing context, and alternative kept separate.",
    nextFiveMatchGoal:
      "Complete one evidence-first review after each of the next five matches.",
  };
}

export async function createPracticeDrill(
  studioProjectId: string,
  input: unknown,
) {
  const value = createPracticeDrillSchema.parse(input);
  const finding = await db.coachingFinding.findFirst({
    where: { id: value.findingId, studioProjectId },
  });
  if (!finding) {
    throw new AppError(
      "That coaching finding no longer exists in this project.",
      404,
      "COACHING_FINDING_NOT_FOUND",
    );
  }
  const template = drillTemplate(
    (await getCoachingState(studioProjectId)).findings.find(
      (item) => item.id === finding.id,
    )!,
  );
  await db.coachingPracticeDrill.create({
    data: {
      studioProjectId,
      findingId: finding.id,
      name: value.name ?? template.name,
      observation: value.observation ?? finding.explanation,
      instructions: value.instructions ?? template.instructions,
      measurableGoal: value.measurableGoal ?? template.measurableGoal,
      nextFiveMatchGoal: value.nextFiveMatchGoal ?? template.nextFiveMatchGoal,
    },
  });
  return getCoachingState(studioProjectId);
}

export async function updatePracticeDrill(
  studioProjectId: string,
  drillId: string,
  input: unknown,
) {
  const value = updatePracticeDrillSchema.parse(input);
  const drill = await db.coachingPracticeDrill.findFirst({
    where: { id: drillId, studioProjectId },
  });
  if (!drill) {
    throw new AppError(
      "That practice drill no longer exists.",
      404,
      "COACHING_DRILL_NOT_FOUND",
    );
  }
  await db.coachingPracticeDrill.update({
    where: { id: drill.id },
    data: value,
  });
  return getCoachingState(studioProjectId);
}

export async function deletePracticeDrill(
  studioProjectId: string,
  drillId: string,
) {
  const drill = await db.coachingPracticeDrill.findFirst({
    where: { id: drillId, studioProjectId },
  });
  if (!drill) {
    throw new AppError(
      "That practice drill no longer exists.",
      404,
      "COACHING_DRILL_NOT_FOUND",
    );
  }
  await db.coachingPracticeDrill.delete({ where: { id: drill.id } });
  return getCoachingState(studioProjectId);
}

export async function createFindingReviewClip(
  studioProjectId: string,
  findingId: string,
  input: unknown,
) {
  const value = createReviewClipSchema.parse(input);
  const finding = await db.coachingFinding.findFirst({
    where: { id: findingId, studioProjectId },
    include: {
      studioProject: {
        include: {
          inputs: {
            where: { kind: "PRIMARY_RECORDING" },
            include: { videoProject: true },
          },
        },
      },
    },
  });
  const recording = finding?.studioProject.inputs[0]?.videoProject;
  if (!finding || !recording || finding.videoTimestampSeconds == null) {
    throw new AppError(
      "A review clip requires a saved video timestamp and primary recording.",
      409,
      "COACHING_REVIEW_CLIP_UNAVAILABLE",
    );
  }
  const startSeconds = Math.max(
    0,
    finding.videoTimestampSeconds - value.contextBeforeSeconds,
  );
  const endSeconds = Math.min(
    recording.durationSeconds,
    finding.videoTimestampSeconds + value.contextAfterSeconds,
  );
  const clip = await createProjectClip(recording.id, {
    name: `Coaching review · ${finding.category
      .toLowerCase()
      .replaceAll("_", " ")}`,
    startTime: startSeconds,
    endTime: endSeconds,
  });
  await db.coachingFinding.update({
    where: { id: finding.id },
    data: { reviewClipId: clip.id },
  });
  return getCoachingState(studioProjectId);
}

export async function createCoachingReport(
  studioProjectId: string,
  input: unknown,
) {
  const value = createCoachingReportSchema.parse(input);
  const state = await getCoachingState(studioProjectId);
  const report = buildCoachingReportDocument(state);
  const latest = await db.coachingReport.findFirst({
    where: { studioProjectId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  await db.coachingReport.create({
    data: {
      studioProjectId,
      version: (latest?.version ?? 0) + 1,
      reason: value.reason,
      reportVersion: COACHING_REPORT_VERSION,
      reportJson: JSON.stringify(report),
      findingSnapshotJson: JSON.stringify(state.findings),
      sourceSnapshotJson: JSON.stringify({
        project: state.project,
        analyses: state.analyses,
        replayEventCount: state.replayEvents.length,
        transcriptSegmentCount: state.transcriptSegments.length,
        measurementCount: state.measurements.length,
      }),
    },
  });
  return getCoachingState(studioProjectId);
}

export async function getCoachingReport(
  studioProjectId: string,
  reportId: string,
) {
  const report = await db.coachingReport.findFirst({
    where: { id: reportId, studioProjectId },
    include: { exports: { orderBy: { createdAt: "desc" } } },
  });
  if (!report) {
    throw new AppError(
      "That coaching report no longer exists.",
      404,
      "COACHING_REPORT_NOT_FOUND",
    );
  }
  return {
    id: report.id,
    studioProjectId: report.studioProjectId,
    version: report.version,
    reason: report.reason,
    reportVersion: report.reportVersion,
    document: JSON.parse(report.reportJson) as CoachingReportDocument,
    createdAt: report.createdAt.toISOString(),
    exports: report.exports.map((item) => ({
      id: item.id,
      format: item.format,
      fileSizeBytes: Number(item.fileSizeBytes),
      checksumSha256: item.checksumSha256,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

export async function deleteCoachingReport(
  studioProjectId: string,
  reportId: string,
) {
  const report = await db.coachingReport.findFirst({
    where: { id: reportId, studioProjectId },
    select: { id: true },
  });
  if (!report) {
    throw new AppError(
      "That coaching report no longer exists.",
      404,
      "COACHING_REPORT_NOT_FOUND",
    );
  }
  await db.coachingReport.delete({ where: { id: report.id } });
  await rm(
    /* turbopackIgnore: true */
    coachingReportDirectory(studioProjectId, report.id),
    {
      recursive: true,
      force: true,
    },
  );
  return getCoachingState(studioProjectId);
}

export async function createCoachingReportExport(
  studioProjectId: string,
  reportId: string,
  input: unknown,
) {
  const value = createCoachingReportExportSchema.parse(input);
  const report = await getCoachingReport(studioProjectId, reportId);
  const exportId = randomUUID();
  const directory = coachingReportDirectory(studioProjectId, reportId);
  const extension =
    value.format === "MARKDOWN"
      ? "md"
      : value.format === "PDF"
        ? "pdf"
        : "json";
  const filename = `${exportId}.${extension}`;
  const finalPath = path.join(
    /* turbopackIgnore: true */
    directory,
    /* turbopackIgnore: true */
    filename,
  );
  const temporaryPath = path.join(
    /* turbopackIgnore: true */
    directory,
    /* turbopackIgnore: true */
    `${filename}.processing`,
  );
  await mkdir(/* turbopackIgnore: true */ directory, { recursive: true });
  let bytes: Uint8Array;
  if (value.format === "JSON") {
    bytes = Buffer.from(JSON.stringify(report.document, null, 2), "utf8");
  } else if (value.format === "MARKDOWN") {
    bytes = Buffer.from(renderCoachingReportMarkdown(report.document), "utf8");
  } else {
    bytes = await renderCoachingReportPdf(report.document);
  }
  try {
    await writeFile(/* turbopackIgnore: true */ temporaryPath, bytes, {
      flag: "wx",
    });
    await rename(
      /* turbopackIgnore: true */ temporaryPath,
      /* turbopackIgnore: true */ finalPath,
    );
    const saved = await stat(/* turbopackIgnore: true */ finalPath);
    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    await db.coachingReportExport.create({
      data: {
        id: exportId,
        reportId,
        format: value.format,
        relativePath: toDataRelativePath(finalPath),
        fileSizeBytes: BigInt(saved.size),
        checksumSha256,
      },
    });
    return {
      exportId,
      format: value.format,
      downloadUrl: `/api/studio-projects/${studioProjectId}/coaching/reports/${reportId}/exports/${exportId}`,
      coaching: await getCoachingState(studioProjectId),
    };
  } catch (error) {
    await Promise.all([
      unlink(/* turbopackIgnore: true */ temporaryPath).catch(() => undefined),
      unlink(/* turbopackIgnore: true */ finalPath).catch(() => undefined),
    ]);
    throw error;
  }
}

export function coachingReportContentType(format: CoachingReportFormat) {
  if (format === "PDF") return "application/pdf";
  if (format === "MARKDOWN") return "text/markdown; charset=utf-8";
  return "application/json; charset=utf-8";
}

export async function getCoachingReportExportFile(
  studioProjectId: string,
  reportId: string,
  exportId: string,
) {
  const item = await db.coachingReportExport.findFirst({
    where: {
      id: exportId,
      reportId,
      report: { studioProjectId },
    },
  });
  if (!item) {
    throw new AppError(
      "That coaching report export no longer exists.",
      404,
      "COACHING_REPORT_EXPORT_NOT_FOUND",
    );
  }
  const extension =
    item.format === "MARKDOWN" ? "md" : item.format.toLowerCase();
  return {
    relativePath: item.relativePath,
    contentType: coachingReportContentType(item.format),
    downloadName: `r6-coaching-report-v${reportId.slice(0, 8)}.${extension}`,
  };
}
