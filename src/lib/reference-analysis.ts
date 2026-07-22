import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { readFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";

import type {
  ReferenceAnalysisStatus,
  StyleFeatureSource,
} from "@prisma/client";

import { appConfig } from "@/lib/config";
import {
  ensureDataDirectories,
  referenceAnalysisDirectory,
  resolveDataPath,
} from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  buildAudioExtractionArguments,
  buildWhisperArguments,
  getTranscriptionHealth,
  parseFfmpegProgress,
  parseWhisperJson,
  parseWhisperProgress,
} from "@/lib/transcription";

const ANALYZER_VERSION = "reference-style-v1";
const ACTIVE_STATUSES: ReferenceAnalysisStatus[] = [
  "QUEUED",
  "EXTRACTING",
  "TRANSCRIBING",
  "MEASURING",
  "SAVING",
];

type Controller = {
  child: ChildProcess | null;
  cancelRequested: boolean;
};

const analysisGlobal = globalThis as unknown as {
  r6ReferenceAnalysisControllers?: Map<string, Controller>;
  r6ReferenceAnalysisReconciled?: boolean;
};

const activeControllers =
  analysisGlobal.r6ReferenceAnalysisControllers ??
  new Map<string, Controller>();
analysisGlobal.r6ReferenceAnalysisControllers = activeControllers;

class ReferenceAnalysisCancelledError extends Error {}

export type TimeInterval = {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
};

export type EnergySample = {
  timeSeconds: number;
  rmsDb: number;
  normalized: number;
};

export type ReferenceSignals = {
  sceneChanges: number[];
  blackFrames: TimeInterval[];
  silenceIntervals: TimeInterval[];
  energyCurve: EnergySample[];
};

export type TranscriptInput = {
  segmentOrder: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
};

export type ComputedStyleFeature = {
  key: string;
  label: string;
  value: unknown;
  unit: string | null;
  confidence: number;
  evidence: string;
  source: StyleFeatureSource;
};

export function buildReferenceVideoSignalArguments(inputPath: string) {
  return [
    "-hide_banner",
    "-nostdin",
    "-i",
    inputPath,
    "-vf",
    "blackdetect=d=0.08:pix_th=0.10,select='gt(scene,0.18)',showinfo",
    "-an",
    "-fps_mode",
    "vfr",
    "-f",
    "null",
    "-",
  ];
}

export function buildReferenceAudioSignalArguments(audioPath: string) {
  return [
    "-hide_banner",
    "-nostdin",
    "-i",
    audioPath,
    "-af",
    "silencedetect=noise=-38dB:d=0.35,asetnsamples=n=16000:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
    "-vn",
    "-f",
    "null",
    "-",
  ];
}

function round(value: number, places = 2) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function uniqueSorted(values: number[]) {
  return [...new Set(values.map((value) => round(value, 3)))].sort(
    (left, right) => left - right,
  );
}

