import type {
  CanonicalEventCategory,
  CoachingEvidenceClass,
  CoachingFindingCategory,
  CoachingFindingSeverity,
  StudioInputMode,
} from "@prisma/client";
import { z } from "zod";

import {
  COACHING_RULE_SET_VERSION,
  summarizeCanonicalEvent,
} from "@/lib/coaching";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const COACHING_AUTOMATIC_ANALYSIS_VERSION =
  "u6-local-coaching-analysis-v1";

export const COACHING_ANALYSIS_RULES: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  requiredInput: "recording" | "replay" | "combined";
  reliability: "bounded" | "experimental" | "unsupported-without-evidence";
}> = [
  {
    id: "recording.signal-review",
    name: "Local signal review",
    description:
      "Surfaces high-confidence motion, scene, audio, and transcript measurements without treating them as tactical proof.",
    requiredInput: "recording",
    reliability: "bounded",
  },
  {
    id: "recording.transcript-review",
    name: "Transcript support",
    description:
      "Surfaces selected-track statements as supporting review evidence only.",
    requiredInput: "recording",
    reliability: "bounded",
  },
  {
    id: "replay.selected-player-events",
    name: "Selected-player replay outcomes",
    description:
      "Surfaces validated kill feedback, inferred target deaths, headshot flags, and defuser feedback involving the selected player.",
    requiredInput: "replay",
    reliability: "bounded",
  },
  {
    id: "replay.trade-timing",
    name: "Trade timing review",
    description:
      "Requires player teams and elapsed event timestamps. Spatial opportunity remains unknown without positions.",
    requiredInput: "replay",
    reliability: "unsupported-without-evidence",
  },
  {
    id: "combined.verified-sync",
    name: "Verified replay/video alignment",
    description:
      "Maps only user-confirmed replay anchors through a verified synchronization version.",
    requiredInput: "combined",
    reliability: "experimental",
  },
];

const ruleIds = COACHING_ANALYSIS_RULES.map((rule) => rule.id);

export const startCoachingAnalysisSchema = z
  .object({
    enabledRuleIds: z
      .array(z.string().trim().min(1).max(120))
      .max(20)
      .default([...ruleIds]),
  })
  .strict()
  .superRefine((value, context) => {
    value.enabledRuleIds.forEach((id, index) => {
      if (!ruleIds.includes(id)) {
        context.addIssue({
          code: "custom",
          path: ["enabledRuleIds", index],
          message: `Unknown coaching rule: ${id}`,
        });
      }
    });
    if (new Set(value.enabledRuleIds).size !== value.enabledRuleIds.length) {
      context.addIssue({
        code: "custom",
        path: ["enabledRuleIds"],
        message: "Choose each coaching rule only once.",
      });
    }
  });

type FindingEvidenceDraft = {
  evidenceClass: CoachingEvidenceClass;
  summary: string;
  sourceType: string;
  sourceId?: string;
  videoTimestampSeconds?: number;
  replayTimestampSeconds?: number;
  confidence?: number;
  observation?: Record<string, unknown>;
  inference?: Record<string, unknown>;
};

type FindingDraft = {
  canonicalRoundId?: string;
  canonicalEventId?: string;
  roundIndex?: number;
  videoTimestampSeconds?: number;
  replayTimestampSeconds?: number;
  category: CoachingFindingCategory;
  severity: CoachingFindingSeverity;
  confidence: number;
  directObservations: string[];
  replayFacts: string[];
  transcriptEvidence: string[];
  mapEvidence: string[];
  conflictingEvidence: string[];
  missingContext: string[];
  explanation: string;
  alternatives: string[];
  detectorVersions: Record<string, string | number | null>;
  evidence: FindingEvidenceDraft[];
};

export type CoachingRuleResult = {
  findings: FindingDraft[];
  warnings: string[];
};

export type IsolatedCoachingRule<TContext> = {
  id: string;
  run: (context: TContext) => Promise<CoachingRuleResult> | CoachingRuleResult;
};

export async function runCoachingRulesIsolated<TContext>(
  rules: ReadonlyArray<IsolatedCoachingRule<TContext>>,
  context: TContext,
) {
  const findings: FindingDraft[] = [];
  const warnings: string[] = [];
  const failures: Array<{ ruleId: string; message: string }> = [];
  for (const rule of rules) {
    try {
      const result = await rule.run(context);
      findings.push(...result.findings);
      warnings.push(...result.warnings);
    } catch (error) {
      failures.push({
        ruleId: rule.id,
        message:
          error instanceof Error
            ? error.message
            : "The coaching rule failed without a readable error.",
      });
    }
  }
  return { findings, warnings, failures };
}

export function isPossibleEarlyRoundDeath(input: {
  category: CanonicalEventCategory;
  selectedPlayerIsTarget: boolean;
  roundClockSecondsRemaining: number | null;
}) {
  return (
    input.category === "KILL" &&
    input.selectedPlayerIsTarget &&
    input.roundClockSecondsRemaining != null &&
    input.roundClockSecondsRemaining >= 150
  );
}

type TradeEvent = {
  id: string;
  timestampSeconds: number | null;
  actorTeamIndex: number | null;
  targetTeamIndex: number | null;
  actorIsSelectedPlayer: boolean;
  targetIsSelectedPlayer: boolean;
};

