import { z } from "zod";

export const writingPackageSchema = z
  .object({
    hooks: z.tuple([
      z.string().trim().min(1).max(500),
      z.string().trim().min(1).max(500),
      z.string().trim().min(1).max(500),
    ]),
    fullVoiceover: z.string().trim().min(1).max(10_000),
    shortVoiceover: z.string().trim().min(1).max(5_000),
    liveAudioOnly: z.string().trim().min(1).max(5_000),
    youtubeShortsTitle: z.string().trim().min(1).max(120),
    tiktokCaption: z.string().trim().min(1).max(2_500),
    instagramCaption: z.string().trim().min(1).max(2_500),
    horizontalTitle: z.string().trim().min(1).max(120),
    thumbnailText: z.string().trim().min(1).max(120),
    captionGuidance: z.string().trim().min(1).max(5_000),
    editingPlan: z.string().trim().min(1).max(10_000),
    structureMatchExplanation: z.string().trim().min(1).max(5_000),
    factsUsed: z.array(z.string().trim().min(1).max(1_000)).max(100),
    factsNeedingConfirmation: z
      .array(z.string().trim().min(1).max(1_000))
      .max(100),
  })
  .strict();