export function parseReferenceSignalOutput(
  videoOutput: string,
  audioOutput: string,
): ReferenceSignals {
  const sceneChanges = uniqueSorted(
    [...videoOutput.matchAll(/pts_time:([0-9.]+)/g)]
      .map((match) => Number(match[1]))
      .filter(Number.isFinite),
  );
  const blackFrames = [
    ...videoOutput.matchAll(
      /black_start:([0-9.]+)\s+black_end:([0-9.]+)\s+black_duration:([0-9.]+)/g,
    ),
  ].flatMap((match) => {
    const startSeconds = Number(match[1]);
    const endSeconds = Number(match[2]);
    const durationSeconds = Number(match[3]);
    return [startSeconds, endSeconds, durationSeconds].every(Number.isFinite)
      ? [{ startSeconds, endSeconds, durationSeconds }]
      : [];
  });

  const silenceStarts = [
    ...audioOutput.matchAll(/silence_start:\s*([0-9.]+)/g),
  ].map((match) => Number(match[1]));
  const silenceEnds = [
    ...audioOutput.matchAll(
      /silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/g,
    ),
  ];
  const silenceIntervals = silenceEnds.flatMap((match, index) => {
    const endSeconds = Number(match[1]);
    const durationSeconds = Number(match[2]);
    const detectedStart = silenceStarts[index];
    const startSeconds = Number.isFinite(detectedStart)
      ? Number(detectedStart)
      : Math.max(0, endSeconds - durationSeconds);
    return [startSeconds, endSeconds, durationSeconds].every(Number.isFinite)
      ? [{ startSeconds, endSeconds, durationSeconds }]
      : [];
  });

  let timeSeconds: number | null = null;
  const energyCurve: EnergySample[] = [];
  for (const line of audioOutput.split(/\r?\n/)) {
    const timeMatch = /pts_time:([0-9.]+)/.exec(line);
    if (timeMatch) timeSeconds = Number(timeMatch[1]);
    const levelMatch = /lavfi\.astats\.Overall\.RMS_level=([-0-9.inf]+)/.exec(
      line,
    );
    if (!levelMatch || timeSeconds === null) continue;
    const rmsDb = Number(levelMatch[1]);
    if (!Number.isFinite(rmsDb)) continue;
    energyCurve.push({
      timeSeconds: round(timeSeconds, 3),
      rmsDb: round(rmsDb, 2),
      normalized: round(Math.max(0, Math.min(1, (rmsDb + 60) / 60)), 3),
    });
  }

  return { sceneChanges, blackFrames, silenceIntervals, energyCurve };
}

function unionDuration(segments: TranscriptInput[]) {
  const sorted = segments
    .map((segment) => ({
      start: segment.startSeconds,
      end: segment.endSeconds,
    }))
    .sort((left, right) => left.start - right.start);
  let total = 0;
  let currentStart: number | null = null;
  let currentEnd = 0;
  for (const segment of sorted) {
    if (currentStart === null) {
      currentStart = segment.start;
      currentEnd = segment.end;
    } else if (segment.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, segment.end);
    } else {
      total += currentEnd - currentStart;
      currentStart = segment.start;
      currentEnd = segment.end;
    }
  }
  return currentStart === null ? 0 : total + currentEnd - currentStart;
}

function feature(
  key: string,
  label: string,
  value: unknown,
  confidence: number,
  evidence: string,
  source: StyleFeatureSource,
  unit: string | null = null,
): ComputedStyleFeature {
  return { key, label, value, unit, confidence, evidence, source };
}

function unavailable(key: string, label: string, evidence: string) {
  return feature(key, label, null, 0, evidence, "UNAVAILABLE");
}

function countMatches(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].length;
}

