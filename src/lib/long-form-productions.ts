import type { LongFormStoryStyle } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const LONG_FORM_PLANNER_VERSION = "u4-long-form-planner-v1";

const storyStyleSchema = z.enum([
  "NATURAL",
  "STORYTELLING",
  "HIGH_ENERGY",
  "EDUCATIONAL",
  "SERIOUS",
  "SESSION_RECAP",
]);

export const longFormSettingsSchema = z
  .object({
    targetDurationSeconds: z
      .number()
      .finite()
      .min(300, "Choose a target of at least five minutes.")
      .max(14_400, "Choose a target of four hours or less."),
    storytellingStyle: storyStyleSchema.default("STORYTELLING"),
    energyLevel: z.number().int().min(0).max(100).default(60),
    humorLevel: z.number().int().min(0).max(100).default(40),
    educationalLevel: z.number().int().min(0).max(100).default(30),
    liveGameplayPercent: z.number().int().min(0).max(100).default(75),
    voiceoverPercent: z.number().int().min(0).max(100).default(25),
    matchOrRoundLimit: z.number().int().min(1).max(40).default(4),
    excludeWeakSections: z.boolean().default(true),
    includeLosses: z.boolean().default(true),
    chronologicalOrder: z.boolean().default(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.liveGameplayPercent + value.voiceoverPercent !== 100) {
      context.addIssue({
        code: "custom",
        path: ["voiceoverPercent"],
        message: "Live gameplay and voiceover must add up to 100%.",
      });
    }
  });

const sourceRangeSchema = z
  .object({
    projectId: z.string().min(1),
    recordingName: z.string().min(1),
    sourceStartSeconds: z.number().finite().min(0),
    sourceEndSeconds: z.number().finite().positive(),
    reason: z.string().min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sourceEndSeconds <= value.sourceStartSeconds) {
      context.addIssue({
        code: "custom",
        path: ["sourceEndSeconds"],
        message: "A source range must end after it starts.",
      });
    }
  });

const importantMomentSchema = z
  .object({
    candidateId: z.string().min(1),
    label: z.string().min(1),
    projectId: z.string().min(1),
    startSeconds: z.number().finite().min(0),
    peakSeconds: z.number().finite().min(0),
    endSeconds: z.number().finite().positive(),
    eventConfidence: z.number().finite().min(0).max(1),
    contentPotentialScore: z.number().finite().min(0).max(100),
    reviewDecision: z.enum(["USEFUL", "NOT_USEFUL", "WRONG_EVENT"]).nullable(),
    evidence: z.array(z.string().min(1)).max(12),
    unknowns: z.array(z.string().min(1)).max(20),
  })
  .strict();

const planSectionSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum([
      "OPENING_TEASER",
      "INTRO",
      "CHAPTER",
      "RETENTION_BEAT",
      "CLIMAX",
      "ENDING",
    ]),
    title: z.string().min(1),
    outputStartSeconds: z.number().finite().min(0),
    outputEndSeconds: z.number().finite().positive(),
    durationSeconds: z.number().finite().positive(),
    sourceRanges: z.array(sourceRangeSchema).max(80),
    importantMomentIds: z.array(z.string().min(1)).max(30),
    voiceoverDirection: z.string().min(1),
    liveAudioDirection: z.string().min(1),
    transitionIn: z.string().min(1),
    retentionPurpose: z.string().min(1),
    reason: z.string().min(1),
    evidence: z.array(z.string().min(1)).max(20),
    warnings: z.array(z.string().min(1)).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.outputEndSeconds <= value.outputStartSeconds) {
      context.addIssue({
        code: "custom",
        path: ["outputEndSeconds"],
        message: "A planned section must end after it starts.",
      });
    }
    if (
      Math.abs(
        value.outputEndSeconds -
          value.outputStartSeconds -
          value.durationSeconds,
      ) > 0.05
    ) {
      context.addIssue({
        code: "custom",
        path: ["durationSeconds"],
        message: "Section duration must match its output boundaries.",
      });
    }
  });

