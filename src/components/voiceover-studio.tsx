"use client";

import { useMemo, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  FileText,
  History,
  LoaderCircle,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { VoiceoverTakeLibrary } from "@/components/voiceover-take-library";
import type {
  VoiceoverPackage,
  VoiceoverState,
  VoiceoverTarget,
  VoiceoverToneValue,
} from "@/lib/voiceover";
import { formatDuration } from "@/lib/time";

const factLabels: Record<string, string> = {
  VERIFIED_REPLAY_FACT: "Verified replay facts",
  VIDEO_OBSERVATION: "Direct video observations",
  TRANSCRIPT_STATEMENT: "Transcript statements",
  USER_CONFIRMED_CONTEXT: "User-confirmed context",
  INFERENCE: "Inferences",
  UNKNOWN: "Unknown information",
};

function errorMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The local Voiceover Studio could not finish that action.";
}

export function VoiceoverStudio({
  studioProjectId,
  initialState,
  suggestedTarget,
}: {
  studioProjectId: string;
  initialState: VoiceoverState;
  suggestedTarget: VoiceoverTarget;
}) {
  const [state, setState] = useState(initialState);
  const [targetType, setTargetType] = useState<VoiceoverTarget>(
    initialState.production?.currentScriptVersion
      ? initialState.production.targetType
      : suggestedTarget,
  );
  const [tone, setTone] = useState<VoiceoverToneValue>(
    initialState.production?.tone ?? "NATURAL",
  );
  const [draft, setDraft] = useState<VoiceoverPackage | null>(
    initialState.currentRevision?.package ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = useMemo(
    () =>
      Object.entries(factLabels).map(([category, label]) => ({
        category,
        label,
        facts: state.facts.filter((fact) => fact.category === category),
      })),
    [state.facts],
  );

  async function generate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/voiceover`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetType, tone }),
        },
      );
      const body = (await response.json()) as {
        voiceover?: VoiceoverState;
        error?: { message?: string };
      };
      if (!response.ok || !body.voiceover) {
        throw new Error(
          body.error?.message || "The local script could not be generated.",
        );
      }
      setState(body.voiceover);
      setDraft(body.voiceover.currentRevision?.package ?? null);
      setMessage(
        `Saved script revision ${body.voiceover.production?.currentScriptVersion ?? 0}.`,
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/voiceover`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            package: draft,
            reason: "Manual voiceover script edit",
          }),
        },
      );
      const body = (await response.json()) as {
        voiceover?: VoiceoverState;
        error?: { message?: string };
      };
      if (!response.ok || !body.voiceover) {
        throw new Error(
          body.error?.message || "The script revision could not be saved.",
        );
      }
      setState(body.voiceover);
      setDraft(body.voiceover.currentRevision?.package ?? null);
      setMessage(
        `Saved immutable script revision ${body.voiceover.production?.currentScriptVersion ?? 0}.`,
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function confirmFact(factId: string, correction: string) {
    if (!correction.trim()) {
      setError("Enter the fact you want to confirm or correct.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/voiceover/facts/${factId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correction: correction.trim(),
            userConfirmed: true,
          }),
        },
      );
      const body = (await response.json()) as {
        voiceover?: VoiceoverState;
        error?: { message?: string };
      };
      if (!response.ok || !body.voiceover) {
        throw new Error(
          body.error?.message || "That fact could not be confirmed.",
        );
      }
      setState(body.voiceover);
      setMessage("Saved as explicit user-confirmed context.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function setText(
    key: keyof Pick<
      VoiceoverPackage,
      | "fullScript"
      | "shorterScript"
      | "naturalVersion"
      | "highEnergyVersion"
      | "storytellingVersion"
      | "educationalVersion"
      | "liveAudioOnly"
    >,
    value: string,
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="border-b border-white/8 p-5 sm:p-6">
          <p className="section-kicker">U5.1 · Facts Review</p>
          <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
            Confirm facts before narration
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            The local writer keeps observations, replay facts, transcript
            statements, user context, inferences, and unknowns separate. Confirm
            or correct a line only when you know it is true.
          </p>
        </div>
        <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2">
          {groups.map((group) => (
            <section
              key={group.category}
              className="rounded-xl border border-white/8 bg-black/15 p-4"
            >
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                {group.category === "UNKNOWN" ? (
                  <ShieldCheck size={15} className="text-amber-300" />
                ) : (
                  <BookOpenCheck size={15} className="text-[#b8ff2c]" />
                )}
                {group.label}
              </h3>
              {group.facts.length === 0 ? (
                <p className="mt-3 text-xs text-slate-600">None available.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {group.facts.map((fact) => (
                    <FactEditor
                      key={fact.id}
                      fact={fact}
                      disabled={busy}
                      onConfirm={confirmFact}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-white/8 p-5 sm:p-6">
          <p className="section-kicker">U5.1 · Local script provider</p>
          <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
            Generate original narration
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label>
              <span className="form-label">Use structure from</span>
              <select
                className="field mt-2"
                value={targetType}
                disabled={busy}
                onChange={(event) =>
                  setTargetType(event.target.value as VoiceoverTarget)
                }
              >
                <option value="SHORT_FORM">Short-form plan</option>
                <option value="LONG_FORM">Long-form plan</option>
              </select>
            </label>
            <label>
              <span className="form-label">Narration tone</span>
              <select
                className="field mt-2"
                value={tone}
                disabled={busy}
                onChange={(event) =>
                  setTone(event.target.value as VoiceoverToneValue)
                }
              >
                <option value="NATURAL">Natural</option>
                <option value="HIGH_ENERGY">High energy</option>
                <option value="STORYTELLING">Storytelling</option>
                <option value="EDUCATIONAL">Educational</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                className="primary-button w-full"
                disabled={busy}
                onClick={() => void generate()}
              >
                {busy ? (
                  <LoaderCircle className="animate-spin" size={15} />
                ) : (
                  <Sparkles size={15} />
                )}
                {state.currentRevision
                  ? "Regenerate script"
                  : "Generate script"}
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-600">
            Runs locally with no paid API. The provider never invents an enemy
            count, operator, map, site, health, weapon, rank, stakes, intention,
            communication, position, or outcome.
          </p>
        </div>

        {draft ? (
          <div className="space-y-6 p-5 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-3">
              {draft.hooks.map((hook, index) => (
                <label key={index}>
                  <span className="form-label">Opening hook {index + 1}</span>
                  <textarea
                    className="field mt-2 min-h-28"
                    value={hook}
                    onChange={(event) =>
                      setDraft((current) => {
                        if (!current) return current;
                        const hooks = [...current.hooks] as [
                          string,
                          string,
                          string,
                        ];
                        hooks[index] = event.target.value;
                        return { ...current, hooks };
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <ScriptField
              label="Full script"
              value={draft.fullScript}
              onChange={(value) => setText("fullScript", value)}
            />
            <ScriptField
              label="Shorter alternate script"
              value={draft.shorterScript}
              onChange={(value) => setText("shorterScript", value)}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <ScriptField
                label="Natural version"
                value={draft.naturalVersion}
                onChange={(value) => setText("naturalVersion", value)}
              />
              <ScriptField
                label="High-energy version"
                value={draft.highEnergyVersion}
                onChange={(value) => setText("highEnergyVersion", value)}
              />
              <ScriptField
                label="Storytelling version"
                value={draft.storytellingVersion}
                onChange={(value) => setText("storytellingVersion", value)}
              />
              <ScriptField
                label="Educational version"
                value={draft.educationalVersion}
                onChange={(value) => setText("educationalVersion", value)}
              />
            </div>
            <ScriptField
              label="Live-audio-only option"
              value={draft.liveAudioOnly}
              onChange={(value) => setText("liveAudioOnly", value)}
            />
            <section className="rounded-xl border border-white/8 p-4">
              <h3 className="text-sm font-semibold text-white">
                Section-by-section narration
              </h3>
              <div className="mt-4 space-y-4">
                {draft.sections.map((section, index) => (
                  <label key={section.key} className="block">
                    <span className="form-label">
                      {section.title} · about{" "}
                      {formatDuration(section.estimatedSpeakingSeconds)}
                    </span>
                    <textarea
                      className="field mt-2 min-h-24"
                      value={section.narration}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                sections: current.sections.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          narration: event.target.value,
                                        }
                                      : item,
                                ),
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </section>
            <div className="grid gap-4 lg:grid-cols-2">
              <ListPanel
                title="Pronunciation notes"
                items={draft.pronunciationNotes}
              />
              <ListPanel title="Pacing notes" items={draft.pacingNotes} />
              <ListPanel title="Facts used" items={draft.factsUsed} />
              <ListPanel title="Unknowns retained" items={draft.unknowns} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => void saveDraft()}
              >
                <Save size={15} /> Save script revision
              </button>
              <span className="rounded-full border border-white/8 px-3 py-2 text-xs text-slate-400">
                Estimated speaking time{" "}
                {formatDuration(draft.estimatedSpeakingSeconds)}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center">
            <FileText className="mx-auto text-slate-700" size={30} />
            <p className="mt-3 text-sm text-slate-500">
              Confirm the Facts Review, then generate the first script.
            </p>
          </div>
        )}

        {message && (
          <p role="status" className="mx-5 mb-5 text-sm text-[#b8ff2c] sm:mx-6">
            <CheckCircle2 className="mr-2 inline" size={15} />
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="mx-5 mb-5 text-sm text-red-200 sm:mx-6">
            {error}
          </p>
        )}
        {state.revisions.length > 0 && (
          <details className="border-t border-white/8 p-5 sm:p-6">
            <summary className="cursor-pointer text-sm font-semibold text-white">
              <History className="mr-2 inline" size={15} />
              Script history · {state.revisions.length}
            </summary>
            <div className="mt-3 space-y-2 text-xs text-slate-500">
              {state.revisions.map((revision) => (
                <p key={revision.id}>
                  v{revision.version} · {revision.reason} ·{" "}
                  {revision.providerVersion}
                </p>
              ))}
            </div>
          </details>
        )}
      </section>

      <VoiceoverTakeLibrary
        studioProjectId={studioProjectId}
        state={state}
        sections={
          draft?.sections.map((section) => ({
            key: section.key,
            title: section.title,
          })) ?? []
        }
        onState={(next) => {
          setState(next);
          setDraft(next.currentRevision?.package ?? draft);
        }}
      />
    </div>
  );
}

function FactEditor({
  fact,
  disabled,
  onConfirm,
}: {
  fact: VoiceoverState["facts"][number];
  disabled: boolean;
  onConfirm: (factId: string, correction: string) => Promise<void>;
}) {
  const [value, setValue] = useState(fact.effectiveSummary);
  return (
    <div className="rounded-lg border border-white/7 bg-white/[0.02] p-3">
      <p className="text-xs leading-5 text-slate-400">{fact.summary}</p>
      {fact.timestampSeconds !== null && (
        <p className="mt-1 text-[10px] text-slate-600">
          {formatDuration(fact.timestampSeconds)}
          {fact.confidence !== null
            ? ` · ${Math.round(fact.confidence * 100)}% source confidence`
            : ""}
        </p>
      )}
      {fact.userConfirmed ? (
        <p className="mt-2 text-xs text-[#b8ff2c]">
          User confirmed: {fact.effectiveSummary}
        </p>
      ) : (
        <div className="mt-3">
          <label>
            <span className="sr-only">Confirm or correct fact</span>
            <input
              className="field"
              value={value}
              disabled={disabled}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="secondary-button mt-2"
            disabled={disabled || !value.trim()}
            onClick={() => void onConfirm(fact.id, value)}
          >
            <ShieldCheck size={13} /> Confirm or correct
          </button>
        </div>
      )}
    </div>
  );
}

function ScriptField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="form-label">{label}</span>
      <textarea
        className="field mt-2 min-h-36"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-xl border border-white/8 p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-500">
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-slate-600">None.</p>
      )}
    </section>
  );
}
