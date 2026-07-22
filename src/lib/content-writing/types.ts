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
};

export interface ContentSuggestionProvider {
  readonly id: string;
  generate(
    context: ContentSuggestionContext,
    tone: ContentTone,
  ): Promise<ContentSuggestion>;
}

export const CONTENT_SUGGESTION_EVENT = "r6-content-suggestion";