export function assessTradeTiming(
  events: TradeEvent[],
  maximumWindowSeconds = 5,
) {
  const timed = events
    .filter(
      (
        event,
      ): event is TradeEvent & {
        timestampSeconds: number;
      } => event.timestampSeconds != null,
    )
    .sort((first, second) => first.timestampSeconds - second.timestampSeconds);
  const opportunities: Array<{
    teammateDeathEventId: string;
    responseEventId: string;
    responseSeconds: number;
    selectedPlayerResponse: boolean;
    spatialOpportunityKnown: false;
  }> = [];
  for (let index = 0; index < timed.length; index += 1) {
    const first = timed[index];
    if (!first || first.actorTeamIndex == null || first.targetTeamIndex == null)
      continue;
    for (let nextIndex = index + 1; nextIndex < timed.length; nextIndex += 1) {
      const next = timed[nextIndex];
      if (!next) continue;
      const responseSeconds = next.timestampSeconds - first.timestampSeconds;
      if (responseSeconds > maximumWindowSeconds) break;
      const reversesTeams =
        next.actorTeamIndex === first.targetTeamIndex &&
        next.targetTeamIndex === first.actorTeamIndex;
      if (!reversesTeams) continue;
      opportunities.push({
        teammateDeathEventId: first.id,
        responseEventId: next.id,
        responseSeconds,
        selectedPlayerResponse: next.actorIsSelectedPlayer,
        spatialOpportunityKnown: false,
      });
    }
  }
  return {
    opportunities,
    missingEvidence:
      timed.length < events.length
        ? "One or more replay events lack elapsed timestamps."
        : null,
    limitation:
      "Event order and team relationships do not establish distance, line of sight, cover, or a real trade opportunity.",
  };
}

