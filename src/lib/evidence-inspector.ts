import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { longFormTimelineDocumentSchema } from "@/lib/long-form-timeline-document";
import { timelineDocumentSchema } from "@/lib/timeline-document";

export const SHARED_EVIDENCE_CONTRACT_VERSION = "r6-creator-shared-evidence/v1";

export type SharedEvidenceClass =
  | "VERIFIED_REPLAY_FACT"
  | "DIRECT_VIDEO_OBSERVATION"
  | "TRANSCRIPT_STATEMENT"
  | "USER_CONFIRMED_CONTEXT"
  | "INFERENCE"
  | "CONFLICT"
  | "UNKNOWN";

export type SharedEvidenceStatement = {
  id: string;
  evidenceClass: SharedEvidenceClass;
  sourceArea:
    | "PROJECT"
    | "SYNCHRONIZATION"
    | "CANDIDATE"
    | "SCRIPT"
    | "TIMELINE"
    | "COACHING"
    | "EXPORT";
  sourceLabel: string;
  sourceId: string | null;
  summary: string;
  detail: string | null;
  confidence: number | null;
  videoTimestampSeconds: number | null;
  replayTimestampSeconds: number | null;
  version: string | null;
  corrected: boolean;
  link: string | null;
};

export type WorkflowStep = {
  key: string;
  label: string;
  status: "READY" | "NEEDS_ACTION" | "NOT_APPLICABLE" | "ERROR";
  explanation: string;
  link: string;
};

type CandidateEvidence = {
  source?: string;
  summary?: string;
  timestampSeconds?: number;
  confidence?: number;
  detectorId?: string;
  detectorVersion?: string;
};

