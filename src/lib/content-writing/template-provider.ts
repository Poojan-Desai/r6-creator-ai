import type {
  ContentSuggestion,
  ContentSuggestionContext,
  ContentSuggestionProvider,
  ContentTone,
} from "@/lib/content-writing/types";

type ToneProfile = {
  hook: string;
  titleSuffix: string;
  thumbnail: string;
  direction: string;
};

const profiles: Record<ContentTone, ToneProfile> = {
  Funny: {
    hook: "This was definitely part of the plan… right?",
    titleSuffix: "A Totally Calculated R6 Moment",
    thumbnail: "TOTALLY PLANNED",
    direction:
      "Use a quick comedic freeze-frame before the payoff, then add one restrained reaction zoom and a light impact sound.",
  },
  "High energy": {
    hook: "WAIT—watch how fast this round turns around.",
    titleSuffix: "This R6 Round Changed in Seconds",
    thumbnail: "IT FLIPPED FAST",
    direction:
      "Open on a one-second flash-forward, cut rapidly into the setup, punch in on the key action, and land the payoff on a strong beat.",
  },
  Storytelling: {
    hook: "The round looked ordinary until one decision changed everything.",
    titleSuffix: "The Decision That Changed the Round",
    thumbnail: "ONE DECISION",
    direction:
      "Establish the situation first, preserve enough gameplay for cause and effect, and let the final moment breathe before the outro.",
  },
  Educational: {
    hook: "Here’s the decision that made this play work.",
    titleSuffix: "The R6 Decision You Can Learn From",
    thumbnail: "WHY IT WORKED",
    direction:
      "Use clean captions, pause briefly on the key decision, add a simple arrow or highlight, and avoid effects that hide useful game information.",
  },
  Serious: {
    hook: "One mistake here would have ended the round.",
    titleSuffix: "One Decision Decided the Round",
    thumbnail: "NO ROOM FOR ERROR",
    direction:
      "Keep the grade and sound design restrained, use deliberate cuts, emphasize game audio near the payoff, and finish without a comedic tag.",
  },
  Natural: {
    hook: "Okay, here’s what happened in this round.",
    titleSuffix: "A Clean Rainbow Six Moment",
    thumbnail: "WATCH THIS PLAY",
    direction:
      "Keep the creator’s natural pacing, remove only dead air, use readable captions, and add subtle zooms only where they clarify the action.",
  },
};

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function transcriptExcerpt(value: string) {
  const normalized = clean(value);
  if (normalized.length <= 280) return normalized;
  const shortened = normalized.slice(0, 277).replace(/\s+\S*$/, "");
  return `${shortened}…`;
}

function captionMoment(value: string) {
  const excerpt = transcriptExcerpt(value);
  return excerpt.replace(/^["'“”]+|["'“”]+$/g, "");
}

export class TemplateContentSuggestionProvider implements ContentSuggestionProvider {
  readonly id = "local-template-v1";

  async generate(
    context: ContentSuggestionContext,
    tone: ContentTone,
  ): Promise<ContentSuggestion> {
    const profile = profiles[tone];
    const transcript = transcriptExcerpt(context.transcript);
    const spokenMoment = captionMoment(context.transcript);
    const seconds = Math.max(1, Math.round(context.durationSeconds));
    const clipName = clean(context.clipName) || "Rainbow Six moment";

    return {
      openingHook: profile.hook,
      voiceoverScript: `${profile.hook}\n\nSet up the moment: this ${seconds}-second clip starts with the pressure already building. Let the gameplay and creator audio carry the middle:\n\n“${transcript}”\n\nClose by naming the payoff in your own words and give the viewer one clear reason to rewatch the play.`,
      youtubeTitle: `${clipName}: ${profile.titleSuffix}`.slice(0, 100),
      shortFormCaption: `${spokenMoment}\n\nA ${tone.toLowerCase()} look at ${clipName}. #RainbowSixSiege #R6Siege #Gaming`,
      thumbnailText: profile.thumbnail,
      editingInstructions: `${profile.direction} Start at ${context.startSeconds.toFixed(1)}s and end at ${context.endSeconds.toFixed(1)}s. Keep subtitles inside the vertical safe area, highlight the spoken keywords, and confirm every crop keeps the HUD action visible.`,
    };
  }
}
