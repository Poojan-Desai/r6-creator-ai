"use client";

import { useRef, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  FileText,
  History,
  LoaderCircle,
  Save,
  Sparkles,
  X,
} from "lucide-react";

import type { StudioCandidateState } from "@/lib/short-form-candidates";
import type {
  ShortFormProductionState,
  ShortFormStoryPlan,
} from "@/lib/short-form-productions";
import type { ShortFormWritingPackage } from "@/lib/content-writing";
import { formatDuration } from "@/lib/time";

type Candidate = StudioCandidateState["candidates"][number];
type Platform =
  "YOUTUBE_SHORTS" | "TIKTOK" | "INSTAGRAM_REELS" | "HORIZONTAL_CLIP";
type Aspect =
  "VERTICAL_9_16" | "HORIZONTAL_16_9" | "SQUARE_1_1" | "PORTRAIT_4_5";
type Tone =
  | "FUNNY"
  | "HIGH_ENERGY"
  | "STORYTELLING"
  | "EDUCATIONAL"
  | "SERIOUS"
  | "NATURAL";
type WritingProvider = "LOCAL" | "OPENAI";

function errorMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The story and writing workspace could not finish that action.";
}

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function ShortFormPlanningWorkspace({
  studioProjectId,
  candidates,
  initialState,
}: {
  studioProjectId: string;
  candidates: Candidate[];
  initialState: ShortFormProductionState;
}) {
  const [state, setState] = useState(initialState);
  const [candidateId, setCandidateId] = useState(
    initialState.production?.selectedCandidate?.id ?? candidates[0]?.id ?? "",
  );
  const [platform, setPlatform] = useState<Platform>(
    initialState.production?.platform ?? "YOUTUBE_SHORTS",
  );
  const [aspectRatio, setAspectRatio] = useState<Aspect>(
    initialState.production?.aspectRatio ?? "VERTICAL_9_16",
  );
  const [tone, setTone] = useState<Tone>(
    initialState.production?.tone ?? "NATURAL",
  );
  const [targetDurationSeconds, setTargetDurationSeconds] = useState(
    initialState.production?.targetDurationSeconds ?? 30,
  );
  const [provider, setProvider] = useState<WritingProvider>("LOCAL");
  const [cloudConsent, setCloudConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  async function generate() {
    if (!candidateId) {
      setError("Choose a reviewed candidate first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/short-form-production`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateId,
            platform,
            aspectRatio,
            tone,
            targetDurationSeconds,
            provider,
            cloudConsent: provider === "OPENAI" && cloudConsent,
          }),
          signal: controller.signal,
        },
      );
      const body = (await response.json()) as {
        productionState?: ShortFormProductionState;
        error?: { message?: string };
      };
      if (!response.ok || !body.productionState) {
        throw new Error(
          body.error?.message ||
            "The local story and writing package could not be generated.",
        );
      }
      setState(body.productionState);
      const savedProvider =
        body.productionState.production?.currentRevision?.providerId ??
        "unknown provider";
      setMessage(
        `Saved version ${body.productionState.production?.currentVersion ?? 0} with ${savedProvider}.`,
      );
    } catch (reason) {
      setError(
        reason instanceof DOMException && reason.name === "AbortError"
          ? "Generation cancelled. No new revision was saved."
          : errorMessage(reason),
      );
    } finally {
      activeRequest.current = null;
      setBusy(false);
    }
  }

  async function saveRevision(
    storyPlan: ShortFormStoryPlan,
    writingPackage: ShortFormWritingPackage,
  ) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/short-form-production`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storyPlan,
            writingPackage,
            reason: "Manual story and writing edit",
          }),
        },
      );
      const body = (await response.json()) as {
        productionState?: ShortFormProductionState;
        error?: { message?: string };
      };
      if (!response.ok || !body.productionState) {
        throw new Error(
          body.error?.message || "The revision could not be saved.",
        );
      }
      setState(body.productionState);
      setMessage(
        `Saved immutable revision ${body.productionState.production?.currentVersion ?? 0}. Earlier versions remain unchanged.`,
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const revision = state.production?.currentRevision ?? null;

  return (
    <section className="panel mt-8 overflow-hidden">
      <div className="border-b border-white/8 p-5 sm:p-6">
        <p className="section-kicker">U3.2 · Story and original writing</p>
        <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
          Turn evidence into a plan
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Choose the output, target length, tone, and writer. Local generation
          remains private and free. Cloud AI is optional, explicitly consented,
          budget-limited, and sends only the bounded evidence shown below.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="xl:col-span-2">
            <span className="form-label">Reviewed candidate</span>
            <select
              className="field mt-2"
              value={candidateId}
              onChange={(event) => setCandidateId(event.target.value)}
            >
              {candidates.length === 0 && (
                <option value="">Generate candidates first</option>
              )}
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.mainEvent} ·{" "}
                  {formatDuration(candidate.effectiveStartSeconds)}–
                  {formatDuration(candidate.effectiveEndSeconds)}
                  {candidate.latestReview
                    ? ` · ${label(candidate.latestReview.decision)}`
                    : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="form-label">Platform</span>
            <select
              className="field mt-2"
              value={platform}
              onChange={(event) => setPlatform(event.target.value as Platform)}
            >
              <option value="YOUTUBE_SHORTS">YouTube Shorts</option>
              <option value="TIKTOK">TikTok</option>
              <option value="INSTAGRAM_REELS">Instagram Reels</option>
              <option value="HORIZONTAL_CLIP">Horizontal clip</option>
            </select>
          </label>
          <label>
            <span className="form-label">Aspect ratio</span>
            <select
              className="field mt-2"
              value={aspectRatio}
              onChange={(event) => setAspectRatio(event.target.value as Aspect)}
            >
              <option value="VERTICAL_9_16">9:16 vertical</option>
              <option value="HORIZONTAL_16_9">16:9 horizontal</option>
              <option value="SQUARE_1_1">1:1 square</option>
              <option value="PORTRAIT_4_5">4:5 portrait</option>
            </select>
          </label>
          <label>
            <span className="form-label">Tone</span>
            <select
              className="field mt-2"
              value={tone}
              onChange={(event) => setTone(event.target.value as Tone)}
            >
              <option value="FUNNY">Funny</option>
              <option value="HIGH_ENERGY">High energy</option>
              <option value="STORYTELLING">Storytelling</option>
              <option value="EDUCATIONAL">Educational</option>
              <option value="SERIOUS">Serious</option>
              <option value="NATURAL">Natural</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
          <fieldset>
            <legend className="form-label">Target duration</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[15, 30, 45, 60, 90].map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  className={`secondary-button ${
                    targetDurationSeconds === seconds
                      ? "border-[#b8ff2c]/35 bg-[#b8ff2c]/8 text-white"
                      : ""
                  }`}
                  onClick={() => setTargetDurationSeconds(seconds)}
                >
                  {seconds}s
                </button>
              ))}
            </div>
          </fieldset>
          <label className="w-40">
            <span className="form-label">Custom seconds</span>
            <input
              className="field mt-2"
              type="number"
              min={5}
              max={180}
              step="1"
              value={targetDurationSeconds}
              onChange={(event) =>
                setTargetDurationSeconds(Number(event.target.value))
              }
            />
          </label>
          <label className="w-52">
            <span className="form-label">Writing provider</span>
            <select
              className="field mt-2"
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value as WritingProvider);
                setCloudConsent(false);
              }}
            >
              <option value="LOCAL">Local evidence writer</option>
              <option value="OPENAI" disabled={!state.cloudAi.enabled}>
                OpenAI cloud writer
              </option>
            </select>
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={
              !candidateId || busy || (provider === "OPENAI" && !cloudConsent)
            }
            onClick={() => void generate()}
          >
            {busy ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            {provider === "OPENAI"
              ? "Generate with cloud AI"
              : "Generate locally"}
          </button>
          {busy && provider === "OPENAI" && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => activeRequest.current?.abort()}
            >
              <X size={16} />
              Cancel
            </button>
          )}
        </div>
        <div className="mt-4 rounded-xl border border-white/8 bg-black/15 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-white">
              Optional cloud AI · {state.cloudAi.model}
            </p>
            <span className="text-xs text-slate-500">
              {state.cloudAi.enabled
                ? `${state.cloudAi.projectRequestsThisMonth}/${state.cloudAi.projectMonthlyRequestLimit} project requests this month · ${state.cloudAi.monthlyReservedOrSpentCents}¢/${state.cloudAi.monthlyBudgetCents}¢ reserved or spent`
                : "Disabled until a server key and positive monthly budget are configured"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Sends: {state.cloudAi.sends.join(", ")}. Never sends:{" "}
            {state.cloudAi.neverSends.join(", ")}. The conservative preflight
            maximum is about {state.cloudAi.estimatedMaximumRequestCents}¢ per
            request.
          </p>
          {provider === "OPENAI" && (
            <label className="mt-3 flex items-start gap-3 rounded-lg border border-amber-300/15 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100">
              <input
                className="mt-1"
                type="checkbox"
                checked={cloudConsent}
                onChange={(event) => setCloudConsent(event.target.checked)}
              />
              <span>
                I choose to send the listed bounded text evidence to OpenAI for
                this generation. I understand the full recording, audio,
                filenames, paths, and API key stay local.
              </span>
            </label>
          )}
        </div>
        {(message || error) && (
          <div
            role={error ? "alert" : "status"}
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              error
                ? "border-red-400/20 bg-red-500/8 text-red-200"
                : "border-[#b8ff2c]/20 bg-[#b8ff2c]/8 text-[#d8ff8a]"
            }`}
          >
            {error ?? message}
          </div>
        )}
      </div>

      {!revision ? (
        <div className="grid min-h-52 place-items-center p-8 text-center">
          <FileText className="mx-auto text-slate-700" size={32} />
          <h3 className="mt-4 font-semibold text-white">
            No saved story plan yet
          </h3>
          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
            Generate a package after reviewing a candidate. The facts panel will
            show exactly what the writer used and what still needs your
            confirmation.
          </p>
        </div>
      ) : (
        <RevisionEditor
          key={revision.id}
          revision={revision}
          versions={state.production?.versions ?? []}
          busy={busy}
          onSave={saveRevision}
        />
      )}
    </section>
  );
}