export const longFormPlanSchema = z
  .object({
    version: z.literal(LONG_FORM_PLANNER_VERSION),
    premise: z.string().min(1),
    requestedDurationSeconds: z.number().finite().positive(),
    proposedDurationSeconds: z.number().finite().positive(),
    availableSourceSeconds: z.number().finite().positive(),
    durationFit: z.enum(["EXACT", "SOURCE_SHORTFALL"]),
    selectedMatchesAndRounds: z.array(z.string().min(1)).max(100),
    importantMoments: z.array(importantMomentSchema).max(200),
    sections: z.array(planSectionSchema).min(4).max(40),
    clipOrder: z.array(z.string().min(1)).max(200),
    transitions: z.array(z.string().min(1)).max(100),
    voiceoverBetweenClips: z.array(z.string().min(1)).max(100),
    openingTeaser: z.string().min(1),
    introScript: z.string().min(1),
    midVideoRetentionBeat: z.string().min(1),
    climaxPlan: z.string().min(1),
    ending: z.string().min(1),
    callToAction: z.string().min(1),
    titleOptions: z.tuple([
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
    ]),
    thumbnailConcepts: z.tuple([
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
    ]),
    description: z.string().min(1),
    chapterTimestamps: z
      .array(
        z
          .object({
            title: z.string().min(1),
            startSeconds: z.number().finite().min(0),
          })
          .strict(),
      )
      .min(1)
      .max(40),
    metrics: z
      .object({
        targetSeconds: z.number().finite().positive(),
        plannedSeconds: z.number().finite().positive(),
        sourceSeconds: z.number().finite().positive(),
        plannedGameplaySeconds: z.number().finite().min(0),
        plannedVoiceoverSeconds: z.number().finite().min(0),
        plannedSilenceSeconds: z.number().finite().min(0),
        estimatedRemovedSeconds: z.number().finite().min(0),
        sectionCount: z.number().int().positive(),
        requiredCutsEstimate: z.number().int().min(0),
      })
      .strict(),
    warnings: z.array(z.string().min(1)).max(100),
    unknowns: z.array(z.string().min(1)).max(100),
    evidenceSummary: z.array(z.string().min(1)).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    let expectedStart = 0;
    value.sections.forEach((section, index) => {
      if (Math.abs(section.outputStartSeconds - expectedStart) > 0.05) {
        context.addIssue({
          code: "custom",
          path: ["sections", index, "outputStartSeconds"],
          message: "Long-form sections must be contiguous and ordered.",
        });
      }
      expectedStart = section.outputEndSeconds;
    });
    if (Math.abs(expectedStart - value.proposedDurationSeconds) > 0.05) {
      context.addIssue({
        code: "custom",
        path: ["proposedDurationSeconds"],
        message: "The proposed duration must equal the planned section total.",
      });
    }
  });

export type LongFormSettings = z.infer<typeof longFormSettingsSchema>;
export type LongFormPlan = z.infer<typeof longFormPlanSchema>;
type PlanSection = LongFormPlan["sections"][number];

type PlanningRecording = {
  id: string;
  name: string;
  durationSeconds: number;
  sortOrder: number;
};