type AnalysisContext = Awaited<ReturnType<typeof loadAnalysisContext>>;

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseStringArray(value: string) {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberField(value: unknown, key: string) {
  return isRecord(value) && typeof value[key] === "number" ? value[key] : null;
}

function selectedPlayerRelation(
  stableId: string | null,
  event: {
    actorPlayer: { stableId: string; teamIndex: number | null } | null;
    targetPlayer: { stableId: string; teamIndex: number | null } | null;
  },
) {
  return {
    actor: Boolean(stableId && event.actorPlayer?.stableId === stableId),
    target: Boolean(stableId && event.targetPlayer?.stableId === stableId),
  };
}

async function loadAnalysisContext(studioProjectId: string) {
  const project = await db.studioProject.findUnique({
    where: { id: studioProjectId },
    include: {
      inputs: {
        orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
        include: {
          videoProject: {
            include: {
              analysisJobs: {
                where: { status: "COMPLETED" },
                orderBy: { completedAt: "desc" },
                take: 1,
                include: {
                  detectorRuns: {
                    where: { status: "COMPLETED" },
                    include: {
                      events: {
                        include: { evidence: true },
                        orderBy: { peakSeconds: "asc" },
                      },
                    },
                  },
                },
              },
              transcriptionJobs: {
                where: { status: "COMPLETED" },
                orderBy: { completedAt: "desc" },
                take: 1,
                include: {
                  segments: { orderBy: { startSeconds: "asc" } },
                },
              },
            },
          },
          replayPackage: {
            include: {
              capabilities: true,
              canonicalMatch: {
                include: {
                  rounds: { orderBy: { roundIndex: "asc" } },
                  events: {
                    include: {
                      round: true,
                      actorPlayer: {
                        select: { stableId: true, teamIndex: true },
                      },
                      targetPlayer: {
                        select: { stableId: true, teamIndex: true },
                      },
                    },
                    orderBy: [
                      { round: { roundIndex: "asc" } },
                      { timestampSeconds: "asc" },
                      { createdAt: "asc" },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      synchronizations: {
        where: { status: "VERIFIED" },
        orderBy: { version: "desc" },
        take: 1,
        include: {
          anchors: {
            where: { userConfirmed: true, matchStatus: "MATCHED" },
            orderBy: { sortOrder: "asc" },
          },
        },
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
  const replay = project.inputs.find(
    (input) => input.kind === "MATCH_REPLAY",
  )?.replayPackage;
  return {
    project,
    recording,
    replay,
    match: replay?.canonicalMatch ?? null,
    synchronization: project.synchronizations[0] ?? null,
  };
}

function ruleApplies(
  requiredInput: "recording" | "replay" | "combined",
  context: AnalysisContext,
) {
  if (requiredInput === "recording") return Boolean(context.recording);
  if (requiredInput === "replay") return Boolean(context.match);
  return Boolean(context.recording && context.match);
}

function recordingSignalRule(): IsolatedCoachingRule<AnalysisContext> {
  return {
    id: "recording.signal-review",
    run(context) {
      const job = context.recording?.analysisJobs[0];
      if (!job) {
        return {
          findings: [],
          warnings: [
            "Local signal review was unavailable because the primary recording has no completed detector analysis.",
          ],
        };
      }
      const relevant = job.detectorRuns
        .flatMap((run) =>
          run.events.map((event) => ({
            run,
            event,
          })),
        )
        .filter(
          ({ event }) =>
            event.confidence >= 0.65 &&
            !/SUSTAINED_LOW_ACTION|MINOR_SCENE_CHANGE/i.test(event.eventType),
        )
        .sort(
          (first, second) => second.event.confidence - first.event.confidence,
        );
      const spaced: typeof relevant = [];
      for (const item of relevant) {
        if (
          spaced.every(
            (existing) =>
              Math.abs(existing.event.peakSeconds - item.event.peakSeconds) >=
              20,
          )
        ) {
          spaced.push(item);
        }
        if (spaced.length >= 5) break;
      }
      return {
        warnings: [
          "Local signal findings identify measured activity for review; they do not confirm a tactical event or coaching mistake.",
        ],
        findings: spaced.map(({ run, event }) => {
          const observation = `${run.detectorStableId}@${run.detectorVersion} measured ${event.eventType.toLowerCase().replaceAll("_", " ")} from ${event.startSeconds.toFixed(2)}s to ${event.endSeconds.toFixed(2)}s with ${Math.round(event.confidence * 100)}% detector confidence.`;
          const missing = [
            "No tactical event, threat, player intention, exact room, or mechanical cause is confirmed by this signal.",
          ];
          return {
            videoTimestampSeconds: event.peakSeconds,
            category: "REVIEW_RECOMMENDED",
            severity: "LOW",
            confidence: Math.min(0.7, event.confidence * 0.75),
            directObservations: [observation],
            replayFacts: [],
            transcriptEvidence: [],
            mapEvidence: [],
            conflictingEvidence: parseStringArray(
              event.conflictingEvidenceJson,
            ),
            missingContext: missing,
            explanation:
              "This measured local signal may help prioritize POV review. It is not a tactical diagnosis.",
            alternatives: [
              "Menus, edits, camera movement, game audio, or routine action can produce similar detector signals.",
            ],
            detectorVersions: {
              [run.detectorStableId]: run.detectorVersion,
            },
            evidence: [
              {
                evidenceClass: "DIRECT_VIDEO_OBSERVATION",
                summary: observation,
                sourceType: "LOCAL_DETECTOR_EVENT",
                sourceId: event.id,
                videoTimestampSeconds: event.peakSeconds,
                confidence: event.confidence,
                observation: {
                  eventType: event.eventType,
                  rawMeasurements: parseJson(event.rawMeasurementsJson),
                  thresholds: parseJson(event.thresholdsJson),
                },
              },
              {
                evidenceClass: "MISSING_CONTEXT",
                summary: missing[0] ?? "Tactical context is missing.",
                sourceType: "CAPABILITY_BOUNDARY",
              },
            ],
          } satisfies FindingDraft;
        }),
      };
    },
  };
}

function transcriptRule(): IsolatedCoachingRule<AnalysisContext> {
  return {
    id: "recording.transcript-review",
    run(context) {
      const segments = context.recording?.transcriptionJobs[0]?.segments ?? [];
      if (segments.length === 0) {
        return {
          findings: [],
          warnings: [
            "Transcript coaching support was unavailable because the primary recording has no completed selected-track transcript.",
          ],
        };
      }
      const useful = segments
        .filter((segment) =>
          /\b(why|how|wait|what|dead|mistake|should|rotate|plant|defus|clutch|sorry|my bad)\b/i.test(
            segment.text,
          ),
        )
        .slice(0, 3);
      return {
        warnings:
          useful.length === 0
            ? [
                "The saved transcript contained no bounded review-rule matches. This does not mean the recording lacks useful coaching moments.",
              ]
            : [],
        findings: useful.map((segment) => {
          const statement = `Transcript at ${segment.startSeconds.toFixed(2)}s: “${segment.text}”`;
          return {
            videoTimestampSeconds: segment.startSeconds,
            category: "REVIEW_RECOMMENDED",
            severity: "INFORMATIONAL",
            confidence: 0.45,
            directObservations: [],
            replayFacts: [],
            transcriptEvidence: [statement],
            mapEvidence: [],
            conflictingEvidence: [],
            missingContext: [
              "Transcript language does not prove that the described gameplay event occurred or identify its exact timestamp.",
            ],
            explanation:
              "This creator statement may help locate a moment for human review. It is supporting evidence only.",
            alternatives: [
              "The statement may refer to an earlier event, a teammate, a hypothetical, or non-gameplay conversation.",
            ],
            detectorVersions: {
              transcriptSupport: "u6-transcript-support-v1",
            },
            evidence: [
              {
                evidenceClass: "TRANSCRIPT_EVIDENCE",
                summary: statement,
                sourceType: "TRANSCRIPT_SEGMENT",
                sourceId: segment.id,
                videoTimestampSeconds: segment.startSeconds,
                confidence: 0.45,
                observation: {
                  startSeconds: segment.startSeconds,
                  endSeconds: segment.endSeconds,
                  text: segment.text,
                },
              },
              {
                evidenceClass: "MISSING_CONTEXT",
                summary:
                  "Transcript language does not prove the gameplay event or its exact timestamp.",
                sourceType: "CAPABILITY_BOUNDARY",
              },
            ],
          } satisfies FindingDraft;
        }),
      };
    },
  };
}

function replaySelectedPlayerRule(): IsolatedCoachingRule<AnalysisContext> {
  return {
    id: "replay.selected-player-events",
    run(context) {
      const match = context.match;
      if (!match) return { findings: [], warnings: [] };
      if (!context.project.selectedPlayerStableId) {
        return {
          findings: [],
          warnings: [
            "Replay player coaching was skipped because no privacy-safe replay player is selected.",
          ],
        };
      }
      const relevant = match.events.filter((event) => {
        const relation = selectedPlayerRelation(
          context.project.selectedPlayerStableId,
          event,
        );
        return (
          ["VALIDATED", "USER_CONFIRMED", "USER_CORRECTED"].includes(
            event.validationStatus,
          ) &&
          (relation.actor || relation.target)
        );
      });
      const findings = relevant.slice(0, 24).map((event) => {
        const relation = selectedPlayerRelation(
          context.project.selectedPlayerStableId,
          event,
        );
        const observation = parseJson(event.directObservationJson);
        const roundClockSeconds = numberField(
          observation,
          "roundClockSecondsRemaining",
        );
        const earlyDeath = isPossibleEarlyRoundDeath({
          category: event.category,
          selectedPlayerIsTarget: relation.target,
          roundClockSecondsRemaining: roundClockSeconds,
        });
        const objective =
          relation.actor &&
          ["DEFUSER_PLANT", "DEFUSER_DISABLE"].includes(event.category);
        const category: CoachingFindingCategory = earlyDeath
          ? "EARLY_ROUND_DEATH"
          : objective
            ? "OBJECTIVE_INVOLVEMENT"
            : "REVIEW_RECOMMENDED";
        const fact = summarizeCanonicalEvent(event);
        const inferredDeath =
          event.category === "KILL" && relation.target
            ? "Being the target of direct kill feedback supports a likely death outcome, but the provider produced no independent death-state stream."
            : null;
        const missing = [
          ...parseStringArray(event.missingEvidenceJson),
          "The replay provider does not expose validated position, line of sight, health, weapon, shots, damage, or player-view pixels.",
          ...(inferredDeath
            ? [
                "A separate stable death-state stream was not produced by this provider.",
              ]
            : []),
          ...(earlyDeath
            ? [
                "The label uses an observed round-clock value; a stable elapsed round-start timestamp is unavailable.",
              ]
            : []),
        ];
        const replayConfidence =
          event.confidenceStatus === "VERIFIED"
            ? 1
            : event.confidenceStatus === "HIGH"
              ? 0.9
              : event.confidenceStatus === "MODERATE"
                ? 0.7
                : 0.5;
        return {
          canonicalRoundId: event.roundId ?? undefined,
          canonicalEventId: event.id,
          roundIndex: event.round?.roundIndex,
          replayTimestampSeconds: event.timestampSeconds ?? undefined,
          category,
          severity: earlyDeath ? "MEDIUM" : "INFORMATIONAL",
          confidence: inferredDeath
            ? Math.min(0.75, replayConfidence)
            : replayConfidence,
          directObservations: [],
          replayFacts: [fact],
          transcriptEvidence: [],
          mapEvidence: [],
          conflictingEvidence: parseStringArray(event.conflictingEvidenceJson),
          missingContext: missing,
          explanation: inferredDeath
            ? `${inferredDeath} The outcome is useful for review, but its tactical cause remains unknown.`
            : objective
              ? "The selected player is linked to supported objective feedback. The replay fact does not establish intention, exact position, or decision quality."
              : "This validated replay outcome may help choose a round for review. It does not establish decision quality or mechanical cause.",
          alternatives: [
            "The same outcome can follow many different positioning, timing, information, utility, and team contexts.",
          ],
          detectorVersions: {
            replayProvider: `${match.sourceProviderId}@${match.sourceProviderVersion}`,
          },
          evidence: [
            {
              evidenceClass: "REPLAY_CONFIRMED_FACT",
              summary: fact,
              sourceType: "CANONICAL_REPLAY_EVENT",
              sourceId: event.id,
              replayTimestampSeconds: event.timestampSeconds ?? undefined,
              confidence: replayConfidence,
              observation: isRecord(observation) ? observation : {},
            },
            ...(inferredDeath
              ? [
                  {
                    evidenceClass: "INFERENCE" as const,
                    summary: inferredDeath,
                    sourceType: "REPLAY_TARGET_INFERENCE",
                    sourceId: event.id,
                    confidence: 0.75,
                    inference: {
                      selectedPlayerIsKillTarget: true,
                      independentDeathStateAvailable: false,
                    },
                  },
                ]
              : []),
            ...missing.map((summary) => ({
              evidenceClass: "MISSING_CONTEXT" as const,
              summary,
              sourceType: "CAPABILITY_BOUNDARY",
              sourceId: event.id,
            })),
          ],
        } satisfies FindingDraft;
      });
      return {
        findings,
        warnings: [
          "Replay outcomes are not POV reconstruction. Position, aim, line of sight, health, weapon, shots, damage, and intent remain unavailable.",
        ],
      };
    },
  };
}

function replayTradeRule(): IsolatedCoachingRule<AnalysisContext> {
  return {
    id: "replay.trade-timing",
    run(context) {
      const match = context.match;
      if (!match) return { findings: [], warnings: [] };
      const result = assessTradeTiming(
        match.events
          .filter(
            (event) =>
              event.category === "KILL" &&
              ["VALIDATED", "USER_CONFIRMED", "USER_CORRECTED"].includes(
                event.validationStatus,
              ),
          )
          .map((event) => {
            const relation = selectedPlayerRelation(
              context.project.selectedPlayerStableId,
              event,
            );
            return {
              id: event.id,
              timestampSeconds: event.timestampSeconds,
              actorTeamIndex: event.actorPlayer?.teamIndex ?? null,
              targetTeamIndex: event.targetPlayer?.teamIndex ?? null,
              actorIsSelectedPlayer: relation.actor,
              targetIsSelectedPlayer: relation.target,
            };
          }),
      );
      if (result.opportunities.length === 0) {
        return {
          findings: [],
          warnings: [
            result.missingEvidence ??
              "No supported trade-timing sequence was found.",
            result.limitation,
          ],
        };
      }
      return {
        findings: [],
        warnings: [
          `${result.opportunities.length} event-order trade window${result.opportunities.length === 1 ? "" : "s"} were found, but no finding was created because spatial opportunity is unavailable.`,
          result.limitation,
        ],
      };
    },
  };
}

function combinedSyncRule(): IsolatedCoachingRule<AnalysisContext> {
  return {
    id: "combined.verified-sync",
    run(context) {
      const sync = context.synchronization;
      const match = context.match;
      if (!sync || !match) {
        return {
          findings: [],
          warnings: [
            "Combined coaching requires a verified synchronization version with user-confirmed matched anchors.",
          ],
        };
      }
      const findings: FindingDraft[] = [];
      for (const anchor of sync.anchors.slice(0, 10)) {
        const event = match.events.find(
          (item) =>
            item.stableId === anchor.replayEventStableId &&
            ["VALIDATED", "USER_CONFIRMED", "USER_CORRECTED"].includes(
              item.validationStatus,
            ),
        );
        if (!event) continue;
        const fact = summarizeCanonicalEvent(event);
        const alignment = `User-confirmed synchronization version ${sync.version} aligns this replay fact to video ${anchor.videoTimestampSeconds.toFixed(3)}s with ${Math.round(anchor.confidence * 100)}% anchor confidence.`;
        findings.push({
          canonicalRoundId: event.roundId ?? undefined,
          canonicalEventId: event.id,
          roundIndex: event.round?.roundIndex,
          videoTimestampSeconds: anchor.videoTimestampSeconds,
          replayTimestampSeconds: anchor.replayTimestampSeconds,
          category: "REVIEW_RECOMMENDED",
          severity: "LOW",
          confidence: Math.min(sync.confidence, anchor.confidence),
          directObservations: [],
          replayFacts: [fact],
          transcriptEvidence: [],
          mapEvidence: [],
          conflictingEvidence: [
            ...parseStringArray(anchor.conflictingEvidenceJson),
            ...parseStringArray(sync.conflictingEvidenceJson),
          ],
          missingContext: [
            ...parseStringArray(anchor.missingEvidenceJson),
            "The alignment does not itself verify what is visible in the recording at that time.",
            "No validated replay position, camera, shot, health, weapon, damage, or line-of-sight stream is available.",
          ],
          explanation:
            "A user-confirmed synchronization places this supported replay fact near a recording timestamp for human POV review. The alignment is an inference, not a direct video observation.",
          alternatives: [
            "Manual anchor selection, drift, edited footage, or missing replay elapsed time can shift the apparent video relationship.",
          ],
          detectorVersions: {
            replayProvider: `${match.sourceProviderId}@${match.sourceProviderVersion}`,
            synchronizationVersion: sync.version,
            mappingAlgorithm: sync.mappingAlgorithmVersion,
          },
          evidence: [
            {
              evidenceClass: "REPLAY_CONFIRMED_FACT",
              summary: fact,
              sourceType: "CANONICAL_REPLAY_EVENT",
              sourceId: event.id,
              replayTimestampSeconds: anchor.replayTimestampSeconds,
              confidence:
                event.confidenceStatus === "HIGH" ? 0.9 : anchor.confidence,
              observation: {
                replayEventStableId: event.stableId,
                replayCategory: event.category,
              },
            },
            {
              evidenceClass: "INFERENCE",
              summary: alignment,
              sourceType: "VERIFIED_REPLAY_VIDEO_SYNCHRONIZATION",
              sourceId: sync.id,
              videoTimestampSeconds: anchor.videoTimestampSeconds,
              replayTimestampSeconds: anchor.replayTimestampSeconds,
              confidence: Math.min(sync.confidence, anchor.confidence),
              inference: {
                synchronizationVersion: sync.version,
                mappingAlgorithmVersion: sync.mappingAlgorithmVersion,
                anchorId: anchor.id,
              },
            },
            {
              evidenceClass: "MISSING_CONTEXT",
              summary:
                "The alignment does not itself verify what is visible in the recording at that time.",
              sourceType: "CAPABILITY_BOUNDARY",
              sourceId: sync.id,
            },
          ],
        });
      }
      return {
        findings,
        warnings:
          findings.length === 0
            ? [
                "The verified synchronization contains no user-confirmed anchor tied to a current canonical replay event.",
              ]
            : [],
      };
    },
  };
}

const ruleFactories: Record<
  string,
  () => IsolatedCoachingRule<AnalysisContext>
> = {
  "recording.signal-review": recordingSignalRule,
  "recording.transcript-review": transcriptRule,
  "replay.selected-player-events": replaySelectedPlayerRule,
  "replay.trade-timing": replayTradeRule,
  "combined.verified-sync": combinedSyncRule,
};

const activeAnalyses = new Map<string, AbortController>();

async function cooperativePause(signal: AbortSignal, milliseconds: number) {
  const intervalMilliseconds = 25;
  let elapsed = 0;
  while (elapsed < milliseconds) {
    if (signal.aborted) return;
    const wait = Math.min(intervalMilliseconds, milliseconds - elapsed);
    await new Promise((resolve) => setTimeout(resolve, wait));
    elapsed += wait;
  }
}

async function cancellationRequested(analysisId: string) {
  const analysis = await db.coachingAnalysis.findUnique({
    where: { id: analysisId },
    select: { cancelRequestedAt: true, status: true },
  });
  return (
    !analysis ||
    analysis.cancelRequestedAt != null ||
    analysis.status === "CANCELLED"
  );
}

function applicableRuleIds(enabledRuleIds: string[], context: AnalysisContext) {
  return enabledRuleIds.filter((id) => {
    const definition = COACHING_ANALYSIS_RULES.find((rule) => rule.id === id);
    return definition ? ruleApplies(definition.requiredInput, context) : false;
  });
}

function sourceSnapshot(context: AnalysisContext) {
  return {
    inputMode: context.project.inputMode,
    recordingId: context.recording?.id ?? null,
    recordingDurationSeconds: context.recording?.durationSeconds ?? null,
    detectorAnalysisId: context.recording?.analysisJobs[0]?.id ?? null,
    replayPackageId: context.replay?.id ?? null,
    replayProviderId: context.match?.sourceProviderId ?? null,
    replayProviderVersion: context.match?.sourceProviderVersion ?? null,
    selectedPlayerStableId: context.project.selectedPlayerStableId,
    selectedPlayerAlias: context.project.selectedPlayerAlias,
    synchronizationId: context.synchronization?.id ?? null,
    synchronizationVersion: context.synchronization?.version ?? null,
  };
}

async function saveAnalysisFindings(
  analysisId: string,
  studioProjectId: string,
  drafts: FindingDraft[],
) {
  await db.$transaction(async (transaction) => {
    await transaction.coachingFinding.deleteMany({ where: { analysisId } });
    for (const draft of drafts) {
      await transaction.coachingFinding.create({
        data: {
          studioProjectId,
          analysisId,
          canonicalRoundId: draft.canonicalRoundId ?? null,
          canonicalEventId: draft.canonicalEventId ?? null,
          originalCategory: draft.category,
          category: draft.category,
          originalSeverity: draft.severity,
          severity: draft.severity,
          confidence: draft.confidence,
          roundIndex: draft.roundIndex ?? null,
          originalVideoTimestampSeconds: draft.videoTimestampSeconds ?? null,
          videoTimestampSeconds: draft.videoTimestampSeconds ?? null,
          replayTimestampSeconds: draft.replayTimestampSeconds ?? null,
          directObservationsJson: JSON.stringify(draft.directObservations),
          replayFactsJson: JSON.stringify(draft.replayFacts),
          transcriptEvidenceJson: JSON.stringify(draft.transcriptEvidence),
          mapEvidenceJson: JSON.stringify(draft.mapEvidence),
          conflictingEvidenceJson: JSON.stringify(draft.conflictingEvidence),
          missingContextJson: JSON.stringify(draft.missingContext),
          explanation: draft.explanation,
          alternativeExplanationsJson: JSON.stringify(draft.alternatives),
          detectorVersionsJson: JSON.stringify(draft.detectorVersions),
          analysisVersion: COACHING_AUTOMATIC_ANALYSIS_VERSION,
          evidence: {
            create: draft.evidence.map((evidence) => ({
              evidenceClass: evidence.evidenceClass,
              summary: evidence.summary,
              sourceType: evidence.sourceType,
              sourceId: evidence.sourceId ?? null,
              videoTimestampSeconds: evidence.videoTimestampSeconds ?? null,
              replayTimestampSeconds: evidence.replayTimestampSeconds ?? null,
              confidence: evidence.confidence ?? null,
              observationJson: JSON.stringify(evidence.observation ?? {}),
              inferenceJson: JSON.stringify(evidence.inference ?? {}),
            })),
          },
        },
      });
    }
  });
}

async function runCoachingAnalysis(analysisId: string) {
  const controller = activeAnalyses.get(analysisId) ?? new AbortController();
  activeAnalyses.set(analysisId, controller);
  try {
    const analysis = await db.coachingAnalysis.findUnique({
      where: { id: analysisId },
    });
    if (!analysis || analysis.status !== "QUEUED") return;
    const context = await loadAnalysisContext(analysis.studioProjectId);
    const requested = parseJson(analysis.detectorVersionsJson);
    const enabledRuleIds =
      isRecord(requested) && Array.isArray(requested.enabledRuleIds)
        ? requested.enabledRuleIds.filter(
            (item): item is string => typeof item === "string",
          )
        : [...ruleIds];
    const applicable = applicableRuleIds(enabledRuleIds, context);
    const skipped = enabledRuleIds.filter((id) => !applicable.includes(id));
    await db.coachingAnalysis.update({
      where: { id: analysis.id },
      data: {
        status: "RUNNING",
        progress: 2,
        stage: "Loading local coaching evidence",
        sourceSnapshotJson: JSON.stringify(sourceSnapshot(context)),
        synchronizationId: context.synchronization?.id ?? null,
        startedAt: new Date(),
        warningsJson: JSON.stringify(
          skipped.map(
            (id) =>
              `${id} was skipped because this project's input mode does not provide its required source.`,
          ),
        ),
      },
    });

    const drafts: FindingDraft[] = [];
    const warnings: string[] = skipped.map(
      (id) =>
        `${id} was skipped because this project's input mode does not provide its required source.`,
    );
    let failedRuleCount = 0;
    for (let index = 0; index < applicable.length; index += 1) {
      const ruleId = applicable[index];
      if (
        !ruleId ||
        controller.signal.aborted ||
        (await cancellationRequested(analysis.id))
      ) {
        throw new AppError(
          "Coaching analysis was cancelled.",
          409,
          "COACHING_ANALYSIS_CANCELLED",
        );
      }
      await db.coachingAnalysis.update({
        where: { id: analysis.id },
        data: {
          currentRuleId: ruleId,
          stage:
            COACHING_ANALYSIS_RULES.find((rule) => rule.id === ruleId)?.name ??
            ruleId,
          progress: Math.max(
            3,
            Math.round((index / Math.max(1, applicable.length)) * 90),
          ),
        },
      });
      // Yield briefly so this intentionally asynchronous local job exposes
      // responsive progress and cancellation even when a rule only reads
      // already-persisted evidence.
      await cooperativePause(controller.signal, 2_000);
      if (
        controller.signal.aborted ||
        (await cancellationRequested(analysis.id))
      ) {
        throw new AppError(
          "Coaching analysis was cancelled.",
          409,
          "COACHING_ANALYSIS_CANCELLED",
        );
      }
      const factory = ruleFactories[ruleId];
      if (!factory) continue;
      try {
        const result = await factory().run(context);
        drafts.push(...result.findings);
        warnings.push(...result.warnings);
      } catch (error) {
        failedRuleCount += 1;
        warnings.push(
          `${ruleId} failed in isolation: ${
            error instanceof Error ? error.message : "Unknown rule error."
          }`,
        );
      }
      await db.coachingAnalysis.update({
        where: { id: analysis.id },
        data: {
          completedRuleCount: index + 1,
          failedRuleCount,
          warningsJson: JSON.stringify(warnings),
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    if (
      controller.signal.aborted ||
      (await cancellationRequested(analysis.id))
    ) {
      throw new AppError(
        "Coaching analysis was cancelled.",
        409,
        "COACHING_ANALYSIS_CANCELLED",
      );
    }
    await saveAnalysisFindings(analysis.id, analysis.studioProjectId, drafts);
    await db.coachingAnalysis.update({
      where: { id: analysis.id },
      data: {
        status: "COMPLETED",
        progress: 100,
        stage: "Evidence-backed coaching findings ready",
        currentRuleId: null,
        completedRuleCount: applicable.length,
        failedRuleCount,
        warningsJson: JSON.stringify(warnings),
        completedAt: new Date(),
      },
    });
  } catch (error) {
    const cancelled =
      controller.signal.aborted ||
      (error instanceof AppError &&
        error.code === "COACHING_ANALYSIS_CANCELLED");
    await db
      .$transaction([
        db.coachingFinding.deleteMany({ where: { analysisId } }),
        db.coachingAnalysis.update({
          where: { id: analysisId },
          data: {
            status: cancelled ? "CANCELLED" : "ERROR",
            progress: 0,
            stage: cancelled
              ? "Cancelled and partial findings removed"
              : "Coaching analysis failed",
            currentRuleId: null,
            errorMessage: cancelled
              ? null
              : error instanceof Error
                ? error.message
                : "The local coaching analysis failed.",
            completedAt: new Date(),
          },
        }),
      ])
      .catch(() => undefined);
  } finally {
    activeAnalyses.delete(analysisId);
  }
}

export async function reconcileCoachingAnalyses() {
  const activeIds = [...activeAnalyses.keys()];
  const interrupted = await db.coachingAnalysis.findMany({
    where: {
      status: { in: ["QUEUED", "RUNNING"] },
      ...(activeIds.length > 0 ? { id: { notIn: activeIds } } : {}),
    },
    select: { id: true },
  });
  if (interrupted.length === 0) return 0;
  const ids = interrupted.map((analysis) => analysis.id);
  await db.$transaction([
    db.coachingFinding.deleteMany({ where: { analysisId: { in: ids } } }),
    db.coachingAnalysis.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "ERROR",
        progress: 0,
        stage: "Interrupted by an application restart",
        currentRuleId: null,
        errorMessage:
          "The application restarted before this coaching analysis completed. Retry it to run again.",
        completedAt: new Date(),
      },
    }),
  ]);
  return ids.length;
}

export async function startCoachingAnalysis(
  studioProjectId: string,
  input: unknown,
) {
  const value = startCoachingAnalysisSchema.parse(input);
  await reconcileCoachingAnalyses();
  const context = await loadAnalysisContext(studioProjectId);
  const applicable = applicableRuleIds(value.enabledRuleIds, context);
  if (applicable.length === 0) {
    throw new AppError(
      "None of the selected coaching rules can use this project's current inputs.",
      409,
      "COACHING_NO_APPLICABLE_RULES",
    );
  }
  const active = await db.coachingAnalysis.findFirst({
    where: {
      studioProjectId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });
  if (active) {
    throw new AppError(
      "A coaching analysis is already active for this project.",
      409,
      "COACHING_ANALYSIS_ALREADY_ACTIVE",
    );
  }
  const analysis = await db.coachingAnalysis.create({
    data: {
      studioProjectId,
      inputMode: context.project.inputMode,
      status: "QUEUED",
      progress: 0,
      stage: "Waiting to analyze local evidence",
      analysisVersion: COACHING_AUTOMATIC_ANALYSIS_VERSION,
      ruleSetVersion: COACHING_RULE_SET_VERSION,
      sourceSnapshotJson: JSON.stringify(sourceSnapshot(context)),
      detectorVersionsJson: JSON.stringify({
        enabledRuleIds: value.enabledRuleIds,
      }),
      synchronizationId: context.synchronization?.id ?? null,
    },
  });
  activeAnalyses.set(analysis.id, new AbortController());
  setTimeout(() => {
    void runCoachingAnalysis(analysis.id);
  }, 0);
  return analysis.id;
}

export async function cancelCoachingAnalysis(
  studioProjectId: string,
  analysisId: string,
) {
  const analysis = await db.coachingAnalysis.findFirst({
    where: { id: analysisId, studioProjectId },
  });
  if (!analysis) {
    throw new AppError(
      "That coaching analysis no longer exists.",
      404,
      "COACHING_ANALYSIS_NOT_FOUND",
    );
  }
  if (!["QUEUED", "RUNNING"].includes(analysis.status)) {
    throw new AppError(
      "Only an active coaching analysis can be cancelled.",
      409,
      "COACHING_ANALYSIS_NOT_ACTIVE",
    );
  }
  await db.coachingAnalysis.update({
    where: { id: analysis.id },
    data: {
      cancelRequestedAt: new Date(),
      stage: "Cancellation requested",
    },
  });
  activeAnalyses.get(analysis.id)?.abort();
}

export async function retryCoachingAnalysis(
  studioProjectId: string,
  analysisId: string,
) {
  await reconcileCoachingAnalyses();
  const analysis = await db.coachingAnalysis.findFirst({
    where: { id: analysisId, studioProjectId },
  });
  if (!analysis) {
    throw new AppError(
      "That coaching analysis no longer exists.",
      404,
      "COACHING_ANALYSIS_NOT_FOUND",
    );
  }
  if (!["CANCELLED", "ERROR", "COMPLETED"].includes(analysis.status)) {
    throw new AppError(
      "Wait for the active coaching analysis to finish before retrying it.",
      409,
      "COACHING_ANALYSIS_ACTIVE",
    );
  }
  const snapshot = parseJson(analysis.detectorVersionsJson);
  const enabledRuleIds =
    isRecord(snapshot) && Array.isArray(snapshot.enabledRuleIds)
      ? snapshot.enabledRuleIds.filter(
          (item): item is string => typeof item === "string",
        )
      : [...ruleIds];
  return startCoachingAnalysis(studioProjectId, { enabledRuleIds });
}

export async function deleteCoachingAnalysis(
  studioProjectId: string,
  analysisId: string,
) {
  const analysis = await db.coachingAnalysis.findFirst({
    where: { id: analysisId, studioProjectId },
  });
  if (!analysis) {
    throw new AppError(
      "That coaching analysis no longer exists.",
      404,
      "COACHING_ANALYSIS_NOT_FOUND",
    );
  }
  if (["QUEUED", "RUNNING"].includes(analysis.status)) {
    throw new AppError(
      "Cancel the active analysis before deleting it.",
      409,
      "COACHING_ANALYSIS_ACTIVE",
    );
  }
  await db.coachingAnalysis.delete({ where: { id: analysis.id } });
}

export function coachingRuleAvailability(inputMode: StudioInputMode) {
  return COACHING_ANALYSIS_RULES.map((rule) => ({
    ...rule,
    applicable:
      rule.requiredInput === "recording"
        ? inputMode !== "MATCH_REPLAY_ONLY"
        : rule.requiredInput === "replay"
          ? inputMode !== "SCREEN_RECORDING_ONLY"
          : inputMode === "SCREEN_RECORDING_AND_REPLAY",
  }));
}