function parseUnknown(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseRecord(value: string): Record<string, unknown> {
  const parsed = parseUnknown(value);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function parseStringArray(value: string) {
  const parsed = parseUnknown(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function parseCandidateEvidence(value: string): CandidateEvidence[] {
  const parsed = parseUnknown(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (item): item is CandidateEvidence =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as CandidateEvidence).summary === "string",
  );
}

function summaryFromRecord(value: string, fallback: string) {
  const record = parseRecord(value);
  for (const key of [
    "summary",
    "description",
    "label",
    "event",
    "observation",
    "fact",
  ]) {
    const item = record[key];
    if (typeof item === "string" && item.trim()) return item.trim();
  }
  const readable = Object.entries(record)
    .filter(
      ([, item]) =>
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean",
    )
    .slice(0, 5)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(" · ");
  return readable || fallback;
}

function classFromCoaching(value: string): SharedEvidenceClass {
  if (value === "DIRECT_VIDEO_OBSERVATION") return "DIRECT_VIDEO_OBSERVATION";
  if (value === "REPLAY_CONFIRMED_FACT") return "VERIFIED_REPLAY_FACT";
  if (value === "TRANSCRIPT_EVIDENCE") return "TRANSCRIPT_STATEMENT";
  if (
    value === "USER_CONFIRMED_MAP_CONTEXT" ||
    value === "USER_CONFIRMED_CONTEXT"
  ) {
    return "USER_CONFIRMED_CONTEXT";
  }
  if (value === "INFERENCE") return "INFERENCE";
  if (value === "CONFLICTING_EVIDENCE") return "CONFLICT";
  return "UNKNOWN";
}

function classFromVoiceover(value: string): SharedEvidenceClass {
  if (value === "VERIFIED_REPLAY_FACT") return "VERIFIED_REPLAY_FACT";
  if (value === "VIDEO_OBSERVATION") return "DIRECT_VIDEO_OBSERVATION";
  if (value === "TRANSCRIPT_STATEMENT") return "TRANSCRIPT_STATEMENT";
  if (value === "USER_CONFIRMED_CONTEXT") return "USER_CONFIRMED_CONTEXT";
  if (value === "INFERENCE") return "INFERENCE";
  return "UNKNOWN";
}

export function normalizeSharedEvidenceClass(
  source: "COACHING" | "VOICEOVER",
  sourceClass: string,
): SharedEvidenceClass {
  return source === "COACHING"
    ? classFromCoaching(sourceClass)
    : classFromVoiceover(sourceClass);
}

function statement(
  input: Omit<SharedEvidenceStatement, "id"> & { id?: string },
): SharedEvidenceStatement {
  return {
    id:
      input.id ??
      `${input.sourceArea.toLowerCase()}-${input.sourceId ?? "boundary"}-${Math.random().toString(36).slice(2)}`,
    evidenceClass: input.evidenceClass,
    sourceArea: input.sourceArea,
    sourceLabel: input.sourceLabel,
    sourceId: input.sourceId,
    summary: input.summary,
    detail: input.detail,
    confidence: input.confidence,
    videoTimestampSeconds: input.videoTimestampSeconds,
    replayTimestampSeconds: input.replayTimestampSeconds,
    version: input.version,
    corrected: input.corrected,
    link: input.link,
  };
}

export async function getProjectEvidenceInspector(studioProjectId: string) {
  const project = await db.studioProject.findUnique({
    where: { id: studioProjectId },
    include: {
      map: { select: { name: true } },
      mapVersion: { select: { versionName: true } },
      bombSite: { select: { displayName: true } },
      operator: { select: { displayName: true } },
      operatorVersion: { select: { versionName: true } },
      inputs: {
        orderBy: { sortOrder: "asc" },
        include: {
          videoProject: {
            include: {
              transcriptionJobs: {
                where: { status: "COMPLETED" },
                orderBy: { completedAt: "desc" },
                take: 1,
                include: { segments: { orderBy: { segmentOrder: "asc" } } },
              },
            },
          },
          replayPackage: {
            include: {
              canonicalMatch: {
                include: {
                  events: {
                    include: {
                      actorPlayer: { select: { privacyAlias: true } },
                      targetPlayer: { select: { privacyAlias: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      synchronizations: {
        orderBy: { version: "desc" },
        include: { anchors: { orderBy: { sortOrder: "asc" } } },
      },
      candidateMoments: { orderBy: { contentPotentialScore: "desc" } },
      shortFormProduction: {
        include: {
          revisions: { orderBy: { version: "desc" }, take: 1 },
          timeline: {
            include: {
              revisions: { orderBy: { version: "desc" }, take: 1 },
              exportJobs: {
                where: { status: "COMPLETED" },
                orderBy: { createdAt: "desc" },
              },
            },
          },
        },
      },
      longFormProduction: {
        include: {
          revisions: { orderBy: { version: "desc" }, take: 1 },
          timeline: {
            include: {
              revisions: { orderBy: { version: "desc" }, take: 1 },
              renderJobs: {
                where: { status: "COMPLETED" },
                orderBy: { createdAt: "desc" },
              },
            },
          },
        },
      },
      voiceoverProduction: {
        include: {
          facts: { orderBy: { createdAt: "asc" } },
          scriptRevisions: { orderBy: { version: "desc" }, take: 1 },
          takes: true,
        },
      },
      coachingAnalyses: { orderBy: { createdAt: "desc" } },
      coachingFindings: {
        orderBy: { createdAt: "desc" },
        include: { evidence: { orderBy: { createdAt: "asc" } } },
      },
      coachingReports: {
        orderBy: { version: "desc" },
        include: { exports: true },
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
  const statements: SharedEvidenceStatement[] = [];
  let sequence = 0;
  const add = (input: Omit<SharedEvidenceStatement, "id">) => {
    sequence += 1;
    statements.push(
      statement({
        ...input,
        id: `evidence-${sequence.toString().padStart(5, "0")}`,
      }),
    );
  };
  const primaryRecording = project.inputs.find(
    (input) => input.kind === "PRIMARY_RECORDING",
  )?.videoProject;
  const replay = project.inputs.find((input) => input.kind === "MATCH_REPLAY")
    ?.replayPackage?.canonicalMatch;

  if (project.contextUserConfirmed) {
    for (const summary of [
      project.map ? `Map: ${project.map.name}` : null,
      project.mapVersion
        ? `Map version: ${project.mapVersion.versionName}`
        : null,
      project.bombSite ? `Bomb site: ${project.bombSite.displayName}` : null,
      project.side !== "UNKNOWN" ? `Side: ${project.side.toLowerCase()}` : null,
      project.operator ? `Operator: ${project.operator.displayName}` : null,
      project.operatorVersion
        ? `Operator version: ${project.operatorVersion.versionName}`
        : null,
      project.roundResult ? `Round result: ${project.roundResult}` : null,
    ].filter((item): item is string => Boolean(item))) {
      add({
        evidenceClass: "USER_CONFIRMED_CONTEXT",
        sourceArea: "PROJECT",
        sourceLabel: "Project context",
        sourceId: project.id,
        summary,
        detail: "Explicitly confirmed in the local project setup.",
        confidence: 1,
        videoTimestampSeconds: null,
        replayTimestampSeconds: null,
        version: "u1-unified-project-context-v1",
        corrected: false,
        link: `/studio/${project.id}/edit`,
      });
    }
  } else {
    add({
      evidenceClass: "UNKNOWN",
      sourceArea: "PROJECT",
      sourceLabel: "Project context boundary",
      sourceId: project.id,
      summary:
        "Map, side, bomb site, operator, and result are not all user-confirmed.",
      detail:
        "Writing, timelines, and coaching must not convert unconfirmed project fields into facts.",
      confidence: null,
      videoTimestampSeconds: null,
      replayTimestampSeconds: null,
      version: "u1-unified-project-context-v1",
      corrected: false,
      link: `/studio/${project.id}/edit`,
    });
  }

  if (replay) {
    add({
      evidenceClass: "VERIFIED_REPLAY_FACT",
      sourceArea: "PROJECT",
      sourceLabel: "Canonical Match Replay",
      sourceId: replay.id,
      summary: `${replay.mapName ?? "Unknown map"} · ${replay.gameMode ?? "Unknown mode"} · ${replay.events.length} canonical events`,
      detail: `${replay.validationStatus} · ${replay.confidenceStatus}. Unsupported fields remain unavailable.`,
      confidence: replay.validationStatus === "VALIDATED" ? 1 : null,
      videoTimestampSeconds: null,
      replayTimestampSeconds: null,
      version: `${replay.sourceProviderId}@${replay.sourceProviderVersion}`,
      corrected: Boolean(replay.userCorrectionJson),
      link: project.inputs.find((input) => input.kind === "MATCH_REPLAY")
        ?.replayPackageId
        ? `/replays/${project.inputs.find((input) => input.kind === "MATCH_REPLAY")!.replayPackageId}`
        : null,
    });
  }

  for (const sync of project.synchronizations) {
    for (const anchor of sync.anchors) {
      add({
        evidenceClass: "DIRECT_VIDEO_OBSERVATION",
        sourceArea: "SYNCHRONIZATION",
        sourceLabel: `Synchronization v${sync.version} video anchor`,
        sourceId: anchor.id,
        summary: summaryFromRecord(anchor.videoObservationJson, anchor.label),
        detail: `Video timestamp ${anchor.videoTimestampSeconds.toFixed(3)}s`,
        confidence: anchor.confidence,
        videoTimestampSeconds: anchor.videoTimestampSeconds,
        replayTimestampSeconds: null,
        version: sync.mappingAlgorithmVersion,
        corrected: Boolean(sync.basedOnVersionId),
        link: `/studio/${project.id}/sync`,
      });
      add({
        evidenceClass: "VERIFIED_REPLAY_FACT",
        sourceArea: "SYNCHRONIZATION",
        sourceLabel: `Synchronization v${sync.version} replay anchor`,
        sourceId: anchor.id,
        summary: summaryFromRecord(anchor.replayFactJson, anchor.label),
        detail: `Replay timestamp ${anchor.replayTimestampSeconds.toFixed(3)}s · ${anchor.userConfirmed ? "user-confirmed match" : "not user-confirmed"}`,
        confidence: anchor.confidence,
        videoTimestampSeconds: null,
        replayTimestampSeconds: anchor.replayTimestampSeconds,
        version: sync.mappingAlgorithmVersion,
        corrected: Boolean(sync.basedOnVersionId),
        link: `/studio/${project.id}/sync`,
      });
      add({
        evidenceClass: "INFERENCE",
        sourceArea: "SYNCHRONIZATION",
        sourceLabel: `Synchronization v${sync.version} alignment`,
        sourceId: anchor.id,
        summary: summaryFromRecord(
          anchor.alignmentInferenceJson,
          "The video observation and replay fact may correspond.",
        ),
        detail:
          sync.status === "VERIFIED"
            ? `Verified mapping · residual ${anchor.residualSeconds?.toFixed(3) ?? "unavailable"}s`
            : "Draft mapping; do not apply automatically.",
        confidence: sync.confidence,
        videoTimestampSeconds: anchor.videoTimestampSeconds,
        replayTimestampSeconds: anchor.replayTimestampSeconds,
        version: sync.mappingAlgorithmVersion,
        corrected: Boolean(sync.basedOnVersionId),
        link: `/studio/${project.id}/sync`,
      });
    }
    for (const conflict of parseStringArray(sync.conflictingEvidenceJson)) {
      add({
        evidenceClass: "CONFLICT",
        sourceArea: "SYNCHRONIZATION",
        sourceLabel: `Synchronization v${sync.version}`,
        sourceId: sync.id,
        summary: conflict,
        detail: null,
        confidence: sync.confidence,
        videoTimestampSeconds: null,
        replayTimestampSeconds: null,
        version: sync.mappingAlgorithmVersion,
        corrected: Boolean(sync.basedOnVersionId),
        link: `/studio/${project.id}/sync`,
      });
    }
    for (const missing of parseStringArray(sync.missingEvidenceJson)) {
      add({
        evidenceClass: "UNKNOWN",
        sourceArea: "SYNCHRONIZATION",
        sourceLabel: `Synchronization v${sync.version}`,
        sourceId: sync.id,
        summary: missing,
        detail: null,
        confidence: null,
        videoTimestampSeconds: null,
        replayTimestampSeconds: null,
        version: sync.mappingAlgorithmVersion,
        corrected: Boolean(sync.basedOnVersionId),
        link: `/studio/${project.id}/sync`,
      });
    }
  }

  for (const candidate of project.candidateMoments) {
    for (const [evidenceClass, source, value] of [
      [
        "DIRECT_VIDEO_OBSERVATION",
        "Video candidate evidence",
        candidate.videoEvidenceJson,
      ],
      [
        "TRANSCRIPT_STATEMENT",
        "Transcript candidate evidence",
        candidate.transcriptEvidenceJson,
      ],
      [
        "VERIFIED_REPLAY_FACT",
        "Replay candidate evidence",
        candidate.replayEvidenceJson,
      ],
    ] as const) {
      for (const item of parseCandidateEvidence(value)) {
        add({
          evidenceClass,
          sourceArea: "CANDIDATE",
          sourceLabel: source,
          sourceId: candidate.id,
          summary: item.summary ?? candidate.explanation,
          detail: `${candidate.mainEvent} · Event confidence ${(candidate.eventConfidence * 100).toFixed(0)}% · Content Potential ${candidate.contentPotentialScore.toFixed(0)}`,
          confidence: item.confidence ?? candidate.eventConfidence,
          videoTimestampSeconds:
            typeof item.timestampSeconds === "number"
              ? item.timestampSeconds
              : candidate.peakSeconds,
          replayTimestampSeconds: null,
          version:
            item.detectorId && item.detectorVersion
              ? `${item.detectorId}@${item.detectorVersion}`
              : candidate.fusionVersion,
          corrected: candidate.updatedAt > candidate.createdAt,
          link: `/studio/${project.id}/shorts`,
        });
      }
    }
    for (const missing of parseStringArray(candidate.missingEvidenceJson)) {
      add({
        evidenceClass: "UNKNOWN",
        sourceArea: "CANDIDATE",
        sourceLabel: "Candidate missing evidence",
        sourceId: candidate.id,
        summary: missing,
        detail: candidate.mainEvent,
        confidence: null,
        videoTimestampSeconds: candidate.peakSeconds,
        replayTimestampSeconds: null,
        version: candidate.fusionVersion,
        corrected: candidate.updatedAt > candidate.createdAt,
        link: `/studio/${project.id}/shorts`,
      });
    }
  }

  for (const fact of project.voiceoverProduction?.facts ?? []) {
    add({
      evidenceClass: normalizeSharedEvidenceClass("VOICEOVER", fact.category),
      sourceArea: "SCRIPT",
      sourceLabel: "Voiceover Facts Review",
      sourceId: fact.id,
      summary:
        fact.userConfirmed && fact.correction ? fact.correction : fact.summary,
      detail:
        fact.userConfirmed && fact.correction
          ? `Corrected from: ${fact.summary}`
          : "Saved script evidence boundary.",
      confidence: fact.confidence,
      videoTimestampSeconds: fact.timestampSeconds,
      replayTimestampSeconds: null,
      version:
        project.voiceoverProduction?.scriptRevisions[0]?.providerVersion ??
        "u5-voiceover-facts-v1",
      corrected: Boolean(fact.correction),
      link: `/studio/${project.id}/voiceover`,
    });
  }

  const shortTimeline =
    project.shortFormProduction?.timeline?.revisions[0]?.documentJson;
  const parsedShort = shortTimeline
    ? timelineDocumentSchema.safeParse(parseUnknown(shortTimeline))
    : null;
  if (parsedShort?.success) {
    const revision = project.shortFormProduction!.timeline!.revisions[0]!;
    for (const item of parsedShort.data.items) {
      add({
        evidenceClass: "USER_CONFIRMED_CONTEXT",
        sourceArea: "TIMELINE",
        sourceLabel: `Short timeline v${revision.version}`,
        sourceId: item.id,
        summary:
          item.kind === "SOURCE_VIDEO"
            ? `Saved source range ${item.sourceStartSeconds?.toFixed(2)}–${item.sourceEndSeconds?.toFixed(2)}s`
            : `${item.kind.toLowerCase().replaceAll("_", " ")}: ${item.text ?? "local media item"}`,
        detail:
          "This records an explicit saved edit choice; it does not prove the meaning of the footage.",
        confidence: 1,
        videoTimestampSeconds: item.sourceStartSeconds,
        replayTimestampSeconds: null,
        version: parsedShort.data.version,
        corrected: revision.version > 1,
        link: `/studio/${project.id}/shorts`,
      });
    }
  }

  const longTimeline =
    project.longFormProduction?.timeline?.revisions[0]?.documentJson;
  const parsedLong = longTimeline
    ? longFormTimelineDocumentSchema.safeParse(parseUnknown(longTimeline))
    : null;
  if (parsedLong?.success) {
    const revision = project.longFormProduction!.timeline!.revisions[0]!;
    for (const section of parsedLong.data.sections) {
      add({
        evidenceClass: "INFERENCE",
        sourceArea: "TIMELINE",
        sourceLabel: `Long-form section v${revision.version}`,
        sourceId: section.id,
        summary: `${section.title}: ${section.reason}`,
        detail:
          "A story/editor plan is an editorial inference, not a gameplay fact.",
        confidence: null,
        videoTimestampSeconds: null,
        replayTimestampSeconds: null,
        version: parsedLong.data.version,
        corrected: revision.version > 1,
        link: `/studio/${project.id}/long-form`,
      });
      for (const evidence of section.evidence) {
        add({
          evidenceClass: "DIRECT_VIDEO_OBSERVATION",
          sourceArea: "TIMELINE",
          sourceLabel: `Long-form section evidence · ${section.title}`,
          sourceId: section.id,
          summary: evidence,
          detail: "Saved supporting evidence from the local long-form plan.",
          confidence: null,
          videoTimestampSeconds: null,
          replayTimestampSeconds: null,
          version: parsedLong.data.version,
          corrected: revision.version > 1,
          link: `/studio/${project.id}/long-form`,
        });
      }
      for (const warning of section.warnings) {
        add({
          evidenceClass: "UNKNOWN",
          sourceArea: "TIMELINE",
          sourceLabel: `Long-form section boundary · ${section.title}`,
          sourceId: section.id,
          summary: warning,
          detail: null,
          confidence: null,
          videoTimestampSeconds: null,
          replayTimestampSeconds: null,
          version: parsedLong.data.version,
          corrected: revision.version > 1,
          link: `/studio/${project.id}/long-form`,
        });
      }
    }
  }

  for (const finding of project.coachingFindings) {
    for (const evidence of finding.evidence) {
      add({
        evidenceClass: normalizeSharedEvidenceClass(
          "COACHING",
          evidence.evidenceClass,
        ),
        sourceArea: "COACHING",
        sourceLabel: finding.category.replaceAll("_", " "),
        sourceId: finding.id,
        summary: evidence.summary,
        detail: `${finding.decision} · ${finding.severity} severity · ${finding.explanation}`,
        confidence: evidence.confidence ?? finding.confidence,
        videoTimestampSeconds: evidence.videoTimestampSeconds,
        replayTimestampSeconds: evidence.replayTimestampSeconds,
        version: finding.analysisVersion,
        corrected:
          finding.category !== finding.originalCategory ||
          finding.severity !== finding.originalSeverity ||
          finding.videoTimestampSeconds !==
            finding.originalVideoTimestampSeconds,
        link: `/studio/${project.id}/coaching`,
      });
    }
  }

  const shortExports = project.shortFormProduction?.timeline?.exportJobs ?? [];
  for (const exportJob of shortExports) {
    add({
      evidenceClass: "DIRECT_VIDEO_OBSERVATION",
      sourceArea: "EXPORT",
      sourceLabel: "Completed short-form export",
      sourceId: exportJob.id,
      summary: `${exportJob.width ?? "?"}×${exportJob.height ?? "?"} H.264/AAC MP4 · ${exportJob.durationSeconds?.toFixed(3) ?? "unknown"} seconds`,
      detail: exportJob.outputFilename,
      confidence: 1,
      videoTimestampSeconds: null,
      replayTimestampSeconds: null,
      version: exportJob.pipelineVersion,
      corrected: false,
      link: `/studio/${project.id}/shorts`,
    });
  }
  const longExports =
    project.longFormProduction?.timeline?.renderJobs.filter(
      (job) => job.kind === "EXPORT",
    ) ?? [];
  for (const exportJob of longExports) {
    add({
      evidenceClass: "DIRECT_VIDEO_OBSERVATION",
      sourceArea: "EXPORT",
      sourceLabel: "Completed long-form export",
      sourceId: exportJob.id,
      summary: `${exportJob.width ?? "?"}×${exportJob.height ?? "?"} H.264/AAC MP4 · ${exportJob.durationSeconds?.toFixed(3) ?? "unknown"} seconds`,
      detail: exportJob.outputFilename,
      confidence: 1,
      videoTimestampSeconds: null,
      replayTimestampSeconds: null,
      version: exportJob.pipelineVersion,
      corrected: false,
      link: `/studio/${project.id}/long-form`,
    });
  }
  for (const report of project.coachingReports) {
    add({
      evidenceClass: "USER_CONFIRMED_CONTEXT",
      sourceArea: "EXPORT",
      sourceLabel: `Coaching report v${report.version}`,
      sourceId: report.id,
      summary: `${report.exports.length} checksummed export format${report.exports.length === 1 ? "" : "s"} · ${report.reason}`,
      detail:
        "Immutable AI-assisted replay and POV review snapshot; it does not replace a professional coach.",
      confidence: 1,
      videoTimestampSeconds: null,
      replayTimestampSeconds: null,
      version: report.reportVersion,
      corrected: report.version > 1,
      link: `/studio/${project.id}/coaching/reports/${report.id}`,
    });
  }

  const hasRecording = Boolean(primaryRecording);
  const hasReplay = Boolean(replay);
  const latestSync = project.synchronizations[0] ?? null;
  const transcript = primaryRecording?.transcriptionJobs[0] ?? null;
  const completedCoaching = project.coachingAnalyses.some(
    (analysis) => analysis.status === "COMPLETED",
  );
  const workflow: WorkflowStep[] = [
    {
      key: "inputs",
      label: "Inputs",
      status: "READY",
      explanation: `${project.inputs.length} linked source${project.inputs.length === 1 ? "" : "s"} saved locally.`,
      link: `/studio/${project.id}`,
    },
    {
      key: "synchronization",
      label: "Synchronization",
      status:
        hasRecording && hasReplay
          ? latestSync?.status === "VERIFIED"
            ? "READY"
            : "NEEDS_ACTION"
          : "NOT_APPLICABLE",
      explanation:
        hasRecording && hasReplay
          ? latestSync?.status === "VERIFIED"
            ? `Verified version ${latestSync.version} with ${latestSync.anchors.length} anchors.`
            : "Combined evidence needs a verified synchronization before replay facts are aligned to video."
          : "Synchronization requires both a recording and Match Replay.",
      link: `/studio/${project.id}/sync`,
    },
    {
      key: "transcript",
      label: "Transcript",
      status: hasRecording
        ? transcript
          ? "READY"
          : "NEEDS_ACTION"
        : "NOT_APPLICABLE",
      explanation: transcript
        ? `${transcript.segments.length} saved selected-track transcript lines.`
        : hasRecording
          ? "No completed selected-track transcript is available."
          : "Replay-only projects have no audio.",
      link: primaryRecording
        ? `/projects/${primaryRecording.id}#transcription`
        : `/studio/${project.id}`,
    },
    {
      key: "candidates",
      label: "Candidate moments",
      status: hasRecording
        ? project.candidateMoments.length
          ? "READY"
          : "NEEDS_ACTION"
        : "NOT_APPLICABLE",
      explanation: `${project.candidateMoments.length} saved evidence-supported candidate${project.candidateMoments.length === 1 ? "" : "s"}.`,
      link: `/studio/${project.id}/shorts`,
    },
    {
      key: "story",
      label: "Story and script",
      status: project.shortFormProduction?.revisions.length
        ? "READY"
        : hasRecording
          ? "NEEDS_ACTION"
          : "NOT_APPLICABLE",
      explanation: project.shortFormProduction?.revisions.length
        ? `Short-form story version ${project.shortFormProduction.revisions[0]!.version} is saved.`
        : "No short-form story revision is saved.",
      link: `/studio/${project.id}/shorts`,
    },
    {
      key: "editor",
      label: "Editor timeline",
      status:
        parsedShort?.success || parsedLong?.success
          ? "READY"
          : hasRecording
            ? "NEEDS_ACTION"
            : "NOT_APPLICABLE",
      explanation:
        parsedShort?.success || parsedLong?.success
          ? "At least one immutable editor revision is saved."
          : "No saved short- or long-form editor revision is available.",
      link: `/studio/${project.id}/shorts`,
    },
    {
      key: "voiceover",
      label: "Voiceover",
      status: project.voiceoverProduction?.scriptRevisions.length
        ? "READY"
        : "NEEDS_ACTION",
      explanation: project.voiceoverProduction?.scriptRevisions.length
        ? `${project.voiceoverProduction.takes.length} local narration take${project.voiceoverProduction.takes.length === 1 ? "" : "s"} and a saved script revision are available.`
        : "No evidence-bounded Voiceover Studio script is saved.",
      link: `/studio/${project.id}/voiceover`,
    },
    {
      key: "coaching",
      label: "Coaching",
      status: completedCoaching ? "READY" : "NEEDS_ACTION",
      explanation: completedCoaching
        ? `${project.coachingFindings.length} inspectable finding${project.coachingFindings.length === 1 ? "" : "s"} are saved.`
        : "No completed Coaching Lab analysis is available.",
      link: `/studio/${project.id}/coaching`,
    },
    {
      key: "exports",
      label: "Exports",
      status:
        shortExports.length ||
        longExports.length ||
        project.coachingReports.some((report) => report.exports.length)
          ? "READY"
          : "NEEDS_ACTION",
      explanation: `${shortExports.length} short MP4 · ${longExports.length} long MP4 · ${project.coachingReports.reduce((total, report) => total + report.exports.length, 0)} coaching report exports.`,
      link: hasRecording
        ? `/studio/${project.id}/shorts`
        : `/studio/${project.id}/coaching`,
    },
  ];

  return {
    contractVersion: SHARED_EVIDENCE_CONTRACT_VERSION,
    project: {
      id: project.id,
      name: project.name,
      inputMode: project.inputMode,
    },
    statementCounts: Object.fromEntries(
      (
        [
          "VERIFIED_REPLAY_FACT",
          "DIRECT_VIDEO_OBSERVATION",
          "TRANSCRIPT_STATEMENT",
          "USER_CONFIRMED_CONTEXT",
          "INFERENCE",
          "CONFLICT",
          "UNKNOWN",
        ] satisfies SharedEvidenceClass[]
      ).map((evidenceClass) => [
        evidenceClass,
        statements.filter((item) => item.evidenceClass === evidenceClass)
          .length,
      ]),
    ),
    statements,
    workflow,
    generatedAt: new Date().toISOString(),
  };
}

export type ProjectEvidenceInspectorState = Awaited<
  ReturnType<typeof getProjectEvidenceInspector>
>;
