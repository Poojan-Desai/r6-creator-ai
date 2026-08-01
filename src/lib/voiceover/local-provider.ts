import type {
  VoiceoverPackage,
  VoiceoverProviderContext,
  VoiceoverScriptProvider,
  VoiceoverToneValue,
} from "@/lib/voiceover/types";
import {
  VOICEOVER_PROVIDER_VERSION,
  voiceoverPackageSchema,
} from "@/lib/voiceover/types";

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sentence(value: string) {
  const result = clean(value);
  return /[.!?]$/.test(result) ? result : `${result}.`;
}

function speakingSeconds(value: string) {
  const words = clean(value).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / 150) * 60));
}

function toneOpening(tone: VoiceoverToneValue) {
  const openings: Record<VoiceoverToneValue, string> = {
    NATURAL: "Here is what the footage actually shows.",
    HIGH_ENERGY: "Watch the evidence peak—this moment changes quickly.",
    STORYTELLING:
      "The recording starts with a question the footage can answer.",
    EDUCATIONAL:
      "Pause on the visible evidence and review what it establishes.",
  };
  return openings[tone];
}

function factsForWriting(context: VoiceoverProviderContext) {
  return context.facts.filter(
    (fact) =>
      fact.category === "VERIFIED_REPLAY_FACT" ||
      fact.category === "VIDEO_OBSERVATION" ||
      fact.category === "TRANSCRIPT_STATEMENT" ||
      (fact.category === "USER_CONFIRMED_CONTEXT" && fact.userConfirmed),
  );
}

export class LocalVoiceoverScriptProvider implements VoiceoverScriptProvider {
  readonly id = "local-template";
  readonly version = VOICEOVER_PROVIDER_VERSION;

  async generate(context: VoiceoverProviderContext): Promise<VoiceoverPackage> {
    const usableFacts = factsForWriting(context);
    const unknowns = context.facts
      .filter((fact) => fact.category === "UNKNOWN")
      .map((fact) => fact.summary);
    const factSentences = usableFacts.map((fact) => sentence(fact.summary));
    const evidenceBody =
      factSentences.length > 0
        ? factSentences.join(" ")
        : "No gameplay result has been confirmed, so review the linked footage before naming the event.";
    const hooks: [string, string, string] = [
      toneOpening(context.tone),
      "The most useful part of this moment is what the evidence can actually support.",
      "Before adding a conclusion, look at what the recording establishes.",
    ];
    const close =
      "End on the visible or replay-confirmed payoff. If the outcome is still unknown, leave it unstated and ask the creator to confirm it.";
    const fullScript = [hooks[0], evidenceBody, close].join("\n\n");
    const shorterScript = [hooks[1], factSentences[0] ?? evidenceBody].join(
      "\n\n",
    );
    const naturalVersion = [
      "Okay, here is what happened in the part we can verify.",
      evidenceBody,
      close,
    ].join("\n\n");
    const highEnergyVersion = [
      "Watch this—every saved signal rises around the same moment.",
      evidenceBody,
      "Keep the cut moving, then let the supported payoff breathe.",
    ].join("\n\n");
    const storytellingVersion = [
      "The footage gives us a setup, a turning point, and one open question.",
      evidenceBody,
      close,
    ].join("\n\n");
    const educationalVersion = [
      "Start with the evidence before explaining the decision.",
      evidenceBody,
      "Explain only the visible or confirmed decision, then identify the missing context.",
    ].join("\n\n");
    const sections = context.structure.map((section) => {
      const narration = `${section.direction} ${
        factSentences[0] ??
        "Review this section before describing a specific gameplay outcome."
      }`;
      return {
        key: section.key,
        title: section.title,
        narration,
        estimatedSpeakingSeconds: speakingSeconds(narration),
      };
    });
    const pronunciationNotes = usableFacts
      .filter((fact) => fact.category === "USER_CONFIRMED_CONTEXT")
      .slice(0, 12)
      .map(
        (fact) =>
          `Confirm pronunciation for the user-supplied term in “${clean(fact.summary)}”.`,
      );
    return voiceoverPackageSchema.parse({
      hooks,
      fullScript,
      shorterScript,
      naturalVersion,
      highEnergyVersion,
      storytellingVersion,
      educationalVersion,
      liveAudioOnly:
        "Use only the selected creator and gameplay audio. Do not synthesize speech, clone a voice, or caption words that were not transcribed or confirmed.",
      sections:
        sections.length > 0
          ? sections
          : [
              {
                key: "overview",
                title: "Overview",
                narration: fullScript,
                estimatedSpeakingSeconds: speakingSeconds(fullScript),
              },
            ],
      pronunciationNotes,
      pacingNotes: [
        "Aim for roughly 140–160 words per minute unless the creator prefers a different natural pace.",
        "Pause briefly after a verified fact and before an explicitly uncertain inference.",
        "Leave live gameplay audio audible around the evidence peak.",
      ],
      estimatedSpeakingSeconds: speakingSeconds(fullScript),
      factsUsed: usableFacts.map((fact) => fact.summary),
      unknowns,
      evidenceExplanation:
        "This local script uses only verified replay facts, direct video observations, saved transcript statements, and explicitly confirmed user context. Inferences and unknowns are retained for review and are not rewritten as facts.",
    });
  }
}
