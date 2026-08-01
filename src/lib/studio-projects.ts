import { rm } from "node:fs/promises";

import {
  Prisma,
  type StudioInputKind,
  type StudioInputMode,
  type StudioOutputGoal,
  type StudioReferenceMode,
} from "@prisma/client";
import { z } from "zod";

import {
  longFormRenderDirectory,
  shortFormExportDirectory,
  shortFormProxyDirectory,
  studioMediaDirectory,
} from "@/lib/data-paths";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const STUDIO_OUTPUT_GOALS: ReadonlyArray<{
  value: StudioOutputGoal;
  label: string;
  description: string;
}> = [
  {
    value: "SHORT_CLIP",
    label: "Short clip",
    description: "A focused horizontal or vertical gameplay moment.",
  },
  {
    value: "YOUTUBE_SHORT",
    label: "YouTube Short",
    description: "A vertical story designed for YouTube Shorts.",
  },
  {
    value: "TIKTOK",
    label: "TikTok",
    description: "A compact vertical post with a clear opening.",
  },
  {
    value: "LONG_FORM_YOUTUBE",
    label: "Long-form YouTube video",
    description: "A complete story built from one or more recordings.",
  },
  {
    value: "MATCH_RECAP",
    label: "Match recap",
    description: "A structured summary of the important rounds and events.",
  },
  {
    value: "COACHING_REPORT",
    label: "Coaching report",
    description: "An evidence-backed review of visible decisions and outcomes.",
  },
  {
    value: "CONTENT_AND_COACHING",
    label: "Both content and coaching",
    description: "Use one evidence set for publishing and personal review.",
  },
];

export const STUDIO_INPUT_MODES: ReadonlyArray<{
  value: StudioInputMode;
  label: string;
  description: string;
}> = [
  {
    value: "SCREEN_RECORDING_ONLY",
    label: "Screen recording only",
    description: "Use real gameplay pixels, audio, transcript, and clips.",
  },
  {
    value: "MATCH_REPLAY_ONLY",
    label: "Match Replay only",
    description:
      "Use structured replay facts. Replay files do not contain gameplay video or audio.",
  },
  {
    value: "SCREEN_RECORDING_AND_REPLAY",
    label: "Both — recommended",
    description:
      "Use the recording for visuals and the synchronized replay for supported match facts.",
  },
];

export const STUDIO_REFERENCE_MODES: ReadonlyArray<{
  value: StudioReferenceMode;
  label: string;
  description: string;
}> = [
  {
    value: "NONE",
    label: "No reference",
    description: "Create from your instructions and source evidence.",
  },
  {
    value: "STYLE_PROFILE",
    label: "Creator Style Profile",
    description: "Use saved high-level pacing and structure preferences.",
  },
  {
    value: "YOUTUBE_REFERENCE",
    label: "YouTube reference link",
    description:
      "Use permitted public metadata and manually supplied structural notes only.",
  },
  {
    value: "LOCAL_REFERENCE",
    label: "Permitted local reference",
    description:
      "Use measured high-level characteristics from a file you may analyze.",
  },
];

export const STUDIO_FOCUS_AREAS = [
  "Final-round clutch",
  "Funny moments",
  "Best kills",
  "Educational breakdown",
  "Full ranked-match story",
  "Mistakes",
  "Crosshair placement",
  "Positioning",
  "Re-peeks",
  "Team play",
  "Objective play",
] as const;

const optionalId = z.string().trim().min(1).max(191).nullable().optional();
const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().optional();

