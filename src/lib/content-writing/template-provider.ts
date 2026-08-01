import type {
  ContentSuggestion,
  ContentSuggestionContext,
  ContentSuggestionProvider,
  ContentTone,
  ShortFormContentContext,
  ShortFormWritingPackage,
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

  async generateShortFormPackage(
    context: ShortFormContentContext,
    tone: ContentTone,
  ): Promise<ShortFormWritingPackage> {
    const profile = profiles[tone];
    const firstObservation =
      context.evidence.find((item) => item.source === "VIDEO")?.summary ??
      "Several local signals rise near the selected evidence peak.";
    const firstTranscript =
      context.transcriptExcerpt.trim().slice(0, 260) ||
      "No usable creator transcript is available for this range.";
    const confirmedContext = context.userConfirmedContext
      .map((item) => `${item.label}: ${item.value}`)
      .join("; ");
    const candidateLength = Math.max(
      1,
      Math.round(context.candidate.endSeconds - context.candidate.startSeconds),
    );
    const contextSentence = confirmedContext
      ? `The creator confirmed this context: ${confirmedContext}.`
      : "Map, operator, player count, intent, stakes, and exact outcome remain unconfirmed.";
    const evidenceSentence =
      `The visible/local evidence says: ${firstObservation}`.replace(
        /[.!?]+\s*$/,
        "",
      );
    const safeEvent = clean(context.candidate.mainEvent).replace(
      /\bcandidate\b/gi,
      "moment",
    );
    const hooks: [string, string, string] = [
      profile.hook,
      `Watch the next ${Math.min(8, Math.max(3, Math.round(candidateLength / 3)))} seconds—this ${safeEvent.toLowerCase()} changes fast.`,
      tone === "Educational"
        ? "Pause on the evidence peak—this is the decision worth reviewing."
        : "The setup is quiet, then every local signal jumps at once.",
    ];
    const fullVoiceover = [
      hooks[0],
      "",
      `${evidenceSentence}.`,
      context.transcriptExcerpt
        ? `The creator audio in this range includes: “${firstTranscript}”`
        : "Let the original game audio carry the middle because no creator transcript is available.",
      contextSentence,
      "",
      "End on the visible payoff, then invite the viewer to rewatch the moment without adding facts the footage does not establish.",
    ].join("\n");
    const shortVoiceover = [
      hooks[1],
      `${evidenceSentence}.`,
      "Watch the visible payoff and decide what you would have done.",
    ].join("\n");
    const profileExplanation = context.styleProfile
      ? `The structure uses ${context.styleProfile.name}'s saved high-level pacing, energy, and title preferences. It does not copy reference wording, jokes, captions, or branding.`
      : "No Creator Style Profile is selected, so the package uses the chosen tone and the project's own evidence only.";
    const focus = context.focusAreas[0] ?? "the selected moment";
    const title = `${context.projectName}: ${safeEvent}`.slice(0, 100);
    const factsUsed = [
      firstObservation,
      ...context.userConfirmedContext.map(
        (item) => `${item.label}: ${item.value}`,
      ),
    ];
    return {
      hooks,
      fullVoiceover,
      shortVoiceover,
      liveAudioOnly: `Use only the original audio from ${context.candidate.startSeconds.toFixed(2)}s to ${context.candidate.endSeconds.toFixed(2)}s. Remove dead air conservatively, keep the evidence peak at ${context.candidate.peakSeconds.toFixed(2)}s audible, and do not subtitle speech that was not transcribed.`,
      youtubeShortsTitle: title,
      tiktokCaption:
        `${safeEvent} — a ${tone.toLowerCase()} cut focused on ${focus}. ` +
        "#RainbowSixSiege #R6Siege #Gaming",
      instagramCaption: `${safeEvent}. Built from locally reviewed evidence, with unknown details left unclaimed. #R6Siege #Gaming`,
      horizontalTitle: `${title} | Rainbow Six Siege`.slice(0, 100),
      thumbnailText: profile.thumbnail,
      captionGuidance:
        "Caption only words present in the saved transcript or confirmed by the creator. Keep two short lines inside the selected aspect ratio's safe area.",
      editingPlan: `${profile.direction} Use the reviewed ${candidateLength}-second source range, place the evidence peak at roughly ${Math.round(
        ((context.candidate.peakSeconds - context.candidate.startSeconds) /
          Math.max(1, candidateLength)) *
          100,
      )}% of the sequence, and keep HUD information visible when reframing. Target ${context.targetDurationSeconds} seconds for ${context.platform.toLowerCase().replaceAll("_", " ")}.`,
      structureMatchExplanation: profileExplanation,
      factsUsed,
      factsNeedingConfirmation: context.unknowns,
    };
  }
}
