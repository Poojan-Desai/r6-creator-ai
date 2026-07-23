import { db } from "@/lib/db";
import type {
  DetectorEventResult,
  DetectorSignalCurveResult,
  LocalDetector,
} from "@/lib/detectors/types";
import { normalizeTimeSeries } from "@/lib/signals/time-series";
import {
  listTranscriptRules,
  matchTranscriptRule,
  type TranscriptRuleDto,
} from "@/lib/transcript-rules";

import { buildVideoEvent, numberParameter } from "./video-signal-utils";

const VERSION = "1.0.0";

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function transcriptContext(input: {
  segments: Array<{ text: string }>;
  index: number;
  rule: TranscriptRuleDto;
}) {
  const before = input.segments
    .slice(
      Math.max(0, input.index - input.rule.pattern.contextBeforeLines),
      input.index,
    )
    .map((segment) => segment.text);
  const after = input.segments
    .slice(
      input.index + 1,
      input.index + 1 + input.rule.pattern.contextAfterLines,
    )
    .map((segment) => segment.text);
  return { before, current: input.segments[input.index]?.text ?? "", after };
}

export const transcriptRuleDetector: LocalDetector = {
  stableId: "transcript.versioned-rules",
  name: "Versioned transcript evidence rules",
  version: VERSION,
  description:
    "Matches inspectable local phrases and regular expressions against the saved transcript. Matches are supporting text evidence only.",
  requiredInputs: ["TRANSCRIPT"],
  parameters: {
    densityWindowSeconds: {
      type: "number",
      label: "Evidence-density window",
      description:
        "Seconds represented by each transcript evidence-density point.",
      defaultValue: 5,
      minimum: 1,
      maximum: 30,
    },
  },
  enabledByDefault: true,
  estimatedCost: "LOW",
  executionOrder: 85,
  implementationState: "ACTIVE",
  async run(context) {
    const started = performance.now();
    await context.reportProgress({
      progress: 10,
      stage: "Loading saved timestamped transcript",
    });
    const completed = await db.transcriptionJob.findFirst({
      where: { projectId: context.project.id, status: "COMPLETED" },
      include: {
        audioTrack: true,
        segments: { orderBy: { segmentOrder: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!completed || completed.segments.length === 0) {
      return {
        events: [],
        warnings: [
          "No completed timestamped transcript is available. Transcript rules completed without results and did not start a new transcription.",
        ],
        performance: { processedSourceSeconds: 0 },
      };
    }
    const rules = (await listTranscriptRules()).filter((rule) => rule.enabled);
    await context.reportProgress({
      progress: 25,
      stage: `Applying ${rules.length} versioned transcript rules`,
    });
    const processingDurationMs = Math.round(performance.now() - started);
    const events: DetectorEventResult[] = [];
    const densityWindowSeconds = numberParameter(
      context.parameters,
      "densityWindowSeconds",
      5,
      1,
      30,
    );
    const bucketCount = Math.max(
      1,
      Math.ceil(context.project.durationSeconds / densityWindowSeconds),
    );
    const bucketCounts = Array.from({ length: bucketCount }, () => 0);
    const warnings: string[] = [];
    for (const [segmentIndex, segment] of completed.segments.entries()) {
      context.throwIfCancellationRequested();
      for (const rule of rules) {
        const matches = matchTranscriptRule(segment.text, rule);
        for (const match of matches) {
          const segmentDuration = Math.max(
            0.01,
            segment.endSeconds - segment.startSeconds,
          );
          const peakSeconds = Math.min(
            context.project.durationSeconds,
            segment.startSeconds +
              (match.matchStart / Math.max(1, segment.text.length)) *
                segmentDuration,
          );
          const startSeconds = Math.max(0, segment.startSeconds);
          const endSeconds = Math.min(
            context.project.durationSeconds,
            Math.max(startSeconds + 0.01, segment.endSeconds),
          );
          if (endSeconds <= startSeconds) continue;
          const surroundingContext = transcriptContext({
            segments: completed.segments,
            index: segmentIndex,
            rule,
          });
          const eventType = `TRANSCRIPT_${rule.category}`;
          const explanation = `${rule.name} matched “${match.exactText}” in a saved transcript line.`;
          events.push({
            ...buildVideoEvent({
              eventType,
              interval: {
                startSeconds,
                peakSeconds: Math.max(
                  startSeconds,
                  Math.min(endSeconds, peakSeconds),
                ),
                endSeconds,
              },
              confidence: match.confidence,
              supportingEvidence: [explanation],
              conflictingEvidence: match.warnings,
              sourceSignal: "TRANSCRIPT",
              rawMeasurements: {
                transcriptSegmentId: segment.id,
                transcriptLine: segment.text,
                exactMatchedText: match.exactText,
                matchStart: match.matchStart,
                matchEnd: match.matchEnd,
                surroundingContext,
                ruleId: rule.id,
                ruleStableId: rule.stableId,
                ruleVersion: rule.currentVersion,
                category: rule.category,
                negated: match.negated,
                ambiguous: match.ambiguous,
                repeated: match.repeated,
                sourceAudioTrackId: completed.audioTrackId,
                sourceTrackRole: completed.audioTrack.analysisRole,
              },
              thresholds: {
                baseRuleConfidence: rule.confidence,
                negationMultiplier: 0.45,
                ambiguityMultiplier: 0.72,
                repetitionBoost: rule.pattern.repetitionBoost ? 0.05 : 0,
              },
              warningMessages: match.warnings,
              processingDurationMs,
            }),
            evidence: [
              {
                kind: "SUPPORTING",
                sourceSignal: "TRANSCRIPT",
                summary: explanation,
                timestampSeconds: peakSeconds,
                data: {
                  transcriptSegmentId: segment.id,
                  exactMatchedText: match.exactText,
                  ruleId: rule.id,
                  ruleVersion: rule.currentVersion,
                  surroundingContext,
                  negated: match.negated,
                  ambiguous: match.ambiguous,
                },
              },
            ],
          });
          const bucketIndex = Math.min(
            bucketCount - 1,
            Math.floor(peakSeconds / densityWindowSeconds),
          );
          bucketCounts[bucketIndex] = (bucketCounts[bucketIndex] ?? 0) + 1;
        }
      }
      if (segmentIndex % 25 === 0) {
        await context.reportProgress({
          progress: Math.min(
            90,
            25 +
              Math.round(((segmentIndex + 1) / completed.segments.length) * 65),
          ),
          stage: `Analyzed ${segmentIndex + 1} of ${completed.segments.length} transcript lines`,
        });
      }
    }
    if (rules.length === 0) {
      warnings.push(
        "All transcript rules are disabled. Existing historical results were not changed.",
      );
    }
    const rawDensity = bucketCounts.map((count, index) => ({
      timestampSeconds: Math.min(
        context.project.durationSeconds,
        index * densityWindowSeconds + densityWindowSeconds / 2,
      ),
      windowStartSeconds: index * densityWindowSeconds,
      windowEndSeconds: Math.min(
        context.project.durationSeconds,
        (index + 1) * densityWindowSeconds,
      ),
      rawValue: count,
    }));
    const normalized = normalizeTimeSeries(rawDensity, {
      durationSeconds: context.project.durationSeconds,
      baselineWindowPoints: Math.max(3, Math.round(30 / densityWindowSeconds)),
    });
    const curves: DetectorSignalCurveResult[] = [
      {
        stableId: "transcript.rules.evidence-density",
        audioTrackId: completed.audioTrackId,
        kind: "TRANSCRIPT_EVIDENCE_DENSITY",
        displayName: "Transcript evidence density",
        unit: "rule matches per window",
        sourceSignal: "TRANSCRIPT",
        sourceTrackRole: completed.audioTrack.analysisRole,
        sourceStreamIndex: completed.audioTrack.streamIndex,
        sampleIntervalSeconds: densityWindowSeconds,
        aggregation: "MAXIMUM",
        configuration: {
          densityWindowSeconds,
          enabledRuleCount: rules.length,
          ruleVersions: rules.map(
            (rule) => `${rule.stableId}@${rule.currentVersion}`,
          ),
          sourceTranscriptJobId: completed.id,
          sourceAudioTrackId: completed.audioTrackId,
          sourceTrackRole: completed.audioTrack.analysisRole,
        },
        statistics: {
          ...normalized.statistics,
          totalMatches: events.length,
          transcriptLineCount: completed.segments.length,
        },
        rawPointCount: rawDensity.length,
        points: normalized.points,
      },
    ];
    return {
      events,
      curves,
      warnings: [
        ...warnings,
        "Transcript phrases are supporting evidence only. They do not confirm gameplay events, map location, room location, intent, or emotion.",
      ],
      performance: { processedSourceSeconds: context.project.durationSeconds },
    };
  },
};

export function reactionType(transcriptEventType: string | null) {
  if (!transcriptEventType) return "UNCLASSIFIED_STRONG_VOCAL_REACTION";
  if (transcriptEventType.endsWith("EXCITEMENT")) return "POSSIBLE_EXCITEMENT";
  if (transcriptEventType.endsWith("SURPRISE")) return "POSSIBLE_SURPRISE";
  if (transcriptEventType.endsWith("LAUGHTER")) return "POSSIBLE_LAUGHTER";
  if (transcriptEventType.endsWith("FRUSTRATION"))
    return "POSSIBLE_FRUSTRATION";
  if (transcriptEventType.endsWith("CELEBRATION"))
    return "POSSIBLE_CELEBRATION";
  return "UNCLASSIFIED_STRONG_VOCAL_REACTION";
}

export const reactionCandidateDetector: LocalDetector = {
  stableId: "combined.reaction-candidates",
  name: "Evidence-supported reaction candidates",
  version: VERSION,
  description:
    "Combines creator-microphone peaks with nearby transcript and game-audio evidence into cautious behavioral-content candidates.",
  requiredInputs: [
    "CREATOR_MICROPHONE",
    "GAME_AUDIO",
    "TRANSCRIPT",
    "COMBINED_EVIDENCE",
  ],
  parameters: {
    transcriptWindowSeconds: {
      type: "number",
      label: "Transcript evidence window",
      description:
        "Seconds around a creator peak searched for transcript evidence.",
      defaultValue: 3,
      minimum: 0.5,
      maximum: 10,
    },
    gameAudioWindowSeconds: {
      type: "number",
      label: "Game-audio evidence window",
      description:
        "Seconds around a creator peak searched for game-audio evidence.",
      defaultValue: 1,
      minimum: 0,
      maximum: 5,
    },
  },
  enabledByDefault: true,
  estimatedCost: "LOW",
  executionOrder: 88,
  implementationState: "ACTIVE",
  async run(context) {
    const started = performance.now();
    const transcriptWindowSeconds = numberParameter(
      context.parameters,
      "transcriptWindowSeconds",
      3,
      0.5,
      10,
    );
    const gameAudioWindowSeconds = numberParameter(
      context.parameters,
      "gameAudioWindowSeconds",
      1,
      0,
      5,
    );
    const [sourceEvents, transcriptSource] = await Promise.all([
      db.detectorEvent.findMany({
        where: {
          detectorRun: {
            analysisJobId: context.analysisJobId,
            status: "COMPLETED",
          },
          OR: [
            { eventType: { contains: "CREATOR_AUDIO" } },
            { eventType: { contains: "GAME_AUDIO" } },
            { eventType: { startsWith: "TRANSCRIPT_" } },
            { eventType: { contains: "CREATOR_SILENCE" } },
          ],
        },
        orderBy: { peakSeconds: "asc" },
      }),
      db.transcriptionJob.findFirst({
        where: { projectId: context.project.id, status: "COMPLETED" },
        include: { audioTrack: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const creatorPeaks = sourceEvents.filter(
      (event) =>
        event.eventType.startsWith("SUDDEN_CREATOR_AUDIO_PEAK") ||
        event.eventType.startsWith("SUSTAINED_LOUD_CREATOR_AUDIO"),
    );
    const gamePeaks = sourceEvents.filter(
      (event) =>
        event.eventType.startsWith("SUDDEN_GAME_AUDIO_PEAK") ||
        event.eventType.startsWith("SUSTAINED_LOUD_GAME_AUDIO"),
    );
    const transcriptAllowed =
      transcriptSource?.audioTrack.analysisRole === "CREATOR_MICROPHONE" ||
      transcriptSource?.audioTrack.analysisRole === "MIXED_AUDIO";
    const transcriptEvents = transcriptAllowed
      ? sourceEvents.filter((event) =>
          event.eventType.startsWith("TRANSCRIPT_"),
        )
      : [];
    const silenceEvents = sourceEvents.filter((event) =>
      event.eventType.includes("CREATOR_SILENCE"),
    );
    const processingDurationMs = Math.round(performance.now() - started);
    const events: DetectorEventResult[] = creatorPeaks.map((creatorPeak) => {
      const nearbyTranscript = transcriptEvents
        .filter(
          (event) =>
            Math.abs(event.peakSeconds - creatorPeak.peakSeconds) <=
            transcriptWindowSeconds,
        )
        .sort(
          (left, right) =>
            Math.abs(left.peakSeconds - creatorPeak.peakSeconds) -
            Math.abs(right.peakSeconds - creatorPeak.peakSeconds),
        );
      const nearbyGame = gamePeaks.filter(
        (event) =>
          Math.abs(event.peakSeconds - creatorPeak.peakSeconds) <=
          gameAudioWindowSeconds,
      );
      const precedingSilence = silenceEvents.find(
        (event) =>
          event.endSeconds <= creatorPeak.startSeconds &&
          creatorPeak.startSeconds - event.endSeconds <= 2,
      );
      const primaryTranscript = nearbyTranscript[0] ?? null;
      const eventType = reactionType(primaryTranscript?.eventType ?? null);
      const alternativeCategories = [
        ...new Set(
          nearbyTranscript
            .slice(1)
            .map((event) => reactionType(event.eventType))
            .filter((type) => type !== "UNCLASSIFIED_STRONG_VOCAL_REACTION"),
        ),
      ];
      const transcriptEvidence = primaryTranscript
        ? (parseStringArray(primaryTranscript.supportingEvidenceJson)[0] ??
          primaryTranscript.eventType)
        : null;
      const supporting = [
        `Creator-microphone event ${creatorPeak.eventType} was measured at ${creatorPeak.peakSeconds.toFixed(2)} seconds.`,
        ...(transcriptEvidence
          ? [
              `Nearby creator or mixed-track transcript evidence: ${transcriptEvidence}`,
            ]
          : []),
        ...(nearbyGame.length > 0
          ? ["A game-audio peak occurred nearby."]
          : []),
        ...(precedingSilence
          ? ["The creator peak followed a measured silence interval."]
          : []),
      ];
      const conflicting = [
        ...(!transcriptEvidence
          ? ["Strong creator vocal event; reaction type uncertain."]
          : []),
        "Audio and transcript evidence cannot establish a person's psychological state.",
      ];
      return {
        ...buildVideoEvent({
          eventType,
          interval: {
            startSeconds: creatorPeak.startSeconds,
            peakSeconds: creatorPeak.peakSeconds,
            endSeconds: creatorPeak.endSeconds,
          },
          confidence: Math.min(
            0.9,
            creatorPeak.confidence * 0.65 +
              (primaryTranscript?.confidence ?? 0) * 0.25 +
              (nearbyGame.length > 0 ? 0.06 : 0) +
              (precedingSilence ? 0.04 : 0),
          ),
          supportingEvidence: supporting,
          conflictingEvidence: conflicting,
          sourceSignal: "COMBINED_EVIDENCE",
          rawMeasurements: {
            creatorAudioEventId: creatorPeak.id,
            transcriptEventId: primaryTranscript?.id ?? null,
            nearbyGameAudioEventIds: nearbyGame.map((event) => event.id),
            precedingSilenceEventId: precedingSilence?.id ?? null,
            reason:
              eventType === "UNCLASSIFIED_STRONG_VOCAL_REACTION"
                ? "Creator audio was strong, but no permitted transcript category was available."
                : "Creator audio and nearby versioned transcript evidence support this possible category.",
            alternativeCategories,
          },
          thresholds: { transcriptWindowSeconds, gameAudioWindowSeconds },
          processingDurationMs,
        }),
        category: "LOUD_CREATOR_REACTION",
      };
    });
    return {
      events,
      warnings: [
        ...(creatorPeaks.length === 0
          ? [
              "No measured creator-microphone peak was available. Confirm the creator track and run the relative audio peak detector.",
            ]
          : []),
        ...(!transcriptAllowed && transcriptSource
          ? [
              "The saved transcript was not linked to a user-confirmed creator or mixed track, so it was not used to classify creator reactions.",
            ]
          : []),
        "Reaction candidates are behavioral-content suggestions, not psychological diagnoses or confirmed highlights.",
      ],
      performance: { processedSourceSeconds: context.project.durationSeconds },
    };
  },
};

export const generalTranscriptDetectors = [
  transcriptRuleDetector,
  reactionCandidateDetector,
] as const;