export const studioProjectSettingsSchema = z
  .object({
    name: z.string().trim().min(1, "Project name is required.").max(120),
    outputGoal: z.enum([
      "SHORT_CLIP",
      "YOUTUBE_SHORT",
      "TIKTOK",
      "LONG_FORM_YOUTUBE",
      "MATCH_RECAP",
      "COACHING_REPORT",
      "CONTENT_AND_COACHING",
    ]),
    inputMode: z.enum([
      "SCREEN_RECORDING_ONLY",
      "MATCH_REPLAY_ONLY",
      "SCREEN_RECORDING_AND_REPLAY",
    ]),
    referenceMode: z
      .enum(["NONE", "STYLE_PROFILE", "YOUTUBE_REFERENCE", "LOCAL_REFERENCE"])
      .default("NONE"),
    focusAreas: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    contentInstructions: optionalText(5_000),
    coachingGoals: optionalText(5_000),
    primaryRecordingId: optionalId,
    additionalRecordingIds: z
      .array(z.string().trim().min(1).max(191))
      .max(20)
      .default([]),
    replayPackageId: optionalId,
    referenceVideoId: optionalId,
    styleProfileId: optionalId,
    selectedPlayerStableId: optionalId,
    selectedAudioTrackId: optionalId,
    mapId: optionalId,
    mapVersionId: optionalId,
    bombSiteId: optionalId,
    side: z.enum(["UNKNOWN", "ATTACK", "DEFENSE"]).default("UNKNOWN"),
    operatorId: optionalId,
    operatorVersionId: optionalId,
    roundResult: optionalText(120),
    contextUserConfirmed: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, context) => {
    const hasRecording = Boolean(value.primaryRecordingId);
    const hasReplay = Boolean(value.replayPackageId);

    if (value.inputMode === "SCREEN_RECORDING_ONLY" && !hasRecording) {
      context.addIssue({
        code: "custom",
        path: ["primaryRecordingId"],
        message: "Choose a primary screen recording.",
      });
    }
    if (value.inputMode === "SCREEN_RECORDING_ONLY" && hasReplay) {
      context.addIssue({
        code: "custom",
        path: ["replayPackageId"],
        message:
          "Screen-recording-only mode cannot include a Match Replay. Choose the combined mode instead.",
      });
    }
    if (value.inputMode === "MATCH_REPLAY_ONLY" && !hasReplay) {
      context.addIssue({
        code: "custom",
        path: ["replayPackageId"],
        message: "Choose a Match Replay package.",
      });
    }
    if (
      value.inputMode === "MATCH_REPLAY_ONLY" &&
      (hasRecording || value.additionalRecordingIds.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["primaryRecordingId"],
        message:
          "Replay-only mode cannot include a screen recording. Choose the combined mode instead.",
      });
    }
    if (
      value.inputMode === "SCREEN_RECORDING_AND_REPLAY" &&
      (!hasRecording || !hasReplay)
    ) {
      context.addIssue({
        code: "custom",
        path: ["inputMode"],
        message:
          "Combined mode requires both a primary recording and a Match Replay.",
      });
    }
    if (!hasRecording && value.additionalRecordingIds.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["additionalRecordingIds"],
        message:
          "Choose a primary recording before adding supporting recordings.",
      });
    }
    if (
      value.primaryRecordingId &&
      value.additionalRecordingIds.includes(value.primaryRecordingId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["additionalRecordingIds"],
        message:
          "The primary recording cannot also be an additional recording.",
      });
    }
    if (
      new Set(value.additionalRecordingIds).size !==
      value.additionalRecordingIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["additionalRecordingIds"],
        message: "Choose each additional recording only once.",
      });
    }
    if (!hasRecording && value.selectedAudioTrackId) {
      context.addIssue({
        code: "custom",
        path: ["selectedAudioTrackId"],
        message: "An audio track requires a selected recording.",
      });
    }
    if (!hasReplay && value.selectedPlayerStableId) {
      context.addIssue({
        code: "custom",
        path: ["selectedPlayerStableId"],
        message: "A replay player requires a selected Match Replay.",
      });
    }

    const expectsStyle = value.referenceMode === "STYLE_PROFILE";
    const expectsReference =
      value.referenceMode === "LOCAL_REFERENCE" ||
      value.referenceMode === "YOUTUBE_REFERENCE";
    if (expectsStyle && !value.styleProfileId) {
      context.addIssue({
        code: "custom",
        path: ["styleProfileId"],
        message: "Choose a Creator Style Profile.",
      });
    }
    if (expectsReference && !value.referenceVideoId) {
      context.addIssue({
        code: "custom",
        path: ["referenceVideoId"],
        message: "Choose a saved reference.",
      });
    }
    if (value.referenceMode === "NONE" && value.referenceVideoId) {
      context.addIssue({
        code: "custom",
        path: ["referenceVideoId"],
        message: "Remove the reference or choose its reference type.",
      });
    }
    if (value.referenceMode === "NONE" && value.styleProfileId) {
      context.addIssue({
        code: "custom",
        path: ["styleProfileId"],
        message: "Remove the style profile or select it as the reference.",
      });
    }
    if (!expectsStyle && value.styleProfileId) {
      context.addIssue({
        code: "custom",
        path: ["styleProfileId"],
        message:
          "A Creator Style Profile can only be used with the style-profile reference option.",
      });
    }
    if (!expectsReference && value.referenceVideoId) {
      context.addIssue({
        code: "custom",
        path: ["referenceVideoId"],
        message:
          "A saved reference can only be used with a local or YouTube reference option.",
      });
    }
  });

