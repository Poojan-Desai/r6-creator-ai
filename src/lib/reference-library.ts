import type {
  ReferenceAudioTrack,
  ReferenceStyleAnalysis,
  ReferenceStyleFeature,
  ReferenceTranscriptSegment,
  ReferenceType,
  ReferenceVideo,
} from "@prisma/client";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { getRecommendedTrackId, type AudioTrackDto } from "@/lib/transcription";

const shortText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);

export const localReferenceFieldsSchema = z.object({
  title: shortText("Title", 160),
  creatorName: shortText("Creator or channel name", 120),
  game: shortText("Game", 100),
  platform: shortText("Platform", 80),
  sourceType: shortText("Source type", 80),
  sourceUrl: z
    .string()
    .trim()
    .url("Source URL must be a complete URL.")
    .optional()
    .or(z.literal("")),
  contentCategory: shortText("Content category", 100),
  notes: z.string().trim().max(2_000).optional().default(""),
  thumbnailText: z.string().trim().max(100).optional().default(""),
  permissionConfirmed: z.literal("true", {
    error: "Confirm that you own this file or have permission to analyze it.",
  }),
});

export const youtubeReferenceInputSchema = z.object({
  url: shortText("YouTube URL", 500),
  title: z.string().trim().max(160).optional().default(""),
  creatorName: z.string().trim().max(120).optional().default(""),
  game: z.string().trim().max(100).optional().default("Rainbow Six Siege"),
  platform: z.string().trim().max(80).optional().default("YouTube"),
  sourceType: z.string().trim().max(80).optional().default("REFERENCE_LINK"),
  contentCategory: shortText("Content category", 100),
  notes: z.string().trim().max(2_000).optional().default(""),
  thumbnailText: z.string().trim().max(100).optional().default(""),
});

export const referenceFeatureUpdateSchema = z.object({
  value: z.union([
    z.string().max(2_000),
    z.number().finite(),
    z.boolean(),
    z.null(),
  ]),
  correctionNote: z.string().trim().max(500).optional().default(""),
});

export type ReferenceAudioTrackDto = AudioTrackDto;

export type ReferenceFeatureDto = {
  id: string;
  key: string;
  label: string;
  value: unknown;
  originalValue: unknown;
  unit: string | null;
  confidence: number;
  evidence: string;
  source: ReferenceStyleFeature["source"];
  detectorVersion: string;
  manuallyCorrected: boolean;
  correctionNote: string | null;
  updatedAt: string;
};

export type ReferenceTranscriptSegmentDto = {
  id: string;
  segmentOrder: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
  originalText: string;
};

export type ReferenceAnalysisDto = {
  id: string;
  status: ReferenceStyleAnalysis["status"];
  progress: number;
  stage: string;
  analyzerVersion: string;
  errorMessage: string | null;
  audioTrackId: string | null;
  cancelRequestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  features: ReferenceFeatureDto[];
  transcriptSegments: ReferenceTranscriptSegmentDto[];
};

export type ReferenceSummaryDto = {
  id: string;
  referenceType: ReferenceType;
  title: string;
  creatorName: string;
  game: string;
  platform: string;
  sourceType: string;
  sourceUrl: string | null;
  youtubeVideoId: string | null;
  contentCategory: string;
  permissionConfirmed: boolean;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  metadataSource: string;
  latestAnalysisStatus: ReferenceStyleAnalysis["status"] | "NOT_STARTED";
  createdAt: string;
  updatedAt: string;
};

type ReferenceWithLatestAnalysis = ReferenceVideo & {
  styleAnalyses?: ReferenceStyleAnalysis[];
};

export function serializeReferenceSummary(
  reference: ReferenceWithLatestAnalysis,
): ReferenceSummaryDto {
  return {
    id: reference.id,
    referenceType: reference.referenceType,
    title: reference.title,
    creatorName: reference.creatorName,
    game: reference.game,
    platform: reference.platform,
    sourceType: reference.sourceType,
    sourceUrl: reference.sourceUrl,
    youtubeVideoId: reference.youtubeVideoId,
    contentCategory: reference.contentCategory,
    permissionConfirmed: reference.permissionConfirmed,
    durationSeconds: reference.durationSeconds,
    width: reference.width,
    height: reference.height,
    fileSizeBytes:
      reference.fileSizeBytes === null ? null : Number(reference.fileSizeBytes),
    metadataSource: reference.metadataSource,
    latestAnalysisStatus: reference.styleAnalyses?.[0]?.status ?? "NOT_STARTED",
    createdAt: reference.createdAt.toISOString(),
    updatedAt: reference.updatedAt.toISOString(),
  };
}

export function serializeReferenceAudioTrack(
  track: ReferenceAudioTrack,
): ReferenceAudioTrackDto {
  return {
    id: track.id,
    streamIndex: track.streamIndex,
    codecName: track.codecName,
    channels: track.channels,
    channelLayout: track.channelLayout,
    language: track.language,
    title: track.title,
    isDefault: track.isDefault,
    preferenceScore: track.preferenceScore,
    preferenceReason: track.preferenceReason,
  };
}

export function serializeReferenceFeature(
  feature: ReferenceStyleFeature,
): ReferenceFeatureDto {
  return {
    id: feature.id,
    key: feature.key,
    label: feature.label,
    value: parseJson(feature.valueJson),
    originalValue: parseJson(feature.originalValueJson),
    unit: feature.unit,
    confidence: feature.confidence,
    evidence: feature.evidence,
    source: feature.source,
    detectorVersion: feature.detectorVersion,
    manuallyCorrected: feature.manuallyCorrected,
    correctionNote: feature.correctionNote,
    updatedAt: feature.updatedAt.toISOString(),
  };
}

export function serializeReferenceTranscriptSegment(
  segment: ReferenceTranscriptSegment,
): ReferenceTranscriptSegmentDto {
  return {
    id: segment.id,
    segmentOrder: segment.segmentOrder,
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    text: segment.text,
    originalText: segment.originalText,
  };
}

export function serializeReferenceAnalysis(
  analysis: ReferenceStyleAnalysis & {
    features?: ReferenceStyleFeature[];
    transcriptSegments?: ReferenceTranscriptSegment[];
  },
): ReferenceAnalysisDto {
  return {
    id: analysis.id,
    status: analysis.status,
    progress: analysis.progress,
    stage: analysis.stage,
    analyzerVersion: analysis.analyzerVersion,
    errorMessage: analysis.errorMessage,
    audioTrackId: analysis.audioTrackId,
    cancelRequestedAt: analysis.cancelRequestedAt?.toISOString() ?? null,
    startedAt: analysis.startedAt?.toISOString() ?? null,
    completedAt: analysis.completedAt?.toISOString() ?? null,
    createdAt: analysis.createdAt.toISOString(),
    updatedAt: analysis.updatedAt.toISOString(),
    features: (analysis.features ?? []).map(serializeReferenceFeature),
    transcriptSegments: (analysis.transcriptSegments ?? []).map(
      serializeReferenceTranscriptSegment,
    ),
  };
}

export function getRecommendedReferenceTrackId(tracks: ReferenceAudioTrack[]) {
  return getRecommendedTrackId(tracks.map(serializeReferenceAudioTrack));
}

export function assertLocalReferencePermission(fields: Record<string, string>) {
  const parsed = localReferenceFieldsSchema.parse(fields);
  if (parsed.permissionConfirmed !== "true") {
    throw new AppError(
      "Confirm that you own this file or have permission to analyze it.",
      400,
      "REFERENCE_PERMISSION_REQUIRED",
    );
  }
  return parsed;
}

export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