export function computeReferenceStyleFeatures(input: {
  durationSeconds: number;
  title: string;
  thumbnailText: string | null;
  audioTrackTitle: string | null;
  transcript: TranscriptInput[];
  signals: ReferenceSignals;
}): ComputedStyleFeature[] {
  const { durationSeconds, transcript, signals } = input;
  const fullText = transcript
    .map((segment) => segment.text)
    .join(" ")
    .trim();
  const lowerText = fullText.toLowerCase();
  const words = fullText.match(/[\p{L}\p{N}']+/gu) ?? [];
  const titleWords = input.title.match(/[\p{L}\p{N}']+/gu) ?? [];
  const thumbnailWords = input.thumbnailText?.match(/[\p{L}\p{N}']+/gu) ?? [];
  const speechSeconds = unionDuration(transcript);
  const speechPercentage =
    durationSeconds > 0 ? (speechSeconds / durationSeconds) * 100 : 0;
  const silenceSeconds = signals.silenceIntervals.reduce(
    (total, interval) => total + interval.durationSeconds,
    0,
  );
  const firstScene = signals.sceneChanges[0] ?? null;
  const energeticSamples = signals.energyCurve.filter(
    (sample) => sample.normalized >= 0.72,
  );
  const firstEnergyPeak = energeticSamples[0]?.timeSeconds ?? null;
  const actionCandidates = [firstScene, firstEnergyPeak].filter(
    (value): value is number => value !== null && value >= 0.25,
  );
  const firstAction = actionCandidates.length
    ? Math.min(...actionCandidates)
    : null;
  const firstReaction =
    firstAction === null
      ? null
      : (energeticSamples.find((sample) => sample.timeSeconds >= firstAction)
          ?.timeSeconds ?? null);
  const actionToReaction =
    firstAction !== null && firstReaction !== null
      ? Math.max(0, firstReaction - firstAction)
      : null;
  const averageSceneLength =
    durationSeconds / Math.max(1, signals.sceneChanges.length + 1);
  const cutFrequency =
    durationSeconds > 0
      ? (signals.sceneChanges.length / durationSeconds) * 60
      : 0;
  const firstSegmentEnd = transcript[0]?.endSeconds ?? null;
  const hookDuration = Math.min(
    8,
    Math.max(
      0.5,
      firstAction ?? firstSegmentEnd ?? Math.min(3, durationSeconds),
    ),
  );
  const questions = countMatches(fullText, /\?/g);
  const suspense = countMatches(
    lowerText,
    /\b(wait|watch|until|but then|suddenly|last chance|no way|what happens)\b/g,
  );
  const educational = countMatches(
    lowerText,
    /\b(because|here'?s why|you should|tip|rotate|angle|strategy|explain|lesson|learn)\b/g,
  );
  const humor = countMatches(
    lowerText,
    /\b(ha+|laugh|funny|bro|what was that|no way|joke|hilarious)\b/g,
  );
  const storytelling = countMatches(
    lowerText,
    /\b(then|after|before|when|so i|we were|next|finally)\b/g,
  );
  const cta = countMatches(
    transcript
      .filter((segment) => segment.startSeconds >= durationSeconds * 0.7)
      .map((segment) => segment.text.toLowerCase())
      .join(" "),
    /\b(subscribe|follow|like|comment|share|watch next|let me know)\b/g,
  );
  const resultFirst =
    firstAction !== null &&
    firstAction <= 3 &&
    /\b(won|win|killed|clutch|ace|this is how|watch|look)\b/.test(
      lowerText.slice(0, 180),
    );
  const lastEnergy = signals.energyCurve.filter(
    (sample) => sample.timeSeconds >= Math.max(0, durationSeconds - 5),
  );
  const endingStyle = cta
    ? "Call to action"
    : lastEnergy.some((sample) => sample.normalized >= 0.72)
      ? "Ends on an energetic reaction"
      : signals.sceneChanges.some(
            (time) => time >= Math.max(0, durationSeconds - 1),
          )
        ? "Abrupt visual cut"
        : "Natural close or unresolved ending";
  const isLikelyCreatorTrack =
    /creator|microphone|\bmic\b|commentary|voice/i.test(
      input.audioTrackTitle ?? "",
    );

  const results: ComputedStyleFeature[] = [
    feature(
      "total_video_duration",
      "Total video duration",
      round(durationSeconds),
      0.99,
      "Read directly from the local MP4 container with FFprobe.",
      "MEASURED",
      "seconds",
    ),
    feature(
      "estimated_opening_hook_duration",
      "Estimated opening-hook duration",
      round(hookDuration),
      0.35,
      "Heuristic boundary based on the first scene change, energy peak, or completed opening speech segment.",
      "ESTIMATED",
      "seconds",
    ),
    firstAction === null
      ? unavailable(
          "time_until_first_meaningful_action",
          "Time until first meaningful action",
          "No scene change or strong creator-track energy peak provided enough evidence.",
        )
      : feature(
          "time_until_first_meaningful_action",
          "Time until first meaningful action",
          round(firstAction),
          0.35,
          "Earliest local scene-change or strong audio-energy candidate; human review is required.",
          "ESTIMATED",
          "seconds",
        ),
    feature(
      "average_scene_length",
      "Average scene length",
      round(averageSceneLength),
      0.7,
      `${signals.sceneChanges.length} scene-change candidate${signals.sceneChanges.length === 1 ? "" : "s"} crossed the configured threshold.`,
      "ESTIMATED",
      "seconds",
    ),
    feature(
      "approximate_cut_frequency",
      "Approximate cut frequency",
      round(cutFrequency),
      0.7,
      "Calculated from temporally distinct scene-change candidates per minute.",
      "ESTIMATED",
      "cuts/minute",
    ),
    feature(
      "black_frame_locations",
      "Black-frame locations",
      signals.blackFrames,
      0.9,
      `${signals.blackFrames.length} interval${signals.blackFrames.length === 1 ? "" : "s"} met the local FFmpeg darkness and duration thresholds.`,
      "MEASURED",
    ),
    feature(
      "transition_locations",
      "Transition locations",
      signals.sceneChanges,
      0.68,
      "Scene-change threshold crossings are transition candidates, not proof of editorial cuts.",
      "ESTIMATED",
      "seconds",
    ),
    transcript.length
      ? feature(
          "speech_rate",
          "Speech rate",
          round(speechSeconds > 0 ? (words.length / speechSeconds) * 60 : 0),
          0.78,
          `${words.length} locally transcribed words across ${round(speechSeconds)} seconds of timestamped speech.`,
          "MEASURED",
          "words/minute",
        )
      : unavailable(
          "speech_rate",
          "Speech rate",
          "No recognizable creator-track transcript was available.",
        ),
    feature(
      "speech_percentage",
      "Percentage containing speech",
      round(speechPercentage),
      transcript.length ? 0.78 : 0.2,
      transcript.length
        ? "Calculated from the union of local Whisper segment timestamps."
        : "Local transcription found no recognizable speech; zero may also mean the selected track was quiet or unclear.",
      transcript.length ? "MEASURED" : "ESTIMATED",
      "percent",
    ),
    feature(
      "silence_duration",
      "Silence duration",
      round(silenceSeconds),
      signals.energyCurve.length ? 0.86 : 0.1,
      signals.energyCurve.length
        ? `${signals.silenceIntervals.length} interval${signals.silenceIntervals.length === 1 ? "" : "s"} stayed below the configured local audio threshold.`
        : "No selected audio signal was available.",
      signals.energyCurve.length ? "MEASURED" : "UNAVAILABLE",
      "seconds",
    ),
    feature(
      "audio_energy_curve",
      "Audio-energy curve",
      signals.energyCurve,
      signals.energyCurve.length ? 0.85 : 0,
      signals.energyCurve.length
        ? "One local RMS energy sample per approximately one second of selected audio."
        : "No selected audio signal was available.",
      signals.energyCurve.length ? "MEASURED" : "UNAVAILABLE",
    ),
    firstReaction === null
      ? unavailable(
          "reaction_timing",
          "Reaction timing",
          "No strong creator-track energy peak followed the estimated action point.",
        )
      : feature(
          "reaction_timing",
          "Reaction timing",
          round(firstReaction),
          0.38,
          "First strong selected-track energy peak at or after the estimated action point.",
          "ESTIMATED",
          "seconds",
        ),
    unavailable(
      "caption_density",
      "Caption density",
      "Phase 3A does not infer captions without a calibrated OCR region. Enter this manually when captions are visible.",
    ),
    unavailable(
      "average_caption_length",
      "Average on-screen caption length",
      "On-screen caption text was not read. Local speech transcription is not proof of displayed captions.",
    ),
    firstAction === null
      ? unavailable(
          "setup_to_action_timing",
          "Setup-to-action timing",
          "A meaningful action point could not be supported by the available local signals.",
        )
      : feature(
          "setup_to_action_timing",
          "Setup-to-action timing",
          round(firstAction),
          0.35,
          "Treats the opening as setup and the first scene/energy candidate as possible action.",
          "ESTIMATED",
          "seconds",
        ),
    actionToReaction === null
      ? unavailable(
          "action_to_reaction_timing",
          "Action-to-reaction timing",
          "Action and reaction candidates could not both be estimated.",
        )
      : feature(
          "action_to_reaction_timing",
          "Action-to-reaction timing",
          round(actionToReaction),
          0.36,
          "Difference between the estimated action point and first subsequent energy peak.",
          "ESTIMATED",
          "seconds",
        ),
    isLikelyCreatorTrack && transcript.length
      ? feature(
          "voiceover_live_audio_balance",
          "Voiceover versus live-audio balance",
          {
            creatorSpeechPercent: round(speechPercentage),
            liveAudioPercent: null,
          },
          0.25,
          "The selected track name suggests a creator microphone, but the recording does not reveal whether speech was live or added later.",
          "ESTIMATED",
        )
      : unavailable(
          "voiceover_live_audio_balance",
          "Voiceover versus live-audio balance",
          "A finished mixed track cannot reliably distinguish live commentary from later voiceover.",
        ),
    feature(
      "result_first_opening",
      "Use of result-first openings",
      resultFirst,
      0.32,
      "Low-confidence combination of early action timing and opening transcript language.",
      "ESTIMATED",
    ),
    feature(
      "uses_questions",
      "Use of questions",
      { detected: questions > 0, count: questions },
      transcript.length ? 0.76 : 0,
      transcript.length
        ? `Found ${questions} question-mark pattern${questions === 1 ? "" : "s"} in the local transcript.`
        : "No local transcript was available.",
      transcript.length ? "MEASURED" : "UNAVAILABLE",
    ),
    feature(
      "uses_suspense",
      "Use of suspense",
      { detected: suspense > 0, matches: suspense },
      transcript.length ? 0.34 : 0,
      "Keyword patterns are supporting evidence only and require human correction.",
      transcript.length ? "ESTIMATED" : "UNAVAILABLE",
    ),
    feature(
      "uses_educational_explanations",
      "Use of educational explanations",
      { detected: educational > 0, matches: educational },
      transcript.length ? 0.38 : 0,
      "Local transcript explanation/strategy terms provide low-confidence evidence.",
      transcript.length ? "ESTIMATED" : "UNAVAILABLE",
    ),
    feature(
      "uses_humor",
      "Use of humor",
      { detected: humor > 0, matches: humor },
      transcript.length ? 0.3 : 0,
      "Laughter/humor transcript patterns cannot determine whether a moment is actually funny.",
      transcript.length ? "ESTIMATED" : "UNAVAILABLE",
    ),
    feature(
      "uses_high_energy_reactions",
      "Use of high-energy reactions",
      {
        detected: energeticSamples.length > 0,
        energeticSampleCount: energeticSamples.length,
      },
      signals.energyCurve.length ? 0.52 : 0,
      "Strong creator-track RMS energy is a reaction candidate, not an emotion classification.",
      signals.energyCurve.length ? "ESTIMATED" : "UNAVAILABLE",
    ),
    feature(
      "uses_storytelling",
      "Use of storytelling",
      { detected: storytelling >= 2, matches: storytelling },
      transcript.length ? 0.32 : 0,
      "Sequencing words in the local transcript provide low-confidence structure evidence.",
      transcript.length ? "ESTIMATED" : "UNAVAILABLE",
    ),
    feature(
      "average_title_length",
      "Average title length",
      titleWords.length,
      0.99,
      `The saved reference title contains ${titleWords.length} word${titleWords.length === 1 ? "" : "s"}.`,
      "MEASURED",
      "words",
    ),
    input.thumbnailText
      ? feature(
          "thumbnail_text_length",
          "Thumbnail-text length",
          thumbnailWords.length,
          0.99,
          "Counted from the thumbnail text entered by the user.",
          "MEASURED",
          "words",
        )
      : unavailable(
          "thumbnail_text_length",
          "Thumbnail-text length",
          "No thumbnail text was entered for this reference.",
        ),
    feature(
      "typical_clip_length",
      "Typical clip length",
      round(durationSeconds),
      0.99,
      "For one reference, its measured duration is the available clip-length example.",
      "MEASURED",
      "seconds",
    ),
    feature(
      "ending_style",
      "Ending style",
      endingStyle,
      0.33,
      "Estimated from ending transcript call-to-action patterns, recent energy, and final visual cuts.",
      "ESTIMATED",
    ),
    feature(
      "call_to_action_usage",
      "Call-to-action usage",
      { detected: cta > 0, matches: cta },
      transcript.length ? 0.55 : 0,
      "Checked only the final 30% of the local transcript for explicit call-to-action patterns.",
      transcript.length ? "ESTIMATED" : "UNAVAILABLE",
    ),
  ];

  return results;
}

function runManagedProcess(
  analysisId: string,
  executable: string,
  args: string[],
  onOutput?: (output: string) => void,
) {
  return new Promise<string>((resolve, reject) => {
    const controller = activeControllers.get(analysisId);
    if (!controller || controller.cancelRequested) {
      reject(new ReferenceAnalysisCancelledError("Analysis was cancelled."));
      return;
    }
    const child = spawn(executable, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    controller.child = child;
    let output = "";
    let settled = false;
    function collect(chunk: Buffer) {
      if (output.length < 2_000_000) output += chunk.toString();
      onOutput?.(output);
    }
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      controller.child = null;
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      controller.child = null;
      if (controller.cancelRequested) {
        reject(new ReferenceAnalysisCancelledError("Analysis was cancelled."));
      } else if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Local media analysis exited with code ${code}.`));
      }
    });
  });
}

function createProgressWriter(analysisId: string) {
  let lastProgress = -1;
  let pending = Promise.resolve();
  return (progress: number, stage: string) => {
    if (progress <= lastProgress) return;
    lastProgress = progress;
    pending = pending
      .then(() =>
        db.referenceStyleAnalysis.updateMany({
          where: { id: analysisId, status: { in: ACTIVE_STATUSES } },
          data: { progress, stage },
        }),
      )
      .then(() => undefined)
      .catch(() => undefined);
  };
}

export async function runReferenceAnalysisJob(analysisId: string) {
  if (activeControllers.has(analysisId)) return;
  const controller: Controller = { child: null, cancelRequested: false };
  activeControllers.set(analysisId, controller);
  const tempDirectory = referenceAnalysisDirectory(analysisId);
  const audioPath = path.join(tempDirectory, "selected-track.wav");
  const transcriptBase = path.join(tempDirectory, "transcript");
  const transcriptJson = `${transcriptBase}.json`;

  try {
    const analysis = await db.referenceStyleAnalysis.findUnique({
      where: { id: analysisId },
      include: { reference: true, audioTrack: true },
    });
    if (
      !analysis ||
      analysis.status !== "QUEUED" ||
      analysis.cancelRequestedAt
    ) {
      return;
    }
    if (
      analysis.reference.referenceType !== "LOCAL_VIDEO" ||
      !analysis.reference.sourceRelativePath ||
      !analysis.reference.durationSeconds
    ) {
      throw new AppError(
        "Complete style analysis requires a local video you own or have permission to use.",
        422,
        "LOCAL_REFERENCE_REQUIRED",
      );
    }
    if (!appConfig.ffmpegPath) {
      throw new AppError(
        "FFmpeg is unavailable. Reinstall the app dependencies and try again.",
        503,
        "FFMPEG_UNAVAILABLE",
      );
    }

    await ensureDataDirectories();
    await mkdir(tempDirectory, { recursive: true });
    const inputPath = resolveDataPath(analysis.reference.sourceRelativePath);
    const writeProgress = createProgressWriter(analysisId);
    let transcript: TranscriptInput[] = [];

    if (analysis.audioTrack) {
      const health = getTranscriptionHealth();
      if (!health.ready || !appConfig.whisperCliPath) {
        throw new AppError(health.message, 503, "TRANSCRIPTION_NOT_READY");
      }
      await db.referenceStyleAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "EXTRACTING",
          progress: 2,
          stage: "Preparing selected creator audio",
          startedAt: new Date(),
          errorMessage: null,
        },
      });
      await runManagedProcess(
        analysisId,
        appConfig.ffmpegPath,
        buildAudioExtractionArguments(
          inputPath,
          audioPath,
          analysis.audioTrack.streamIndex,
        ),
        (output) => {
          const progress = parseFfmpegProgress(
            output,
            analysis.reference.durationSeconds ?? 0,
          );
          if (progress !== null) {
            writeProgress(
              3 + Math.round(progress * 0.17),
              "Extracting selected creator audio",
            );
          }
        },
      );
      await db.referenceStyleAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "TRANSCRIBING",
          progress: 20,
          stage: "Creating local transcript",
        },
      });
      await runManagedProcess(
        analysisId,
        appConfig.whisperCliPath,
        buildWhisperArguments(audioPath, transcriptBase),
        (output) => {
          const progress = parseWhisperProgress(output);
          if (progress !== null) {
            writeProgress(
              20 + Math.round(progress * 0.4),
              "Creating local transcript",
            );
          }
        },
      );
      transcript = parseWhisperJson(
        JSON.parse(await readFile(transcriptJson, "utf8")) as unknown,
      );
    } else {
      await db.referenceStyleAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "MEASURING",
          progress: 20,
          stage: "No audio track; measuring visual structure",
          startedAt: new Date(),
          errorMessage: null,
        },
      });
    }

    if (controller.cancelRequested) {
      throw new ReferenceAnalysisCancelledError("Analysis was cancelled.");
    }
    await db.referenceStyleAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "MEASURING",
        progress: 62,
        stage: "Measuring cuts and transitions",
      },
    });
    const videoOutput = await runManagedProcess(
      analysisId,
      appConfig.ffmpegPath,
      buildReferenceVideoSignalArguments(inputPath),
    );
    writeProgress(80, "Measuring audio energy and silence");
    const audioOutput = analysis.audioTrack
      ? await runManagedProcess(
          analysisId,
          appConfig.ffmpegPath,
          buildReferenceAudioSignalArguments(audioPath),
        )
      : "";
    const signals = parseReferenceSignalOutput(videoOutput, audioOutput);
    const features = computeReferenceStyleFeatures({
      durationSeconds: analysis.reference.durationSeconds,
      title: analysis.reference.title,
      thumbnailText: analysis.reference.thumbnailText,
      audioTrackTitle: analysis.audioTrack?.title ?? null,
      transcript,
      signals,
    });

    if (controller.cancelRequested) {
      throw new ReferenceAnalysisCancelledError("Analysis was cancelled.");
    }
    await db.referenceStyleAnalysis.update({
      where: { id: analysisId },
      data: { status: "SAVING", progress: 95, stage: "Saving style evidence" },
    });
    await db.$transaction([
      db.referenceTranscriptSegment.deleteMany({ where: { analysisId } }),
      db.referenceStyleFeature.deleteMany({ where: { analysisId } }),
      db.referenceTranscriptSegment.createMany({
        data: transcript.map((segment) => ({
          analysisId,
          segmentOrder: segment.segmentOrder,
          startSeconds: segment.startSeconds,
          endSeconds: segment.endSeconds,
          text: segment.text,
          originalText: segment.text,
        })),
      }),
      db.referenceStyleFeature.createMany({
        data: features.map((item) => ({
          analysisId,
          key: item.key,
          label: item.label,
          valueJson: JSON.stringify(item.value),
          originalValueJson: JSON.stringify(item.value),
          unit: item.unit,
          confidence: item.confidence,
          evidence: item.evidence,
          source: item.source,
          detectorVersion: ANALYZER_VERSION,
        })),
      }),
      db.referenceStyleAnalysis.update({
        where: { id: analysisId },
        data: {
          status: "COMPLETED",
          progress: 100,
          stage: "Style analysis ready",
          errorMessage: null,
          completedAt: new Date(),
        },
      }),
    ]);
  } catch (error) {
    const cancelled =
      error instanceof ReferenceAnalysisCancelledError ||
      controller.cancelRequested ||
      Boolean(
        await db.referenceStyleAnalysis
          .findUnique({
            where: { id: analysisId },
            select: { cancelRequestedAt: true },
          })
          .then((analysis) => analysis?.cancelRequestedAt)
          .catch(() => null),
      );
    await db.referenceStyleAnalysis
      .update({
        where: { id: analysisId },
        data: cancelled
          ? {
              status: "CANCELLED",
              stage: "Cancelled",
              errorMessage: null,
              completedAt: new Date(),
            }
          : {
              status: "ERROR",
              stage: "Style analysis failed",
              errorMessage:
                error instanceof AppError
                  ? error.message
                  : "Local style analysis could not finish. The reference file remains safe; try again.",
              completedAt: new Date(),
            },
      })
      .catch(() => undefined);
  } finally {
    activeControllers.delete(analysisId);
    await rm(tempDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
}

export function scheduleReferenceAnalysis(analysisId: string) {
  setImmediate(() => void runReferenceAnalysisJob(analysisId));
}

export async function cancelReferenceAnalysis(analysisId: string) {
  const analysis = await db.referenceStyleAnalysis.findUnique({
    where: { id: analysisId },
  });
  if (!analysis) {
    throw new AppError(
      "That style analysis job no longer exists.",
      404,
      "ANALYSIS_NOT_FOUND",
    );
  }
  if (!ACTIVE_STATUSES.includes(analysis.status)) return analysis;
  const now = new Date();
  const controller = activeControllers.get(analysisId);
  if (!controller) {
    return db.referenceStyleAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "CANCELLED",
        stage: "Cancelled",
        cancelRequestedAt: now,
        completedAt: now,
      },
    });
  }
  controller.cancelRequested = true;
  controller.child?.kill("SIGTERM");
  if (controller.child) {
    const child = controller.child;
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 2_000);
    forceKill.unref();
  }
  return db.referenceStyleAnalysis.update({
    where: { id: analysisId },
    data: { stage: "Cancelling local analysis", cancelRequestedAt: now },
  });
}

export async function reconcileInterruptedReferenceAnalyses() {
  if (analysisGlobal.r6ReferenceAnalysisReconciled) return;
  const activeIds = [...activeControllers.keys()];
  const idFilter = activeIds.length > 0 ? { notIn: activeIds } : undefined;
  await db.referenceStyleAnalysis.updateMany({
    where: {
      id: idFilter,
      status: { in: ACTIVE_STATUSES },
      cancelRequestedAt: { not: null },
    },
    data: {
      status: "CANCELLED",
      stage: "Cancelled",
      completedAt: new Date(),
      errorMessage: null,
    },
  });
  await db.referenceStyleAnalysis.updateMany({
    where: { id: idFilter, status: { in: ACTIVE_STATUSES } },
    data: {
      status: "ERROR",
      stage: "Interrupted",
      errorMessage:
        "Style analysis stopped when the application restarted. Start it again when ready.",
      completedAt: new Date(),
    },
  });
  analysisGlobal.r6ReferenceAnalysisReconciled = true;
}

export async function cleanupReferenceAnalysisArtifacts() {
  await ensureDataDirectories();
  const active = new Set(
    (
      await db.referenceStyleAnalysis.findMany({
        where: { status: { in: ACTIVE_STATUSES } },
        select: { id: true },
      })
    ).map((analysis) => analysis.id),
  );
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(
    path.dirname(referenceAnalysisDirectory("placeholder")),
    { withFileTypes: true },
  ).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !active.has(entry.name))
      .map((entry) =>
        rm(referenceAnalysisDirectory(entry.name), {
          recursive: true,
          force: true,
        }),
      ),
  );
}