export type StudioProjectSettings = z.infer<typeof studioProjectSettingsSchema>;

export type StudioInputSpec = {
  kind: StudioInputKind;
  videoProjectId?: string;
  replayPackageId?: string;
  referenceVideoId?: string;
  sortOrder: number;
};

export function buildStudioInputSpecs(
  settings: StudioProjectSettings,
): StudioInputSpec[] {
  const inputs: StudioInputSpec[] = [];
  if (settings.primaryRecordingId) {
    inputs.push({
      kind: "PRIMARY_RECORDING",
      videoProjectId: settings.primaryRecordingId,
      sortOrder: 0,
    });
  }
  settings.additionalRecordingIds.forEach((videoProjectId, index) => {
    inputs.push({
      kind: "ADDITIONAL_RECORDING",
      videoProjectId,
      sortOrder: index + 1,
    });
  });
  if (settings.replayPackageId) {
    inputs.push({
      kind: "MATCH_REPLAY",
      replayPackageId: settings.replayPackageId,
      sortOrder: 0,
    });
  }
  if (settings.referenceVideoId) {
    inputs.push({
      kind:
        settings.referenceMode === "YOUTUBE_REFERENCE"
          ? "YOUTUBE_REFERENCE"
          : "LOCAL_REFERENCE",
      referenceVideoId: settings.referenceVideoId,
      sortOrder: 0,
    });
  }
  return inputs;
}

const studioProjectInclude = Prisma.validator<Prisma.StudioProjectInclude>()({
  inputs: {
    orderBy: [{ kind: "asc" as const }, { sortOrder: "asc" as const }],
    include: {
      videoProject: {
        include: {
          audioTracks: { orderBy: { streamIndex: "asc" as const } },
          _count: { select: { clips: true } },
        },
      },
      replayPackage: {
        include: {
          canonicalMatch: {
            include: {
              players: {
                orderBy: [
                  { teamIndex: "asc" as const },
                  { privacyAlias: "asc" as const },
                ],
              },
            },
          },
        },
      },
      referenceVideo: true,
    },
  },
  selectedAudioTrack: true,
  styleProfile: true,
  map: true,
  mapVersion: true,
  bombSite: true,
  operator: true,
  operatorVersion: true,
  synchronizations: {
    orderBy: { version: "desc" as const },
    take: 10,
    select: {
      id: true,
      version: true,
      status: true,
      confidence: true,
      confidenceLabel: true,
      userVerifiedAt: true,
      createdAt: true,
      _count: { select: { anchors: true } },
    },
  },
});

