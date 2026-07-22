import type {
  CreatorStyleProfile,
  ReferenceStyleFeature,
  ReferenceVideo,
  StyleProfileFeature,
  StyleProfileReference,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseJson } from "@/lib/reference-library";

const level = z.number().int().min(0).max(100);

export const styleProfileCreateSchema = z.object({
  name: z.string().trim().min(1, "Profile name is required.").max(120),
  description: z.string().trim().max(1_000).optional().default(""),
  referenceIds: z
    .array(z.string().min(1))
    .min(1, "Choose at least one analyzed local reference."),
});

export const styleProfileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1_000).nullable().optional(),
    referenceIds: z.array(z.string().min(1)).min(1).optional(),
    preferredVideoLengthSeconds: z
      .number()
      .positive()
      .max(14_400)
      .nullable()
      .optional(),
    preferredHookLengthSeconds: z
      .number()
      .positive()
      .max(120)
      .nullable()
      .optional(),
    energyLevel: level.optional(),
    humorLevel: level.optional(),
    educationalLevel: level.optional(),
    storytellingLevel: level.optional(),
    setupAmount: level.optional(),
    voiceoverAmount: level.optional(),
    liveAudioAmount: level.optional(),
    captionDensity: level.optional(),
    cutFrequency: level.optional(),
    reactionEmphasis: level.optional(),
    titleStyle: z.string().trim().min(1).max(200).optional(),
    thumbnailTextStyle: z.string().trim().min(1).max(200).optional(),
    wordsToAvoid: z.string().trim().max(1_000).optional(),
    preferredPhrases: z.string().trim().max(1_000).optional(),
    profanityPreference: z.enum(["AVOID", "CENSOR", "ALLOW"]).optional(),
    perspective: z.enum(["FIRST_PERSON", "NARRATOR", "FLEXIBLE"]).optional(),
  })
  .strict();

type AnalyzedReference = ReferenceVideo & {
  styleAnalyses: Array<{ features: ReferenceStyleFeature[] }>;
};

export type AggregatedProfileFeature = {
  key: string;
  label: string;
  value: unknown;
  confidence: number;
  reason: string;
  sourceReferenceCount: number;
};

export type ProfileDefaults = {
  preferredVideoLengthSeconds: number | null;
  preferredHookLengthSeconds: number | null;
  energyLevel: number;
  humorLevel: number;
  educationalLevel: number;
  storytellingLevel: number;
  setupAmount: number;
  voiceoverAmount: number;
  liveAudioAmount: number;
  captionDensity: number;
  cutFrequency: number;
  reactionEmphasis: number;
  titleStyle: string;
  thumbnailTextStyle: string;
  features: AggregatedProfileFeature[];
};

