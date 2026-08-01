import { z } from "zod";

export const VOICEOVER_PROVIDER_VERSION = "u5-local-voiceover-v1";

export const voiceoverTargetSchema = z.enum(["SHORT_FORM", "LONG_FORM"]);
export const voiceoverToneSchema = z.enum([
  "NATURAL",
  "HIGH_ENERGY",
  "STORYTELLING",
  "EDUCATIONAL",
]);

export const voiceoverFactInputSchema = z
  .object({
    category: z.enum([
      "VERIFIED_REPLAY_FACT",
      "VIDEO_OBSERVATION",
      "TRANSCRIPT_STATEMENT",
      "USER_CONFIRMED_CONTEXT",
      "INFERENCE",
      "UNKNOWN",
    ]),
    summary: z.string().trim().min(1).max(2_000),
    timestampSeconds: z.number().finite().min(0).max(86_400).nullable(),
    confidence: z.number().finite().min(0).max(1).nullable(),
    userConfirmed: z.boolean(),
  })
  .strict();

export const voiceoverScriptSectionSchema = z
  .object({
    key: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(300),
    narration: z.string().trim().max(10_000),
    estimatedSpeakingSeconds: z.number().finite().min(0).max(7_200),
  })
  .strict();

export const voiceoverPackageSchema = z
  .object({
    hooks: z.tuple([
      z.string().trim().min(1).max(500),
      z.string().trim().min(1).max(500),
      z.string().trim().min(1).max(500),
    ]),
    fullScript: z.string().trim().min(1).max(100_000),
    shorterScript: z.string().trim().min(1).max(50_000),
    naturalVersion: z.string().trim().min(1).max(100_000),
    highEnergyVersion: z.string().trim().min(1).max(100_000),
    storytellingVersion: z.string().trim().min(1).max(100_000),
    educationalVersion: z.string().trim().min(1).max(100_000),
    liveAudioOnly: z.string().trim().min(1).max(10_000),
    sections: z.array(voiceoverScriptSectionSchema).min(1).max(200),
    pronunciationNotes: z.array(z.string().trim().min(1).max(500)).max(100),
    pacingNotes: z.array(z.string().trim().min(1).max(500)).max(100),
    estimatedSpeakingSeconds: z.number().finite().positive().max(7_200),
    factsUsed: z.array(z.string().trim().min(1).max(2_000)).max(200),
    unknowns: z.array(z.string().trim().min(1).max(2_000)).max(200),
    evidenceExplanation: z.string().trim().min(1).max(10_000),
  })
  .strict();

export const voiceoverGenerateSchema = z
  .object({
    targetType: voiceoverTargetSchema.default("SHORT_FORM"),
    tone: voiceoverToneSchema.default("NATURAL"),
  })
  .strict();

export const voiceoverRevisionSchema = z
  .object({
    package: voiceoverPackageSchema,
    reason: z.string().trim().min(1).max(500).default("Manual script edit"),
  })
  .strict();

export type VoiceoverFactInput = z.infer<typeof voiceoverFactInputSchema>;
export type VoiceoverPackage = z.infer<typeof voiceoverPackageSchema>;
export type VoiceoverTarget = z.infer<typeof voiceoverTargetSchema>;
export type VoiceoverToneValue = z.infer<typeof voiceoverToneSchema>;

export type VoiceoverProviderContext = {
  projectName: string;
  targetType: VoiceoverTarget;
  tone: VoiceoverToneValue;
  facts: VoiceoverFactInput[];
  structure: Array<{ key: string; title: string; direction: string }>;
};

export interface VoiceoverScriptProvider {
  readonly id: string;
  readonly version: string;
  generate(context: VoiceoverProviderContext): Promise<VoiceoverPackage>;
}