type StudioProjectWithDetail = Prisma.StudioProjectGetPayload<{
  include: typeof studioProjectInclude;
}>;

function parseStringArray(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function serializeStudioProject(project: StudioProjectWithDetail) {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    outputGoal: project.outputGoal,
    inputMode: project.inputMode,
    referenceMode: project.referenceMode,
    focusAreas: parseStringArray(project.focusAreasJson),
    contentInstructions: project.contentInstructions,
    coachingGoals: project.coachingGoals,
    selectedPlayerStableId: project.selectedPlayerStableId,
    selectedPlayerAlias: project.selectedPlayerAlias,
    selectedAudioTrack: project.selectedAudioTrack
      ? {
          id: project.selectedAudioTrack.id,
          projectId: project.selectedAudioTrack.projectId,
          streamIndex: project.selectedAudioTrack.streamIndex,
          title: project.selectedAudioTrack.title,
          language: project.selectedAudioTrack.language,
          channels: project.selectedAudioTrack.channels,
          role: project.selectedAudioTrack.analysisRole,
        }
      : null,
    styleProfile: project.styleProfile
      ? { id: project.styleProfile.id, name: project.styleProfile.name }
      : null,
    map: project.map ? { id: project.map.id, name: project.map.name } : null,
    mapVersion: project.mapVersion
      ? {
          id: project.mapVersion.id,
          name: project.mapVersion.versionName,
          status: project.mapVersion.knowledgeStatus,
        }
      : null,
    bombSite: project.bombSite
      ? { id: project.bombSite.id, name: project.bombSite.displayName }
      : null,
    side: project.side,
    operator: project.operator
      ? { id: project.operator.id, name: project.operator.displayName }
      : null,
    operatorVersion: project.operatorVersion
      ? {
          id: project.operatorVersion.id,
          name: project.operatorVersion.versionName,
        }
      : null,
    roundResult: project.roundResult,
    contextUserConfirmed: project.contextUserConfirmed,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    synchronizations: project.synchronizations.map((synchronization) => ({
      id: synchronization.id,
      version: synchronization.version,
      status: synchronization.status,
      confidence: synchronization.confidence,
      confidenceLabel: synchronization.confidenceLabel,
      anchorCount: synchronization._count.anchors,
      userVerifiedAt: synchronization.userVerifiedAt?.toISOString() ?? null,
      createdAt: synchronization.createdAt.toISOString(),
    })),
    inputs: project.inputs.map((input) => ({
      id: input.id,
      kind: input.kind,
      sortOrder: input.sortOrder,
      videoProject: input.videoProject
        ? {
            id: input.videoProject.id,
            name: input.videoProject.name,
            originalFilename: input.videoProject.originalFilename,
            durationSeconds: input.videoProject.durationSeconds,
            width: input.videoProject.width,
            height: input.videoProject.height,
            frameRate: input.videoProject.frameRate,
            clipCount: input.videoProject._count.clips,
            audioTracks: input.videoProject.audioTracks.map((track) => ({
              id: track.id,
              streamIndex: track.streamIndex,
              title: track.title,
              language: track.language,
              channels: track.channels,
              role: track.analysisRole,
            })),
          }
        : null,
      replayPackage: input.replayPackage
        ? {
            id: input.replayPackage.id,
            displayName: input.replayPackage.displayName,
            status: input.replayPackage.status,
            roundFileCount: input.replayPackage.roundFileCount,
            canonicalMatch: input.replayPackage.canonicalMatch
              ? {
                  id: input.replayPackage.canonicalMatch.id,
                  mapName: input.replayPackage.canonicalMatch.mapName,
                  gameMode: input.replayPackage.canonicalMatch.gameMode,
                  matchType: input.replayPackage.canonicalMatch.matchType,
                  players: input.replayPackage.canonicalMatch.players.map(
                    (player) => ({
                      stableId: player.stableId,
                      privacyAlias: player.privacyAlias,
                      operatorName: player.operatorName,
                      teamIndex: player.teamIndex,
                      isRecordingPlayer: player.isRecordingPlayer,
                    }),
                  ),
                }
              : null,
          }
        : null,
      referenceVideo: input.referenceVideo
        ? {
            id: input.referenceVideo.id,
            title: input.referenceVideo.title,
            referenceType: input.referenceVideo.referenceType,
            creatorName: input.referenceVideo.creatorName,
            permissionConfirmed: input.referenceVideo.permissionConfirmed,
          }
        : null,
    })),
  };
}

