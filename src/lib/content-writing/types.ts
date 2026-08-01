export const CONTENT_TONES = [
  "Funny",
  "High energy",
  "Storytelling",
  "Educational",
  "Serious",
  "Natural",
] as const;

export type ContentTone = (typeof CONTENT_TONES)[number];

export type ContentSuggestion = {
  openingHook: string;
  voiceoverScript: string;
  youtubeTitle: string;
  shortFormCaption: string;
  thumbnailText: string;
  editingInstructions: string;
};

export type ContentSuggestionContext = {
  projectName: string;
  clipName: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  transcript: string;
  verifiedOperatorContext?: {
    provenance: "USER_CONFIRMED";
    operator: string;
    operatorVersion: string | null;
    side: "UNKNOWN" | "ATTACK" | "DEFENSE";
    verifiedGeneralAbility: string | null;
    userProvidedAction: string | null;
    userProvidedResult: string | null;
    unknowns: string[];
  } | null;
};

export type ShortFormEvidenceItem = {
  source: "VIDEO" | "TRANSCRIPT" | "REPLAY" | "USER_CONFIRMED";
  summary: string;
  timestampSeconds?: number;
  confidence?: number;
};

export type ShortFormContentContext = {
  projectName: string;
  candidate: {
    mainEvent: string;
    category: string;
    startSeconds: number;
    peakSeconds: number;
    endSeconds: number;
    eventConfidence: number;
    contentPotentialScore: number;
    styleSimilarity: number | null;
    explanation: string;
    missingEvidence: string[];
  };
  platform: "YOUTUBE_SHORTS" | "TIKTOK" | "INSTAGRAM_REELS" | "HORIZONTAL_CLIP";
  aspectRatio:
    "VERTICAL_9_16" | "HORIZONTAL_16_9" | "SQUARE_1_1" | "PORTRAIT_4_5";
  targetDurationSeconds: number;
  contentInstructions: string | null;
  focusAreas: string[];
  evidence: ShortFormEvidenceItem[];
  transcriptExcerpt: string;
  userConfirmedContext: Array<{ label: string; value: string }>;
  styleProfile: {
    name: string;
    energyLevel: number;
    humorLevel: number;
    educationalLevel: number;
    storytellingLevel: number;
    titleStyle: string;
    thumbnailTextStyle: string;
    wordsToAvoid: string;
    preferredPhrases: string;
    perspective: string;
  } | null;
  unknowns: string[];
};

export type ShortFormWritingPackage = {
  hooks: [string, string, string];
  fullVoiceover: string;
  shortVoiceover: string;
  liveAudioOnly: string;
  youtubeShortsTitle: string;
  tiktokCaption: string;
  instagramCaption: string;
  horizontalTitle: string;
  thumbnailText: string;
  captionGuidance: string;
  editingPlan: string;
  structureMatchExplanation: string;
  factsUsed: string[];
  factsNeedingConfirmation: string[];
};

export interface ContentSuggestionProvider {
  readonly id: string;
  generate(
    context: ContentSuggestionContext,
    tone: ContentTone,
  ): Promise<ContentSuggestion>;
  generateShortFormPackage(
    context: ShortFormContentContext,
    tone: ContentTone,
  ): Promise<ShortFormWritingPackage>;
}

export const CONTENT_SUGGESTION_EVENT = "r6-content-suggestion";