type PlanningCandidate = LongFormPlan["importantMoments"][number];

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isVerifiedReplayStatus(value: string) {
  return (
    value === "VALIDATED" ||
    value === "USER_CONFIRMED" ||
    value === "USER_CORRECTED"
  );
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function styleLabel(style: LongFormStoryStyle) {
  const labels: Record<LongFormStoryStyle, string> = {
    NATURAL: "natural",
    STORYTELLING: "story-led",
    HIGH_ENERGY: "high-energy",
    EDUCATIONAL: "educational",
    SERIOUS: "serious",
    SESSION_RECAP: "session-recap",
  };
  return labels[style];
}

function evidenceSummaries(value: string) {
  const parsed = parseJson<Array<{ summary?: unknown }>>(value, []);
  return parsed
    .map((item) => item.summary)
    .filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
}

function selectSourceRanges(
  recordings: PlanningRecording[],
  startCursor: number,
  durationSeconds: number,
  reason: string,
) {
  const ranges: LongFormPlan["sections"][number]["sourceRanges"] = [];
  let remaining = durationSeconds;
  let cursor = startCursor;
  let recordingOffset = 0;

  for (const recording of recordings) {
    const recordingEnd = recordingOffset + recording.durationSeconds;
    if (cursor >= recordingEnd) {
      recordingOffset = recordingEnd;
      continue;
    }
    const localStart = Math.max(0, cursor - recordingOffset);
    const available = recording.durationSeconds - localStart;
    const selected = Math.min(available, remaining);
    if (selected > 0.001) {
      ranges.push({
        projectId: recording.id,
        recordingName: recording.name,
        sourceStartSeconds: round(localStart),
        sourceEndSeconds: round(localStart + selected),
        reason,
      });
      cursor += selected;
      remaining -= selected;
    }
    recordingOffset = recordingEnd;
    if (remaining <= 0.001) break;
  }
  return { ranges, nextCursor: cursor };
}

function allocateSectionDurations(total: number) {
  const opening = Math.min(30, Math.max(15, total * 0.025));
  const intro = Math.min(60, Math.max(30, total * 0.04));
  const retention = Math.min(45, Math.max(20, total * 0.03));
  const climax = Math.min(150, Math.max(45, total * 0.1));
  const ending = Math.min(60, Math.max(25, total * 0.035));
  const reserved = opening + intro + retention + climax + ending;
  const chapterBudget = Math.max(1, total - reserved);
  const desiredChapters = total >= 1_500 ? 6 : total >= 900 ? 5 : 4;
  const chapters = Array.from(
    { length: desiredChapters },
    () => chapterBudget / desiredChapters,
  );
  return [opening, intro, ...chapters, retention, climax, ending].map(round);
}

function sectionIdentity(index: number, chapterCount: number) {
  if (index === 0)
    return {
      kind: "OPENING_TEASER" as const,
      title: "Opening teaser",
    };
  if (index === 1)
    return { kind: "INTRO" as const, title: "Set up the session" };
  if (index <= chapterCount + 1)
    return {
      kind: "CHAPTER" as const,
      title: `Chapter ${index - 1}`,
    };
  if (index === chapterCount + 2)
    return {
      kind: "RETENTION_BEAT" as const,
      title: "Mid-video retention beat",
    };
  if (index === chapterCount + 3)
    return { kind: "CLIMAX" as const, title: "Strongest supported finish" };
  return { kind: "ENDING" as const, title: "Ending and next step" };
}

function makeSection(input: {
  index: number;
  chapterCount: number;
  startSeconds: number;
  durationSeconds: number;
  sourceRanges: PlanSection["sourceRanges"];
  candidates: PlanningCandidate[];
  settings: LongFormSettings;
}): PlanSection {
  const identity = sectionIdentity(input.index, input.chapterCount);
  const endSeconds = round(input.startSeconds + input.durationSeconds);
  const moments = input.candidates.filter((candidate) =>
    input.sourceRanges.some(
      (range) =>
        range.projectId === candidate.projectId &&
        candidate.peakSeconds >= range.sourceStartSeconds &&
        candidate.peakSeconds <= range.sourceEndSeconds,
    ),
  );
  const evidence = moments
    .flatMap((moment) => moment.evidence)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 8);
  const kindDirections: Record<
    PlanSection["kind"],
    {
      voiceover: string;
      live: string;
      transition: string;
      retention: string;
      reason: string;
    }
  > = {
    OPENING_TEASER: {
      voiceover:
        "Preview the strongest reviewed question or visible turning point without revealing an unverified result.",
      live: "Use an actual source reaction only when the selected audio track contains it.",
      transition:
        "Open directly on source footage; do not add a fabricated result-first claim.",
      retention:
        "Give the viewer a concrete reason to continue within the first 30 seconds.",
      reason:
        "A compact teaser establishes the premise while keeping unknown gameplay facts unknown.",
    },
    INTRO: {
      voiceover:
        "Explain the user-supplied goal and session context in original language.",
      live: "Keep useful room tone or creator audio underneath; remove only reviewed dead air.",
      transition:
        "Move from teaser to chronological setup with a short title card.",
      retention: "Set an honest expectation for what the recording can show.",
      reason:
        "The introduction orients the viewer before the longer gameplay sections.",
    },
    CHAPTER: {
      voiceover:
        "Bridge visible decisions and reviewed moments; label uncertain interpretations as uncertain.",
      live: "Prefer uninterrupted gameplay around selected evidence peaks.",
      transition:
        "Use a short chapter card or a natural source cut between recording ranges.",
      retention:
        "Each chapter should add a new visible development instead of repeating the previous section.",
      reason:
        "Chapters divide the available source into reviewable, evidence-bounded story beats.",
    },
    RETENTION_BEAT: {
      voiceover:
        "Restate the open question using only facts already established in the plan.",
      live: "Use a concise reviewed gameplay beat rather than generic filler.",
      transition:
        "Use a deliberate pace change, not an artificial speed stretch.",
      retention:
        "Reconnect the middle of the video to the premise and preview the remaining supported payoff.",
      reason:
        "A midpoint reset helps a long video stay understandable without claiming predicted retention.",
    },
    CLIMAX: {
      voiceover:
        "Frame the strongest evidence-supported moment and explicitly avoid unsupported match stakes.",
      live: "Preserve useful creator reaction and game audio around the selected peak.",
      transition:
        "Build from the preceding chapter with source order intact when chronological mode is enabled.",
      retention:
        "Place the strongest reviewed evidence late enough to create progression.",
      reason:
        "The climax reserves focused time for the best available reviewed moment, not a guaranteed highlight.",
    },
    ENDING: {
      voiceover:
        "Summarize what the footage established and leave unknown outcomes unclaimed.",
      live: "End on a clean source beat or user-recorded closing line.",
      transition: "Resolve the story, then use a brief end card.",
      retention:
        "Give the viewer a complete ending and one clear optional next action.",
      reason:
        "A deliberate ending closes the premise without inventing a result.",
    },
  };
  const directions = kindDirections[identity.kind];
  return {
    id: `section-${input.index + 1}`,
    kind: identity.kind,
    title: identity.title,
    outputStartSeconds: round(input.startSeconds),
    outputEndSeconds: endSeconds,
    durationSeconds: round(input.durationSeconds),
    sourceRanges: input.sourceRanges,
    importantMomentIds: moments.map((moment) => moment.candidateId),
    voiceoverDirection: directions.voiceover,
    liveAudioDirection: directions.live,
    transitionIn: directions.transition,
    retentionPurpose: directions.retention,
    reason: directions.reason,
    evidence:
      evidence.length > 0
        ? evidence
        : ["No reviewed detector evidence falls inside this planned range."],
    warnings:
      moments.length > 0
        ? moments.flatMap((moment) => moment.unknowns).slice(0, 8)
        : ["Review this range manually before describing a gameplay event."],
  };
}