function average(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

function round(value: number, places = 1) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function clampLevel(value: number | null, fallback = 50) {
  return value === null
    ? fallback
    : Math.max(0, Math.min(100, Math.round(value)));
}

function featureValue(reference: AnalyzedReference, key: string) {
  const feature = reference.styleAnalyses[0]?.features.find(
    (item) => item.key === key,
  );
  if (!feature || feature.source === "UNAVAILABLE") return null;
  return parseJson(feature.valueJson);
}

function numericValues(references: AnalyzedReference[], key: string) {
  return references.flatMap((reference) => {
    const value = featureValue(reference, key);
    return typeof value === "number" && Number.isFinite(value) ? [value] : [];
  });
}

function detectedStats(references: AnalyzedReference[], key: string) {
  const values = references.flatMap((reference) => {
    const value = featureValue(reference, key);
    if (typeof value === "boolean") return [value];
    if (value && typeof value === "object" && "detected" in value) {
      return [Boolean((value as { detected: unknown }).detected)];
    }
    return [];
  });
  return {
    ratio: values.length ? values.filter(Boolean).length / values.length : null,
    count: values.length,
  };
}

function profileFeature(
  key: string,
  label: string,
  value: unknown,
  confidence: number,
  reason: string,
  sourceReferenceCount: number,
): AggregatedProfileFeature {
  return {
    key,
    label,
    value,
    confidence,
    reason,
    sourceReferenceCount,
  };
}

export function aggregateStyleProfile(
  references: AnalyzedReference[],
): ProfileDefaults {
  if (!references.length) {
    throw new AppError(
      "Choose at least one completed reference analysis.",
      400,
      "ANALYZED_REFERENCE_REQUIRED",
    );
  }
  const count = references.length;
  const durations = numericValues(references, "total_video_duration");
  const hooks = numericValues(references, "estimated_opening_hook_duration");
  const actionTimes = numericValues(
    references,
    "time_until_first_meaningful_action",
  );
  const cuts = numericValues(references, "approximate_cut_frequency");
  const speech = numericValues(references, "speech_percentage");
  const captions = numericValues(references, "caption_density");
  const titleLengths = numericValues(references, "average_title_length");
  const thumbnailLengths = numericValues(references, "thumbnail_text_length");
  const actionToReaction = numericValues(
    references,
    "action_to_reaction_timing",
  );
  const resultFirst = detectedStats(references, "result_first_opening");
  const humor = detectedStats(references, "uses_humor");
  const education = detectedStats(references, "uses_educational_explanations");
  const storytelling = detectedStats(references, "uses_storytelling");
  const highEnergy = detectedStats(references, "uses_high_energy_reactions");
  const duration = average(durations);
  const hook = average(hooks);
  const action = average(actionTimes);
  const cutRate = average(cuts);
  const speechRate = average(speech);
  const captionRate = average(captions);
  const titleLength = average(titleLengths);
  const thumbnailLength = average(thumbnailLengths);
  const reactionDelay = average(actionToReaction);
  const setupAmount =
    action !== null && duration !== null && duration > 0
      ? (action / duration) * 200
      : null;
  const titleStyle =
    titleLength === null
      ? "Clear and original"
      : titleLength <= 6
        ? "Short and direct"
        : titleLength <= 11
          ? "Compact story-led"
          : "Descriptive story-led";
  const thumbnailTextStyle =
    thumbnailLength === null
      ? "Short and readable"
      : thumbnailLength <= 4
        ? "Very short impact phrase"
        : "Brief context phrase";

  const features: AggregatedProfileFeature[] = [
    profileFeature(
      "preferred_video_length",
      "Preferred video length",
      duration === null ? null : round(duration),
      durations.length / count,
      duration === null
        ? "No measured reference durations were available."
        : `${count} selected reference${count === 1 ? "" : "s"} average ${round(duration)} seconds.`,
      durations.length,
    ),
    profileFeature(
      "preferred_hook_length",
      "Preferred hook length",
      hook === null ? null : round(hook),
      hooks.length ? 0.35 : 0,
      hook === null
        ? "Opening-hook boundaries were unavailable."
        : `Estimated hooks average ${round(hook)} seconds; these boundaries require review.`,
      hooks.length,
    ),
    profileFeature(
      "action_start",
      "Action start",
      action === null ? null : round(action),
      actionTimes.length ? 0.35 : 0,
      action === null
        ? "Meaningful action timing could not be estimated."
        : `Action normally begins within ${round(action)} seconds in the selected references.`,
      actionTimes.length,
    ),
    profileFeature(
      "cut_pacing",
      "Cut pacing",
      cutRate === null ? null : round(cutRate),
      cuts.length ? 0.65 : 0,
      cutRate === null
        ? "Cut-frequency evidence was unavailable."
        : `References average ${round(cutRate)} visual transition candidates per minute.`,
      cuts.length,
    ),
    profileFeature(
      "reaction_emphasis",
      "Reaction emphasis",
      {
        highEnergyRatio: highEnergy.ratio,
        averageActionToReactionSeconds: reactionDelay,
      },
      highEnergy.ratio === null ? 0 : 0.45,
      highEnergy.ratio === null
        ? "Creator-track reaction evidence was unavailable."
        : `${Math.round(highEnergy.ratio * 100)}% of the ${highEnergy.count} reference${highEnergy.count === 1 ? "" : "s"} with usable creator-track energy evidence contain strong reaction candidates${reactionDelay === null ? "." : `, averaging ${round(reactionDelay)} seconds after estimated action.`}`,
      highEnergy.count,
    ),
    profileFeature(
      "result_first_structure",
      "Result-first structure",
      resultFirst.ratio,
      resultFirst.ratio === null ? 0 : 0.32,
      resultFirst.ratio === null
        ? "No supported opening-structure estimates were available."
        : `${Math.round(resultFirst.ratio * 100)}% of the ${resultFirst.count} reference${resultFirst.count === 1 ? "" : "s"} with usable opening evidence use estimated result-first openings.`,
      resultFirst.count,
    ),
    profileFeature(
      "speech_balance",
      "Creator speech balance",
      speechRate === null ? null : round(speechRate),
      speech.length ? 0.75 : 0,
      speechRate === null
        ? "Creator speech coverage was unavailable."
        : `Timestamped creator speech covers about ${round(speechRate)}% of the references.`,
      speech.length,
    ),
  ];

  return {
    preferredVideoLengthSeconds: duration === null ? null : round(duration),
    preferredHookLengthSeconds: hook === null ? null : round(hook),
    energyLevel: clampLevel(
      highEnergy.ratio === null ? null : highEnergy.ratio * 100,
    ),
    humorLevel: clampLevel(humor.ratio === null ? null : humor.ratio * 100),
    educationalLevel: clampLevel(
      education.ratio === null ? null : education.ratio * 100,
    ),
    storytellingLevel: clampLevel(
      storytelling.ratio === null ? null : storytelling.ratio * 100,
    ),
    setupAmount: clampLevel(setupAmount),
    voiceoverAmount: clampLevel(speechRate),
    liveAudioAmount: clampLevel(speechRate === null ? null : 100 - speechRate),
    captionDensity: clampLevel(captionRate),
    cutFrequency: clampLevel(cutRate === null ? null : cutRate * 5),
    reactionEmphasis: clampLevel(
      highEnergy.ratio === null ? null : highEnergy.ratio * 100,
    ),
    titleStyle,
    thumbnailTextStyle,
    features,
  };
}

async function loadAnalyzedReferences(referenceIds: string[]) {
  const uniqueIds = [...new Set(referenceIds)];
  const references = await db.referenceVideo.findMany({
    where: { id: { in: uniqueIds }, referenceType: "LOCAL_VIDEO" },
    include: {
      styleAnalyses: {
        where: { status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { features: true },
      },
    },
  });
  if (
    references.length !== uniqueIds.length ||
    references.some((reference) => reference.styleAnalyses.length === 0)
  ) {
    throw new AppError(
      "Every selected reference needs a completed local style analysis.",
      400,
      "ANALYZED_REFERENCE_REQUIRED",
    );
  }
  return references;
}

export async function createStyleProfile(input: unknown) {
  const parsed = styleProfileCreateSchema.parse(input);
  const references = await loadAnalyzedReferences(parsed.referenceIds);
  const defaults = aggregateStyleProfile(references);
  return db.creatorStyleProfile.create({
    data: {
      name: parsed.name,
      description: parsed.description || null,
      preferredVideoLengthSeconds: defaults.preferredVideoLengthSeconds,
      preferredHookLengthSeconds: defaults.preferredHookLengthSeconds,
      energyLevel: defaults.energyLevel,
      humorLevel: defaults.humorLevel,
      educationalLevel: defaults.educationalLevel,
      storytellingLevel: defaults.storytellingLevel,
      setupAmount: defaults.setupAmount,
      voiceoverAmount: defaults.voiceoverAmount,
      liveAudioAmount: defaults.liveAudioAmount,
      captionDensity: defaults.captionDensity,
      cutFrequency: defaults.cutFrequency,
      reactionEmphasis: defaults.reactionEmphasis,
      titleStyle: defaults.titleStyle,
      thumbnailTextStyle: defaults.thumbnailTextStyle,
      referenceLinks: {
        create: references.map((reference) => ({ referenceId: reference.id })),
      },
      features: {
        create: defaults.features.map((feature) => ({
          key: feature.key,
          label: feature.label,
          valueJson: JSON.stringify(feature.value),
          confidence: feature.confidence,
          reason: feature.reason,
          sourceReferenceCount: feature.sourceReferenceCount,
        })),
      },
    },
    include: profileInclude,
  });
}

const profileInclude = {
  referenceLinks: {
    include: { reference: true },
    orderBy: { createdAt: "asc" as const },
  },
  features: { orderBy: { label: "asc" as const } },
};

type ProfileWithRelations = CreatorStyleProfile & {
  referenceLinks: Array<StyleProfileReference & { reference: ReferenceVideo }>;
  features: StyleProfileFeature[];
};

export function serializeStyleProfile(profile: ProfileWithRelations) {
  return {
    id: profile.id,
    name: profile.name,
    description: profile.description,
    preferredVideoLengthSeconds: profile.preferredVideoLengthSeconds,
    preferredHookLengthSeconds: profile.preferredHookLengthSeconds,
    energyLevel: profile.energyLevel,
    humorLevel: profile.humorLevel,
    educationalLevel: profile.educationalLevel,
    storytellingLevel: profile.storytellingLevel,
    setupAmount: profile.setupAmount,
    voiceoverAmount: profile.voiceoverAmount,
    liveAudioAmount: profile.liveAudioAmount,
    captionDensity: profile.captionDensity,
    cutFrequency: profile.cutFrequency,
    reactionEmphasis: profile.reactionEmphasis,
    titleStyle: profile.titleStyle,
    thumbnailTextStyle: profile.thumbnailTextStyle,
    wordsToAvoid: profile.wordsToAvoid,
    preferredPhrases: profile.preferredPhrases,
    profanityPreference: profile.profanityPreference,
    perspective: profile.perspective,
    profileVersion: profile.profileVersion,
    references: profile.referenceLinks.map((link) => ({
      id: link.reference.id,
      title: link.reference.title,
      creatorName: link.reference.creatorName,
      contentCategory: link.reference.contentCategory,
    })),
    features: profile.features.map((item) => ({
      id: item.id,
      key: item.key,
      label: item.label,
      value: parseJson(item.valueJson),
      confidence: item.confidence,
      reason: item.reason,
      sourceReferenceCount: item.sourceReferenceCount,
      manuallyCorrected: item.manuallyCorrected,
    })),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export async function findStyleProfile(id: string) {
  return db.creatorStyleProfile.findUnique({
    where: { id },
    include: profileInclude,
  });
}

export async function updateStyleProfile(id: string, input: unknown) {
  const parsed = styleProfileUpdateSchema.parse(input);
  const existing = await db.creatorStyleProfile.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError(
      "That Creator Style Profile no longer exists.",
      404,
      "STYLE_PROFILE_NOT_FOUND",
    );
  }

  let references: AnalyzedReference[] | null = null;
  let defaults: ProfileDefaults | null = null;
  if (parsed.referenceIds) {
    references = await loadAnalyzedReferences(parsed.referenceIds);
    defaults = aggregateStyleProfile(references);
  }
  const { referenceIds: _referenceIds, ...profileValues } = parsed;
  void _referenceIds;

  return db.$transaction(async (transaction) => {
    if (references && defaults) {
      await transaction.styleProfileReference.deleteMany({
        where: { profileId: id },
      });
      await transaction.styleProfileFeature.deleteMany({
        where: { profileId: id },
      });
      await transaction.styleProfileReference.createMany({
        data: references.map((reference) => ({
          profileId: id,
          referenceId: reference.id,
        })),
      });
      await transaction.styleProfileFeature.createMany({
        data: defaults.features.map((item) => ({
          profileId: id,
          key: item.key,
          label: item.label,
          valueJson: JSON.stringify(item.value),
          confidence: item.confidence,
          reason: item.reason,
          sourceReferenceCount: item.sourceReferenceCount,
        })),
      });
    }
    return transaction.creatorStyleProfile.update({
      where: { id },
      data: profileValues,
      include: profileInclude,
    });
  });
}
