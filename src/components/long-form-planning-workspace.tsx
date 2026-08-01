"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Film,
  History,
  Layers3,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import type {
  LongFormProductionState,
  LongFormSettings,
} from "@/lib/long-form-productions";
import { formatDuration } from "@/lib/time";

type StoryStyle = LongFormSettings["storytellingStyle"];

const defaultSettings: LongFormSettings = {
  targetDurationSeconds: 1_500,
  storytellingStyle: "STORYTELLING",
  energyLevel: 60,
  humorLevel: 40,
  educationalLevel: 30,
  liveGameplayPercent: 75,
  voiceoverPercent: 25,
  matchOrRoundLimit: 4,
  excludeWeakSections: true,
  includeLosses: true,
  chronologicalOrder: true,
};

function errorMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The local long-form planner could not finish that action.";
}

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function percentColor(value: number) {
  return value >= 70
    ? "text-[#b8ff2c]"
    : value >= 40
      ? "text-amber-200"
      : "text-slate-400";
}

export function LongFormPlanningWorkspace({
  studioProjectId,
  initialState,
}: {
  studioProjectId: string;
  initialState: LongFormProductionState;
}) {
  const [state, setState] = useState(initialState);
  const [settings, setSettings] = useState<LongFormSettings>(
    initialState.production?.settings ?? defaultSettings,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof LongFormSettings>(
    key: K,
    value: LongFormSettings[K],
  ) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function updateGameplayShare(value: number) {
    const clamped = Math.max(0, Math.min(100, value));
    setSettings((current) => ({
      ...current,
      liveGameplayPercent: clamped,
      voiceoverPercent: 100 - clamped,
    }));
  }

  async function generate() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/long-form-production`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        },
      );
      const body = (await response.json()) as {
        productionState?: LongFormProductionState;
        error?: { message?: string };
      };
      if (!response.ok || !body.productionState) {
        throw new Error(
          body.error?.message || "The local plan could not be generated.",
        );
      }
      setState(body.productionState);
      setSettings(body.productionState.production?.settings ?? defaultSettings);
      setMessage(
        `Saved immutable planner version ${body.productionState.production?.currentVersion ?? 0}. Earlier versions remain available.`,
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const revision = state.production?.currentRevision ?? null;
  const plan = revision?.plan ?? null;

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="border-b border-white/8 p-5 sm:p-6">
          <p className="section-kicker">U4.1 · Local planning controls</p>
          <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
            Choose the shape of the video
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            The planner uses linked recordings, saved local candidate evidence,
            and user-confirmed facts. It creates a reviewable plan, not an
            automatic claim about what happened or what will get views.
          </p>
        </div>

        <div className="p-5 sm:p-6">
          <fieldset>
            <legend className="form-label">Target video length</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                [1_200, "20 minutes"],
                [1_500, "25 minutes"],
                [1_800, "30 minutes"],
              ].map(([seconds, text]) => (
                <button
                  key={seconds}
                  type="button"
                  className={`secondary-button ${
                    settings.targetDurationSeconds === seconds
                      ? "border-[#b8ff2c]/35 bg-[#b8ff2c]/8 text-white"
                      : ""
                  }`}
                  onClick={() =>
                    update("targetDurationSeconds", Number(seconds))
                  }
                >
                  {text}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label>
              <span className="form-label">Custom length in minutes</span>
              <input
                className="field mt-2"
                type="number"
                min={5}
                max={240}
                step={1}
                value={Math.round(settings.targetDurationSeconds / 60)}
                onChange={(event) =>
                  update(
                    "targetDurationSeconds",
                    Number(event.target.value) * 60,
                  )
                }
              />
            </label>
            <label>
              <span className="form-label">Storytelling style</span>
              <select
                className="field mt-2"
                value={settings.storytellingStyle}
                onChange={(event) =>
                  update("storytellingStyle", event.target.value as StoryStyle)
                }
              >
                <option value="NATURAL">Natural</option>
                <option value="STORYTELLING">Storytelling</option>
                <option value="HIGH_ENERGY">High energy</option>
                <option value="EDUCATIONAL">Educational</option>
                <option value="SERIOUS">Serious</option>
                <option value="SESSION_RECAP">Session recap</option>
              </select>
            </label>
            <label>
              <span className="form-label">Matches or rounds to feature</span>
              <input
                className="field mt-2"
                type="number"
                min={1}
                max={40}
                value={settings.matchOrRoundLimit}
                onChange={(event) =>
                  update("matchOrRoundLimit", Number(event.target.value))
                }
              />
            </label>
            <div>
              <span className="form-label">Linked source</span>
              <div className="mt-2 rounded-xl border border-white/8 bg-black/15 px-4 py-3 text-sm text-slate-300">
                {state.recordings.length} recording
                {state.recordings.length === 1 ? "" : "s"} ·{" "}
                {formatDuration(
                  state.recordings.reduce(
                    (total, recording) => total + recording.durationSeconds,
                    0,
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <RangeField
              label="Energy"
              value={settings.energyLevel}
              onChange={(value) => update("energyLevel", value)}
            />
            <RangeField
              label="Humor"
              value={settings.humorLevel}
              onChange={(value) => update("humorLevel", value)}
            />
            <RangeField
              label="Educational detail"
              value={settings.educationalLevel}
              onChange={(value) => update("educationalLevel", value)}
            />
            <RangeField
              label="Live gameplay"
              value={settings.liveGameplayPercent}
              onChange={updateGameplayShare}
              detail={`${settings.voiceoverPercent}% voiceover`}
            />
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <CheckField
              checked={settings.excludeWeakSections}
              label="Exclude weak sections after review"
              onChange={(value) => update("excludeWeakSections", value)}
            />
            <CheckField
              checked={settings.includeLosses}
              label="Allow losses in the story"
              onChange={(value) => update("includeLosses", value)}
            />
            <CheckField
              checked={settings.chronologicalOrder}
              label="Keep source order chronological"
              onChange={(value) => update("chronologicalOrder", value)}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/8 pt-6">
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={generate}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              {revision ? "Regenerate local plan" : "Generate local plan"}
            </button>
            <p className="text-xs leading-5 text-slate-500">
              Local and deterministic · no footage or transcript leaves this
              Mac.
            </p>
          </div>
          {message && (
            <p
              className="mt-4 flex items-center gap-2 rounded-xl border border-[#b8ff2c]/20 bg-[#b8ff2c]/6 p-3 text-sm text-[#d8ff8a]"
              role="status"
            >
              <CheckCircle2 size={16} /> {message}
            </p>
          )}
          {error && (
            <p
              className="mt-4 flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/7 p-3 text-sm text-rose-100"
              role="alert"
            >
              <AlertTriangle size={16} /> {error}
            </p>
          )}
        </div>
      </section>

      {!plan ? (
        <section className="panel p-8 text-center">
          <BookOpenCheck className="mx-auto text-slate-700" size={34} />
          <h2 className="mt-4 text-xl font-semibold text-white">
            No long-form plan yet
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Choose your settings above, then generate the first immutable local
            plan. Nothing is rendered or removed at this stage.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={Clock3}
              label="Planned duration"
              value={formatDuration(plan.proposedDurationSeconds)}
              detail={
                plan.durationFit === "EXACT"
                  ? "Matches the requested target"
                  : "Shortened because source is limited"
              }
            />
            <MetricCard
              icon={Film}
              label="Source available"
              value={formatDuration(plan.availableSourceSeconds)}
              detail={`${formatDuration(plan.metrics.estimatedRemovedSeconds)} outside the current plan`}
            />
            <MetricCard
              icon={Layers3}
              label="Planned sections"
              value={String(plan.metrics.sectionCount)}
              detail={`About ${plan.metrics.requiredCutsEstimate} structural cuts`}
            />
            <MetricCard
              icon={History}
              label="Saved version"
              value={`v${revision?.version ?? 0}`}
              detail={revision?.plannerVersion ?? "Unknown planner"}
            />
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-white/8 p-5 sm:p-6">
              <p className="section-kicker">Evidence-bounded premise</p>
              <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
                {plan.premise}
              </h2>
            </div>
            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
              <TextBlock title="Opening teaser" text={plan.openingTeaser} />
              <TextBlock title="Intro script" text={plan.introScript} />
              <TextBlock
                title="Mid-video retention beat"
                text={plan.midVideoRetentionBeat}
              />
              <TextBlock title="Climax plan" text={plan.climaxPlan} />
              <TextBlock title="Ending" text={plan.ending} />
              <TextBlock title="Call to action" text={plan.callToAction} />
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-white/8 p-5 sm:p-6">
              <p className="section-kicker">Planned chapter timeline</p>
              <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
                Review every source range
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                U4.1 proposes ranges without cutting or deleting footage.
                Locking, rebalancing, and timeline editing arrive in U4.2.
              </p>
            </div>
            <ol className="divide-y divide-white/7">
              {plan.sections.map((section, index) => (
                <li key={section.id} className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.14em] text-[#b8ff2c] uppercase">
                        {label(section.kind)} · Section {index + 1}
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-white">
                        {section.title}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        {section.reason}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-slate-300">
                      {formatDuration(section.outputStartSeconds)}–
                      {formatDuration(section.outputEndSeconds)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    <DetailCard
                      title="Source ranges"
                      lines={section.sourceRanges.map(
                        (range) =>
                          `${range.recordingName}: ${formatDuration(range.sourceStartSeconds)}–${formatDuration(range.sourceEndSeconds)}`,
                      )}
                    />
                    <DetailCard
                      title="Voiceover direction"
                      lines={[section.voiceoverDirection]}
                    />
                    <DetailCard
                      title="Evidence and review"
                      lines={[...section.evidence, ...section.warnings]}
                    />
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <ListPanel title="Title options" items={plan.titleOptions} />
            <ListPanel
              title="Thumbnail concepts"
              items={plan.thumbnailConcepts}
            />
            <ListPanel
              title="Chapter timestamps"
              items={plan.chapterTimestamps.map(
                (chapter) =>
                  `${formatDuration(chapter.startSeconds)} — ${chapter.title}`,
              )}
            />
            <ListPanel
              title="Selected matches and rounds"
              items={plan.selectedMatchesAndRounds}
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <NoticePanel
              title="Evidence used"
              items={plan.evidenceSummary}
              tone="good"
            />
            <NoticePanel
              title="Warnings and unknowns"
              items={[...plan.warnings, ...plan.unknowns]}
              tone="warning"
            />
          </section>

          <section className="panel p-5 sm:p-6">
            <p className="section-kicker">Saved revision history</p>
            <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
              Earlier plans remain unchanged
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {state.production?.versions.map((version) => (
                <span
                  key={version.id}
                  className="rounded-full border border-white/9 bg-black/20 px-3 py-2 text-xs text-slate-400"
                >
                  v{version.version} · {version.reason} ·{" "}
                  {new Date(version.createdAt).toLocaleString()}
                </span>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function RangeField({
  label: fieldLabel,
  value,
  detail,
  onChange,
}: {
  label: string;
  value: number;
  detail?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="flex items-center justify-between gap-3">
        <span className="form-label">{fieldLabel}</span>
        <span className={`text-xs font-bold ${percentColor(value)}`}>
          {value}%{detail ? ` · ${detail}` : ""}
        </span>
      </span>
      <input
        className="mt-3 w-full accent-[#b8ff2c]"
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function CheckField({
  checked,
  label: fieldLabel,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-black/15 p-4 text-sm text-slate-300">
      <input
        className="mt-0.5 size-4 accent-[#b8ff2c]"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{fieldLabel}</span>
    </label>
  );
}

function MetricCard({
  icon: Icon,
  label: metricLabel,
  value,
  detail,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="panel p-5">
      <Icon className="text-[#b8ff2c]" size={19} />
      <p className="mt-4 text-xs font-bold tracking-[0.12em] text-slate-500 uppercase">
        {metricLabel}
      </p>
      <p className="font-display mt-1 text-3xl font-bold text-white uppercase">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function TextBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function DetailCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/15 p-4">
      <h4 className="text-xs font-bold tracking-[0.1em] text-slate-500 uppercase">
        {title}
      </h4>
      <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-400">
        {lines.map((line, index) => (
          <li key={`${line}-${index}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="font-display text-2xl font-bold text-white uppercase">
        {title}
      </h2>
      <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className="rounded-xl border border-white/8 bg-black/15 p-3"
          >
            {item}
          </li>
        ))}
      </ol>
    </section>
  );
}

function NoticePanel({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "good" | "warning";
}) {
  return (
    <section
      className={`rounded-3xl border p-5 sm:p-6 ${
        tone === "good"
          ? "border-[#b8ff2c]/15 bg-[#b8ff2c]/4"
          : "border-amber-300/15 bg-amber-300/4"
      }`}
    >
      <h2 className="font-display text-2xl font-bold text-white uppercase">
        {title}
      </h2>
      <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex items-start gap-2">
            {tone === "good" ? (
              <CheckCircle2
                className="mt-1 shrink-0 text-[#b8ff2c]"
                size={15}
              />
            ) : (
              <AlertTriangle
                className="mt-1 shrink-0 text-amber-200"
                size={15}
              />
            )}
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