export function createEvidenceBoundedLongFormPlan(input: {
  projectName: string;
  focusAreas: string[];
  contentInstructions: string | null;
  context: string[];
  recordings: PlanningRecording[];
  candidates: PlanningCandidate[];
  selectedMatchesAndRounds: string[];
  settings: LongFormSettings;
}): LongFormPlan {
  const availableSourceSeconds = round(
    input.recordings.reduce(
      (total, recording) => total + recording.durationSeconds,
      0,
    ),
  );
  const proposedDurationSeconds = round(
    Math.min(input.settings.targetDurationSeconds, availableSourceSeconds),
  );
  const durationFit =
    proposedDurationSeconds + 0.05 >= input.settings.targetDurationSeconds
      ? ("EXACT" as const)
      : ("SOURCE_SHORTFALL" as const);
  const durations = allocateSectionDurations(proposedDurationSeconds);
  const chapterCount = durations.length - 5;
  const sections: PlanSection[] = [];
  let outputCursor = 0;
  let sourceCursor = 0;
  for (const [index, duration] of durations.entries()) {
    const selected = selectSourceRanges(
      input.recordings,
      sourceCursor,
      duration,
      `Source coverage for ${sectionIdentity(index, chapterCount).title}.`,
    );
    sections.push(
      makeSection({
        index,
        chapterCount,
        startSeconds: outputCursor,
        durationSeconds: duration,
        sourceRanges: selected.ranges,
        candidates: input.candidates,
        settings: input.settings,
      }),
    );
    outputCursor += duration;
    sourceCursor = selected.nextCursor;
  }
  const roundingDelta = round(proposedDurationSeconds - outputCursor);
  if (Math.abs(roundingDelta) > 0.0001) {
    const final = sections.at(-1);
    if (final) {
      final.durationSeconds = round(final.durationSeconds + roundingDelta);
      final.outputEndSeconds = proposedDurationSeconds;
      const finalRange = final.sourceRanges.at(-1);
      if (finalRange) {
        finalRange.sourceEndSeconds = round(
          finalRange.sourceEndSeconds + roundingDelta,
        );
      }
    }
  }
  const reviewedUseful = input.candidates.filter(
    (candidate) => candidate.reviewDecision === "USEFUL",
  );
  const rankedCandidates = [...input.candidates].sort((left, right) => {
    if (input.settings.chronologicalOrder) {
      if (left.projectId !== right.projectId) {
        const leftIndex = input.recordings.findIndex(
          (recording) => recording.id === left.projectId,
        );
        const rightIndex = input.recordings.findIndex(
          (recording) => recording.id === right.projectId,
        );
        return leftIndex - rightIndex;
      }
      return left.peakSeconds - right.peakSeconds;
    }
    return right.contentPotentialScore - left.contentPotentialScore;
  });
  const selectedCandidates = rankedCandidates
    .filter(
      (candidate) =>
        candidate.reviewDecision !== "WRONG_EVENT" &&
        candidate.reviewDecision !== "NOT_USEFUL",
    )
    .slice(0, Math.max(1, input.settings.matchOrRoundLimit * 4));
  const focus =
    input.focusAreas.length > 0
      ? input.focusAreas.join(", ")
      : "the strongest visible moments";
  const style = styleLabel(input.settings.storytellingStyle);
  const contextText =
    input.context.length > 0
      ? input.context.join(" · ")
      : "No match context has been user-confirmed.";
  const warnings = [
    ...(durationFit === "SOURCE_SHORTFALL"
      ? [
          `The linked recordings contain ${availableSourceSeconds.toFixed(1)} seconds, which is shorter than the requested ${input.settings.targetDurationSeconds.toFixed(1)} seconds. The plan was shortened instead of stretching footage.`,
        ]
      : []),
    ...(input.candidates.length === 0
      ? [
          "No saved candidate moments are linked. All proposed source ranges require manual review.",
        ]
      : []),
    ...(reviewedUseful.length === 0
      ? [
          "No candidate has been marked useful. Candidate rankings are review aids, not confirmed highlights.",
        ]
      : []),
    ...(input.settings.includeLosses
      ? []
      : [
          "Losses are excluded only when a user review or verified fact identifies them; unknown outcomes remain eligible for review.",
        ]),
    ...(input.settings.excludeWeakSections
      ? [
          "Weak-section exclusion is a planning preference. U4.1 does not silently remove unlabeled footage.",
        ]
      : []),
  ];
  const unknowns = [
    ...(input.context.length === 0
      ? ["Map, operator, side, site, and result are not user-confirmed."]
      : []),
    "Exact story meaning still requires human review of the planned source ranges.",
    "A Content Potential Score is not a prediction or guarantee of views.",
  ];
  const evidenceSummary = [
    `${input.recordings.length} linked recording${input.recordings.length === 1 ? " provides" : "s provide"} ${availableSourceSeconds.toFixed(1)} seconds of source footage.`,
    `${input.candidates.length} saved candidate${input.candidates.length === 1 ? "" : "s"} were inspected; ${reviewedUseful.length} are marked useful.`,
    `User-confirmed context: ${contextText}`,
    ...(input.contentInstructions
      ? [`Creator instruction: ${input.contentInstructions}`]
      : []),
  ];
  const chapterTimestamps = sections.map((section) => ({
    title: section.title,
    startSeconds: section.outputStartSeconds,
  }));
  const plannedGameplaySeconds = round(
    (proposedDurationSeconds * input.settings.liveGameplayPercent) / 100,
  );
  const plannedVoiceoverSeconds = round(
    (proposedDurationSeconds * input.settings.voiceoverPercent) / 100,
  );
  return longFormPlanSchema.parse({
    version: LONG_FORM_PLANNER_VERSION,
    premise: `Build an original ${style} ${input.projectName} video around ${focus}, using only linked footage and saved evidence.`,
    requestedDurationSeconds: input.settings.targetDurationSeconds,
    proposedDurationSeconds,
    availableSourceSeconds,
    durationFit,
    selectedMatchesAndRounds:
      input.selectedMatchesAndRounds.length > 0
        ? input.selectedMatchesAndRounds
        : [
            "No verified replay rounds were selected; source recordings remain the planning authority.",
          ],
    importantMoments: selectedCandidates,
    sections,
    clipOrder: sections.flatMap((section) =>
      section.sourceRanges.map(
        (range) =>
          `${section.title}: ${range.recordingName} ${range.sourceStartSeconds.toFixed(1)}–${range.sourceEndSeconds.toFixed(1)}s`,
      ),
    ),
    transitions: sections
      .slice(1)
      .map((section) => `${section.title}: ${section.transitionIn}`),
    voiceoverBetweenClips: sections.map(
      (section) => `${section.title}: ${section.voiceoverDirection}`,
    ),
    openingTeaser:
      "Open on a reviewed visible question or turning point, then state the session goal without revealing an unverified outcome.",
    introScript: `This session is being shaped around ${focus}. The plan uses only the linked recordings and any context you explicitly confirmed.`,
    midVideoRetentionBeat:
      "Return to the opening question, summarize only visible progress, and preview the strongest remaining reviewed range.",
    climaxPlan:
      selectedCandidates.length > 0
        ? `Build toward ${selectedCandidates.at(-1)?.label.toLowerCase()} while showing its supporting evidence and unknowns.`
        : "Reserve the late-video climax slot, but choose its source manually because no reviewed candidate is available.",
    ending:
      "Close by stating what the footage actually established and avoid naming an unverified match result.",
    callToAction:
      "Ask one natural question about the visible decision, or invite the viewer to watch the next documented session.",
    titleOptions: [
      `${input.projectName}: The Full Session Story`,
      `What This Siege Session Actually Showed`,
      `${style === "session-recap" ? "Session Recap" : "Inside the Match"} | ${input.projectName}`,
    ],
    thumbnailConcepts: [
      "One verified gameplay frame with short original text: THE TURNING POINT",
      "Before-and-after source frames with original text: WHAT CHANGED?",
      "A clear creator-selected frame with original text: FULL SESSION",
    ],
    description: `An evidence-bounded ${style} plan built from ${input.recordings.length} local recording${input.recordings.length === 1 ? "" : "s"}. Gameplay interpretations must be confirmed during the edit.`,
    chapterTimestamps,
    metrics: {
      targetSeconds: input.settings.targetDurationSeconds,
      plannedSeconds: proposedDurationSeconds,
      sourceSeconds: availableSourceSeconds,
      plannedGameplaySeconds,
      plannedVoiceoverSeconds,
      plannedSilenceSeconds: 0,
      estimatedRemovedSeconds: round(
        Math.max(0, availableSourceSeconds - proposedDurationSeconds),
      ),
      sectionCount: sections.length,
      requiredCutsEstimate: Math.max(0, sections.length - 1),
    },
    warnings,
    unknowns,
    evidenceSummary,
  });
}