export type StudioProjectDto = ReturnType<typeof serializeStudioProject>;

type TransactionClient = Prisma.TransactionClient;

async function validateRelatedSelections(
  transaction: TransactionClient,
  settings: StudioProjectSettings,
) {
  const recordingIds = [
    ...(settings.primaryRecordingId ? [settings.primaryRecordingId] : []),
    ...settings.additionalRecordingIds,
  ];
  if (recordingIds.length) {
    const recordingCount = await transaction.project.count({
      where: { id: { in: recordingIds } },
    });
    if (recordingCount !== recordingIds.length) {
      throw new AppError(
        "One of the selected recordings no longer exists.",
        400,
        "STUDIO_RECORDING_NOT_FOUND",
      );
    }
  }

  if (settings.selectedAudioTrackId) {
    const audioTrack = await transaction.audioTrack.findUnique({
      where: { id: settings.selectedAudioTrackId },
      select: { projectId: true },
    });
    if (!audioTrack || !recordingIds.includes(audioTrack.projectId)) {
      throw new AppError(
        "Choose an audio track from one of this project's recordings.",
        400,
        "STUDIO_AUDIO_TRACK_MISMATCH",
      );
    }
  }

  let selectedPlayerAlias: string | null = null;
  if (settings.replayPackageId) {
    const replay = await transaction.replayPackage.findUnique({
      where: { id: settings.replayPackageId },
      select: {
        permissionConfirmed: true,
        canonicalMatch: {
          select: {
            players: {
              select: { stableId: true, privacyAlias: true },
            },
          },
        },
      },
    });
    if (!replay) {
      throw new AppError(
        "The selected Match Replay no longer exists.",
        400,
        "STUDIO_REPLAY_NOT_FOUND",
      );
    }
    if (!replay.permissionConfirmed) {
      throw new AppError(
        "The selected Match Replay does not have a saved lawful-possession confirmation.",
        400,
        "STUDIO_REPLAY_PERMISSION_REQUIRED",
      );
    }
    if (settings.selectedPlayerStableId) {
      const player = replay.canonicalMatch?.players.find(
        (item) => item.stableId === settings.selectedPlayerStableId,
      );
      if (!player) {
        throw new AppError(
          "Choose a player from the selected Match Replay.",
          400,
          "STUDIO_PLAYER_MISMATCH",
        );
      }
      selectedPlayerAlias = player.privacyAlias;
    }
  }

  if (settings.referenceVideoId) {
    const reference = await transaction.referenceVideo.findUnique({
      where: { id: settings.referenceVideoId },
      select: { referenceType: true, permissionConfirmed: true },
    });
    if (!reference) {
      throw new AppError(
        "The selected reference no longer exists.",
        400,
        "STUDIO_REFERENCE_NOT_FOUND",
      );
    }
    const expectedType =
      settings.referenceMode === "YOUTUBE_REFERENCE"
        ? "YOUTUBE_LINK"
        : "LOCAL_VIDEO";
    if (reference.referenceType !== expectedType) {
      throw new AppError(
        "Choose a reference that matches the selected reference type.",
        400,
        "STUDIO_REFERENCE_TYPE_MISMATCH",
      );
    }
    if (
      reference.referenceType === "LOCAL_VIDEO" &&
      !reference.permissionConfirmed
    ) {
      throw new AppError(
        "The local reference is missing its saved permission confirmation.",
        400,
        "STUDIO_REFERENCE_PERMISSION_REQUIRED",
      );
    }
  }

  if (settings.styleProfileId) {
    const profile = await transaction.creatorStyleProfile.findUnique({
      where: { id: settings.styleProfileId },
      select: { id: true },
    });
    if (!profile) {
      throw new AppError(
        "The selected Creator Style Profile no longer exists.",
        400,
        "STUDIO_STYLE_PROFILE_NOT_FOUND",
      );
    }
  }

  if (settings.mapId) {
    const map = await transaction.siegeMap.findUnique({
      where: { id: settings.mapId },
      select: { id: true },
    });
    if (!map) {
      throw new AppError(
        "The selected map no longer exists.",
        400,
        "STUDIO_MAP_NOT_FOUND",
      );
    }
  }
  if (settings.mapVersionId) {
    const version = await transaction.mapVersion.findUnique({
      where: { id: settings.mapVersionId },
      select: { mapId: true },
    });
    if (!version || version.mapId !== settings.mapId) {
      throw new AppError(
        "Choose a map version that belongs to the selected map.",
        400,
        "STUDIO_MAP_VERSION_MISMATCH",
      );
    }
  }
  if (settings.bombSiteId) {
    const bombSite = await transaction.mapBombSitePair.findUnique({
      where: { id: settings.bombSiteId },
      select: { mapVersionId: true },
    });
    if (!bombSite || bombSite.mapVersionId !== settings.mapVersionId) {
      throw new AppError(
        "Choose a bomb site that belongs to the selected map version.",
        400,
        "STUDIO_BOMB_SITE_MISMATCH",
      );
    }
  }
  if (!settings.mapId && (settings.mapVersionId || settings.bombSiteId)) {
    throw new AppError(
      "Choose a map before selecting its version or bomb site.",
      400,
      "STUDIO_MAP_REQUIRED",
    );
  }

  if (settings.operatorId) {
    const operator = await transaction.siegeOperator.findUnique({
      where: { id: settings.operatorId },
      select: { id: true },
    });
    if (!operator) {
      throw new AppError(
        "The selected operator no longer exists.",
        400,
        "STUDIO_OPERATOR_NOT_FOUND",
      );
    }
  }
  if (settings.operatorVersionId) {
    const version = await transaction.operatorVersion.findUnique({
      where: { id: settings.operatorVersionId },
      select: { operatorId: true },
    });
    if (!version || version.operatorId !== settings.operatorId) {
      throw new AppError(
        "Choose an operator version that belongs to the selected operator.",
        400,
        "STUDIO_OPERATOR_VERSION_MISMATCH",
      );
    }
  }
  if (!settings.operatorId && settings.operatorVersionId) {
    throw new AppError(
      "Choose an operator before selecting its version.",
      400,
      "STUDIO_OPERATOR_REQUIRED",
    );
  }

  return { selectedPlayerAlias };
}