function RevisionEditor({
  revision,
  versions,
  busy,
  onSave,
}: {
  revision: NonNullable<
    NonNullable<ShortFormProductionState["production"]>["currentRevision"]
  >;
  versions: NonNullable<ShortFormProductionState["production"]>["versions"];
  busy: boolean;
  onSave: (
    storyPlan: ShortFormStoryPlan,
    writingPackage: ShortFormWritingPackage,
  ) => Promise<void>;
}) {
  const [storyPlan, setStoryPlan] = useState(revision.storyPlan);
  const [writing, setWriting] = useState(revision.writingPackage);
  const facts = revision.factsSnapshot as {
    videoObservations?: Array<{ summary?: string }>;
    transcriptStatements?: Array<{ summary?: string }>;
    verifiedReplayFacts?: Array<{ summary?: string }>;
    userConfirmedContext?: Array<{ label?: string; value?: string }>;
    unknowns?: string[];
  };

  function updateWriting(
    key: Exclude<
      keyof ShortFormWritingPackage,
      "hooks" | "factsUsed" | "factsNeedingConfirmation"
    >,
    value: string,
  ) {
    setWriting((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="grid gap-7 p-5 sm:p-6 xl:grid-cols-[minmax(18rem,0.6fr)_minmax(0,1.4fr)]">
      <aside className="space-y-5">
        <div className="rounded-xl border border-[#b8ff2c]/15 bg-[#b8ff2c]/5 p-4">
          <div className="flex items-center gap-2 text-[#d8ff8a]">
            <BookOpenCheck size={17} />
            <h3 className="font-semibold">Facts Review</h3>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Version {revision.version} · {revision.providerId}. Observations,
            transcript statements, replay facts, and your confirmed context
            remain separate.
          </p>
          <FactGroup
            title="Video observations"
            items={(facts.videoObservations ?? []).map(
              (item) => item.summary ?? "Bounded video evidence",
            )}
          />
          <FactGroup
            title="Transcript statements"
            items={(facts.transcriptStatements ?? []).map(
              (item) => item.summary ?? "Transcript evidence",
            )}
          />
          <FactGroup
            title="Verified replay facts"
            items={(facts.verifiedReplayFacts ?? []).map(
              (item) => item.summary ?? "Synchronized replay evidence",
            )}
          />
          <FactGroup
            title="User-confirmed context"
            items={(facts.userConfirmedContext ?? []).map(
              (item) => `${item.label}: ${item.value}`,
            )}
          />
          <FactGroup title="Unknown or missing" items={facts.unknowns ?? []} />
        </div>
        <div className="rounded-xl border border-white/8 bg-black/15 p-4">
          <div className="flex items-center gap-2">
            <History className="text-slate-600" size={16} />
            <h3 className="font-semibold text-white">Immutable history</h3>
          </div>
          <div className="mt-3 space-y-2">
            {versions.map((version) => (
              <div
                key={version.id}
                className="rounded-lg border border-white/6 px-3 py-2 text-xs text-slate-500"
              >
                <span className="font-bold text-slate-300">
                  Version {version.version}
                </span>{" "}
                · {version.reason}
                <span className="mt-1 block text-[9px] text-slate-700">
                  {version.providerId}
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="space-y-6">
        <section className="rounded-xl border border-white/8 bg-black/15 p-4">
          <h3 className="font-display text-xl font-bold text-white uppercase">
            Editable story plan
          </h3>
          <label className="mt-4 block">
            <span className="form-label">Premise</span>
            <textarea
              className="field mt-2 min-h-20 resize-y"
              value={storyPlan.premise}
              onChange={(event) =>
                setStoryPlan((current) => ({
                  ...current,
                  premise: event.target.value,
                }))
              }
            />
          </label>
          <div className="mt-4 space-y-3">
            {storyPlan.sections.map((section, index) => (
              <article
                key={section.id}
                className="rounded-xl border border-white/7 bg-white/2 p-4"
              >
                <div className="grid gap-3 sm:grid-cols-[1fr_7rem_7rem]">
                  <label>
                    <span className="form-label">
                      {label(section.kind)} title
                    </span>
                    <input
                      className="field mt-2"
                      value={section.title}
                      onChange={(event) =>
                        setStoryPlan((current) => ({
                          ...current,
                          sections: current.sections.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, title: event.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className="form-label">Start</span>
                    <input
                      className="field mt-2"
                      type="number"
                      min={0}
                      max={storyPlan.targetDurationSeconds}
                      step="0.1"
                      value={section.startSeconds}
                      onChange={(event) =>
                        setStoryPlan((current) => ({
                          ...current,
                          sections: current.sections.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  startSeconds: Number(event.target.value),
                                }
                              : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className="form-label">End</span>
                    <input
                      className="field mt-2"
                      type="number"
                      min={0}
                      max={storyPlan.targetDurationSeconds}
                      step="0.1"
                      value={section.endSeconds}
                      onChange={(event) =>
                        setStoryPlan((current) => ({
                          ...current,
                          sections: current.sections.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  endSeconds: Number(event.target.value),
                                }
                              : item,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="form-label">Narration or direction</span>
                  <textarea
                    className="field mt-2 min-h-16 resize-y"
                    value={section.narration}
                    onChange={(event) =>
                      setStoryPlan((current) => ({
                        ...current,
                        sections: current.sections.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, narration: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                </label>
                <p className="mt-2 text-[10px] leading-4 text-slate-600">
                  Why: {section.reason}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-white/8 bg-black/15 p-4">
          <h3 className="font-display text-xl font-bold text-white uppercase">
            Original writing package
          </h3>
          <div className="mt-4 grid gap-3">
            {writing.hooks.map((hook, index) => (
              <label key={index}>
                <span className="form-label">Opening hook {index + 1}</span>
                <textarea
                  className="field mt-2 min-h-16 resize-y"
                  value={hook}
                  onChange={(event) =>
                    setWriting((current) => {
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
            <WritingField
              label="Full voiceover"
              value={writing.fullVoiceover}
              onChange={(value) => updateWriting("fullVoiceover", value)}
              tall
            />
            <WritingField
              label="Short alternate voiceover"
              value={writing.shortVoiceover}
              onChange={(value) => updateWriting("shortVoiceover", value)}
            />
            <WritingField
              label="Live-audio-only option"
              value={writing.liveAudioOnly}
              onChange={(value) => updateWriting("liveAudioOnly", value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <WritingField
                label="YouTube Shorts title"
                value={writing.youtubeShortsTitle}
                onChange={(value) => updateWriting("youtubeShortsTitle", value)}
              />
              <WritingField
                label="Thumbnail text"
                value={writing.thumbnailText}
                onChange={(value) => updateWriting("thumbnailText", value)}
              />
              <WritingField
                label="TikTok caption"
                value={writing.tiktokCaption}
                onChange={(value) => updateWriting("tiktokCaption", value)}
              />
              <WritingField
                label="Instagram caption"
                value={writing.instagramCaption}
                onChange={(value) => updateWriting("instagramCaption", value)}
              />
            </div>
            <WritingField
              label="Caption guidance"
              value={writing.captionGuidance}
              onChange={(value) => updateWriting("captionGuidance", value)}
            />
            <WritingField
              label="Editing plan"
              value={writing.editingPlan}
              onChange={(value) => updateWriting("editingPlan", value)}
              tall
            />
            <WritingField
              label="Why this matches the selected profile"
              value={writing.structureMatchExplanation}
              onChange={(value) =>
                updateWriting("structureMatchExplanation", value)
              }
            />
          </div>
          <button
            type="button"
            className="primary-button mt-5"
            disabled={busy}
            onClick={() => void onSave(storyPlan, writing)}
          >
            {busy ? (
              <LoaderCircle className="animate-spin" size={15} />
            ) : (
              <Save size={15} />
            )}
            Save new revision
          </button>
        </section>
      </div>
    </div>
  );
}

function FactGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-4 border-t border-white/7 pt-3">
      <p className="text-[10px] font-bold tracking-wide text-slate-600 uppercase">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-600">None available.</p>
      ) : (
        <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-400">
          {items.slice(0, 10).map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-2">
              <CheckCircle2
                className="mt-0.5 shrink-0 text-slate-700"
                size={13}
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WritingField({
  label: fieldLabel,
  value,
  onChange,
  tall = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  tall?: boolean;
}) {
  return (
    <label>
      <span className="form-label">{fieldLabel}</span>
      <textarea
        className={`field mt-2 resize-y ${tall ? "min-h-40" : "min-h-20"}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