async function loadPlanningContext(studioProjectId: string) {
  const project = await db.studioProject.findUnique({
    where: { id: studioProjectId },
    include: {
      map: true,
      mapVersion: true,
      bombSite: true,
      operator: true,
      operatorVersion: true,
      inputs: {
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
        include: {
          videoProject: true,
          replayPackage: {
            include: {
              canonicalMatch: {
                include: {
                  rounds: { orderBy: { roundIndex: "asc" } },
                },
              },
            },
          },
        },
      },
      candidateMoments: {
        include: {
          reviews: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!project) {
    throw new AppError(
      "That Creator Studio project does not exist.",
      404,
      "STUDIO_PROJECT_NOT_FOUND",
    );
  }
  const recordings = project.inputs
    .filter(
      (input) =>
        (input.kind === "PRIMARY_RECORDING" ||
          input.kind === "ADDITIONAL_RECORDING") &&
        input.videoProject,
    )
    .map((input) => ({
      id: input.videoProject!.id,
      name: input.videoProject!.name,
      durationSeconds: input.videoProject!.durationSeconds,
      sortOrder: input.sortOrder,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  if (recordings.length === 0) {
    throw new AppError(
      "Add at least one screen recording before planning a long-form video.",
      409,
      "LONG_FORM_RECORDING_REQUIRED",
    );
  }
  const recordingIds = new Set(recordings.map((recording) => recording.id));
  const candidates: PlanningCandidate[] = project.candidateMoments
    .filter((candidate) => recordingIds.has(candidate.projectId))
    .map((candidate) => {
      const review = candidate.reviews[0] ?? null;
      return {
        candidateId: candidate.id,
        label: candidate.mainEvent,
        projectId: candidate.projectId,
        startSeconds: review?.correctedStartSeconds ?? candidate.startSeconds,
        peakSeconds: candidate.peakSeconds,
        endSeconds: review?.correctedEndSeconds ?? candidate.endSeconds,
        eventConfidence: candidate.eventConfidence,
        contentPotentialScore: candidate.contentPotentialScore,
        reviewDecision: review?.decision ?? null,
        evidence: [
          ...evidenceSummaries(candidate.videoEvidenceJson),
          ...evidenceSummaries(candidate.transcriptEvidenceJson),
          ...evidenceSummaries(candidate.replayEvidenceJson),
        ].slice(0, 12),
        unknowns: parseJson<string[]>(candidate.missingEvidenceJson, []).slice(
          0,
          20,
        ),
      };
    });
  const context = project.contextUserConfirmed
    ? [
        project.map ? `Map: ${project.map.name}` : null,
        project.mapVersion
          ? `Map version: ${project.mapVersion.versionName}`
          : null,
        project.bombSite ? `Bomb site: ${project.bombSite.displayName}` : null,
        project.side !== "UNKNOWN"
          ? `Side: ${project.side.toLowerCase()}`
          : null,
        project.operator ? `Operator: ${project.operator.displayName}` : null,
        project.operatorVersion
          ? `Operator version: ${project.operatorVersion.versionName}`
          : null,
        project.roundResult ? `Result: ${project.roundResult}` : null,
      ].filter((item): item is string => item !== null)
    : [];
  const replayInputs = project.inputs.filter(
    (input) => input.kind === "MATCH_REPLAY" && input.replayPackage,
  );
  const selectedMatchesAndRounds = replayInputs.flatMap((input) => {
    const match = input.replayPackage?.canonicalMatch;
    if (!match || !isVerifiedReplayStatus(match.validationStatus)) return [];
    const matchLabel = [
      match.mapName ? `Map ${match.mapName}` : "Verified match",
      match.finalResult ? `result ${match.finalResult}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const rounds = match.rounds
      .filter((round) => isVerifiedReplayStatus(round.validationStatus))
      .map(
        (round) =>
          `Round ${round.roundIndex + 1}${round.winner ? ` · winner ${round.winner}` : ""}`,
      );
    return [matchLabel, ...rounds];
  });
  const factsSnapshot = {
    recordings: recordings.map((recording) => ({
      id: recording.id,
      name: recording.name,
      durationSeconds: recording.durationSeconds,
    })),
    userConfirmedContext: context,
    verifiedReplaySelections: selectedMatchesAndRounds,
    candidateIds: candidates.map((candidate) => candidate.candidateId),
    unknowns:
      context.length > 0
        ? []
        : ["Project map, operator, side, site, and result are not confirmed."],
  };
  const evidenceSnapshot = {
    candidates,
    sourcePolicy:
      "Only linked local recordings, saved detector evidence, approved review corrections, and verified replay facts are used.",
  };
  return {
    project,
    recordings,
    candidates,
    context,
    selectedMatchesAndRounds,
    factsSnapshot,
    evidenceSnapshot,
  };
}

export async function generateLongFormProduction(
  studioProjectId: string,
  input: unknown,
) {
  const settings = longFormSettingsSchema.parse(input);
  const planning = await loadPlanningContext(studioProjectId);
  const plan = createEvidenceBoundedLongFormPlan({
    projectName: planning.project.name,
    focusAreas: parseJson<string[]>(planning.project.focusAreasJson, []),
    contentInstructions: planning.project.contentInstructions,
    context: planning.context,
    recordings: planning.recordings,
    candidates: planning.candidates,
    selectedMatchesAndRounds: planning.selectedMatchesAndRounds,
    settings,
  });
  const production = await db.$transaction(async (transaction) => {
    const current = await transaction.longFormProduction.upsert({
      where: { studioProjectId },
      create: {
        studioProjectId,
        ...settings,
        currentVersion: 0,
      },
      update: settings,
    });
    const version = current.currentVersion + 1;
    await transaction.longFormProductionRevision.create({
      data: {
        productionId: current.id,
        version,
        reason: version === 1 ? "Initial local plan" : "Regenerated",
        plannerVersion: LONG_FORM_PLANNER_VERSION,
        settingsJson: JSON.stringify(settings),
        planJson: JSON.stringify(plan),
        factsSnapshotJson: JSON.stringify(planning.factsSnapshot),
        evidenceSnapshotJson: JSON.stringify(planning.evidenceSnapshot),
      },
    });
    return transaction.longFormProduction.update({
      where: { id: current.id },
      data: { status: "PLANNED", currentVersion: version },
    });
  });
  return getLongFormProductionState(production.studioProjectId);
}

export async function getLongFormProductionState(studioProjectId: string) {
  const project = await db.studioProject.findUnique({
    where: { id: studioProjectId },
    select: {
      id: true,
      name: true,
      inputs: {
        where: {
          kind: { in: ["PRIMARY_RECORDING", "ADDITIONAL_RECORDING"] },
        },
        orderBy: { sortOrder: "asc" },
        select: {
          kind: true,
          sortOrder: true,
          videoProject: {
            select: { id: true, name: true, durationSeconds: true },
          },
        },
      },
      longFormProduction: {
        include: {
          revisions: { orderBy: { version: "desc" }, take: 30 },
        },
      },
    },
  });
  if (!project) {
    throw new AppError(
      "That Creator Studio project does not exist.",
      404,
      "STUDIO_PROJECT_NOT_FOUND",
    );
  }
  const production = project.longFormProduction;
  return {
    studioProjectId,
    projectName: project.name,
    recordings: project.inputs.flatMap((input) =>
      input.videoProject
        ? [
            {
              id: input.videoProject.id,
              name: input.videoProject.name,
              durationSeconds: input.videoProject.durationSeconds,
              primary: input.kind === "PRIMARY_RECORDING",
            },
          ]
        : [],
    ),
    production: production
      ? {
          id: production.id,
          status: production.status,
          settings: {
            targetDurationSeconds: production.targetDurationSeconds,
            storytellingStyle: production.storytellingStyle,
            energyLevel: production.energyLevel,
            humorLevel: production.humorLevel,
            educationalLevel: production.educationalLevel,
            liveGameplayPercent: production.liveGameplayPercent,
            voiceoverPercent: production.voiceoverPercent,
            matchOrRoundLimit: production.matchOrRoundLimit,
            excludeWeakSections: production.excludeWeakSections,
            includeLosses: production.includeLosses,
            chronologicalOrder: production.chronologicalOrder,
          },
          currentVersion: production.currentVersion,
          currentRevision: production.revisions[0]
            ? {
                id: production.revisions[0].id,
                version: production.revisions[0].version,
                reason: production.revisions[0].reason,
                plannerVersion: production.revisions[0].plannerVersion,
                settings: longFormSettingsSchema.parse(
                  parseJson<unknown>(production.revisions[0].settingsJson, {}),
                ),
                plan: longFormPlanSchema.parse(
                  parseJson<unknown>(production.revisions[0].planJson, {}),
                ),
                factsSnapshot: parseJson<Record<string, unknown>>(
                  production.revisions[0].factsSnapshotJson,
                  {},
                ),
                evidenceSnapshot: parseJson<Record<string, unknown>>(
                  production.revisions[0].evidenceSnapshotJson,
                  {},
                ),
                createdAt: production.revisions[0].createdAt.toISOString(),
              }
            : null,
          versions: production.revisions.map((revision) => ({
            id: revision.id,
            version: revision.version,
            reason: revision.reason,
            plannerVersion: revision.plannerVersion,
            createdAt: revision.createdAt.toISOString(),
          })),
          updatedAt: production.updatedAt.toISOString(),
        }
      : null,
  };
}

export type LongFormProductionState = Awaited<
  ReturnType<typeof getLongFormProductionState>
>;