function studioProjectData(
  settings: StudioProjectSettings,
  selectedPlayerAlias: string | null,
) {
  return {
    name: settings.name,
    status: "READY" as const,
    outputGoal: settings.outputGoal,
    inputMode: settings.inputMode,
    referenceMode: settings.referenceMode,
    focusAreasJson: JSON.stringify(settings.focusAreas),
    contentInstructions: settings.contentInstructions || null,
    coachingGoals: settings.coachingGoals || null,
    selectedPlayerStableId: settings.selectedPlayerStableId || null,
    selectedPlayerAlias,
    selectedAudioTrackId: settings.selectedAudioTrackId || null,
    styleProfileId: settings.styleProfileId || null,
    mapId: settings.mapId || null,
    mapVersionId: settings.mapVersionId || null,
    bombSiteId: settings.bombSiteId || null,
    side: settings.side,
    operatorId: settings.operatorId || null,
    operatorVersionId: settings.operatorVersionId || null,
    roundResult: settings.roundResult || null,
    contextUserConfirmed: settings.contextUserConfirmed,
  };
}

function studioInputData(
  studioProjectId: string,
  settings: StudioProjectSettings,
) {
  return buildStudioInputSpecs(settings).map((input) => ({
    studioProjectId,
    kind: input.kind,
    videoProjectId: input.videoProjectId ?? null,
    replayPackageId: input.replayPackageId ?? null,
    referenceVideoId: input.referenceVideoId ?? null,
    sortOrder: input.sortOrder,
  }));
}

export async function createStudioProject(input: unknown) {
  const settings = studioProjectSettingsSchema.parse(input);
  const id = await db.$transaction(async (transaction) => {
    const { selectedPlayerAlias } = await validateRelatedSelections(
      transaction,
      settings,
    );
    const project = await transaction.studioProject.create({
      data: studioProjectData(settings, selectedPlayerAlias),
      select: { id: true },
    });
    const inputs = studioInputData(project.id, settings);
    if (inputs.length) {
      await transaction.studioProjectInput.createMany({ data: inputs });
    }
    return project.id;
  });
  return findStudioProject(id);
}

export async function replaceStudioProjectSettings(id: string, input: unknown) {
  const settings = studioProjectSettingsSchema.parse(input);
  await db.$transaction(async (transaction) => {
    const existing = await transaction.studioProject.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError(
        "That unified project does not exist.",
        404,
        "STUDIO_PROJECT_NOT_FOUND",
      );
    }
    const { selectedPlayerAlias } = await validateRelatedSelections(
      transaction,
      settings,
    );
    await transaction.studioProjectInput.deleteMany({
      where: { studioProjectId: id },
    });
    await transaction.studioProject.update({
      where: { id },
      data: studioProjectData(settings, selectedPlayerAlias),
    });
    const inputs = studioInputData(id, settings);
    if (inputs.length) {
      await transaction.studioProjectInput.createMany({ data: inputs });
    }
  });
  return findStudioProject(id);
}

export async function listStudioProjects() {
  const projects = await db.studioProject.findMany({
    orderBy: { updatedAt: "desc" },
    include: studioProjectInclude,
  });
  return projects.map(serializeStudioProject);
}

export async function findStudioProject(id: string) {
  const project = await db.studioProject.findUnique({
    where: { id },
    include: studioProjectInclude,
  });
  return project ? serializeStudioProject(project) : null;
}

export async function deleteStudioProject(id: string) {
  const project = await db.studioProject.findUnique({
    where: { id },
    include: {
      shortFormProduction: {
        include: {
          timeline: {
            include: {
              proxyJobs: {
                where: { status: { in: ["QUEUED", "RUNNING"] } },
                select: { id: true },
              },
              exportJobs: {
                where: { status: { in: ["QUEUED", "RUNNING"] } },
                select: { id: true },
              },
            },
          },
        },
      },
      longFormProduction: {
        include: {
          timeline: {
            include: {
              renderJobs: {
                where: { status: { in: ["QUEUED", "RUNNING"] } },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });
  if (!project) {
    throw new AppError(
      "That unified project does not exist.",
      404,
      "STUDIO_PROJECT_NOT_FOUND",
    );
  }
  if (
    (project.shortFormProduction?.timeline?.proxyJobs.length ?? 0) > 0 ||
    (project.shortFormProduction?.timeline?.exportJobs.length ?? 0) > 0 ||
    (project.longFormProduction?.timeline?.renderJobs.length ?? 0) > 0
  ) {
    throw new AppError(
      "Cancel the active preview or export before deleting this unified project.",
      409,
      "STUDIO_PROJECT_RENDER_ACTIVE",
    );
  }
  const shortTimelineId = project.shortFormProduction?.timeline?.id;
  const longTimelineId = project.longFormProduction?.timeline?.id;
  await db.studioProject.delete({ where: { id } });
  await rm(studioMediaDirectory(id), { recursive: true, force: true });
  if (shortTimelineId) {
    await Promise.all([
      rm(shortFormProxyDirectory(shortTimelineId), {
        recursive: true,
        force: true,
      }),
      rm(shortFormExportDirectory(shortTimelineId), {
        recursive: true,
        force: true,
      }),
    ]);
  }
  if (longTimelineId) {
    await Promise.all([
      rm(longFormRenderDirectory(longTimelineId, "PREVIEW"), {
        recursive: true,
        force: true,
      }),
      rm(longFormRenderDirectory(longTimelineId, "EXPORT"), {
        recursive: true,
        force: true,
      }),
    ]);
  }
}

export async function getStudioProjectOptions() {
  const [recordings, replays, references, profiles, maps, operators] =
    await Promise.all([
      db.project.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          audioTracks: { orderBy: { streamIndex: "asc" } },
        },
      }),
      db.replayPackage.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          canonicalMatch: {
            include: {
              players: {
                orderBy: [{ teamIndex: "asc" }, { privacyAlias: "asc" }],
              },
            },
          },
        },
      }),
      db.referenceVideo.findMany({
        orderBy: { createdAt: "desc" },
      }),
      db.creatorStyleProfile.findMany({
        orderBy: { createdAt: "desc" },
      }),
      db.siegeMap.findMany({
        orderBy: { name: "asc" },
        include: {
          versions: {
            orderBy: { createdAt: "desc" },
            include: {
              bombSites: { orderBy: { displayName: "asc" } },
            },
          },
        },
      }),
      db.siegeOperator.findMany({
        orderBy: { displayName: "asc" },
        include: {
          versions: {
            orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
          },
        },
      }),
    ]);

  return {
    recordings: recordings.map((recording) => ({
      id: recording.id,
      name: recording.name,
      originalFilename: recording.originalFilename,
      durationSeconds: recording.durationSeconds,
      audioTracks: recording.audioTracks.map((track) => ({
        id: track.id,
        streamIndex: track.streamIndex,
        title: track.title,
        channels: track.channels,
        language: track.language,
        role: track.analysisRole,
      })),
    })),
    replays: replays.map((replay) => ({
      id: replay.id,
      displayName: replay.displayName,
      status: replay.status,
      roundFileCount: replay.roundFileCount,
      permissionConfirmed: replay.permissionConfirmed,
      mapName: replay.canonicalMatch?.mapName ?? null,
      players:
        replay.canonicalMatch?.players.map((player) => ({
          stableId: player.stableId,
          privacyAlias: player.privacyAlias,
          operatorName: player.operatorName,
          teamIndex: player.teamIndex,
          isRecordingPlayer: player.isRecordingPlayer,
        })) ?? [],
    })),
    references: references.map((reference) => ({
      id: reference.id,
      title: reference.title,
      referenceType: reference.referenceType,
      creatorName: reference.creatorName,
      permissionConfirmed: reference.permissionConfirmed,
    })),
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      description: profile.description,
    })),
    maps: maps.map((map) => ({
      id: map.id,
      name: map.name,
      status: map.knowledgeStatus,
      versions: map.versions.map((version) => ({
        id: version.id,
        name: version.versionName,
        status: version.knowledgeStatus,
        bombSites: version.bombSites.map((site) => ({
          id: site.id,
          name: site.displayName,
        })),
      })),
    })),
    operators: operators.map((operator) => ({
      id: operator.id,
      name: operator.displayName,
      side: operator.side,
      versions: operator.versions.map((version) => ({
        id: version.id,
        name: version.versionName,
        isCurrent: version.isCurrent,
        status: version.knowledgeStatus,
      })),
    })),
  };
}

export type StudioProjectOptions = Awaited<
  ReturnType<typeof getStudioProjectOptions>
>;
