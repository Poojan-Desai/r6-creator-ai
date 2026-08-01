"use client";

import {
  ArrowDown,
  ArrowUp,
  Captions,
  Clapperboard,
  Copy,
  Gauge,
  History,
  Layers3,
  LoaderCircle,
  Lock,
  Music,
  Plus,
  Save,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Volume2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { LongFormAudioPanel } from "@/components/long-form-audio-panel";
import { LongFormRenderPanel } from "@/components/long-form-render-panel";
import type { LongFormTimelineState } from "@/lib/long-form-timeline";
import {
  addLongFormTimelineItem,
  calculateLongFormTimelineMetrics,
  createLongFormTimelineItem,
  deleteLongFormTimelineItem,
  deleteLongFormTimelineSection,
  duplicateLongFormTimelineItem,
  duplicateLongFormTimelineSection,
  moveLongFormTimelineItem,
  moveLongFormTimelineSection,
  replaceLongFormTimelineItem,
  replaceLongFormTimelineSection,
  type LongFormTimelineDocument,
  type LongFormTimelineItem,
  type LongFormTimelineSection,
} from "@/lib/long-form-timeline-document";
import { formatDuration } from "@/lib/time";

function errorMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The long-form editor could not finish that action.";
}

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function LongFormEditorWorkspace({
  studioProjectId,
  initialState,
}: {
  studioProjectId: string;
  initialState: LongFormTimelineState;
}) {
  const [state, setState] = useState(initialState);
  const [document, setDocument] = useState<LongFormTimelineDocument | null>(
    initialState.currentRevision?.document ?? null,
  );
  const [selectedItemId, setSelectedItemId] = useState(
    initialState.currentRevision?.document.items[0]?.id ?? "",
  );
  const [selectedSectionId, setSelectedSectionId] = useState(
    initialState.currentRevision?.document.sections[0]?.id ?? "",
  );
  const [past, setPast] = useState<LongFormTimelineDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedItem = useMemo(
    () =>
      document?.items.find((item) => item.id === selectedItemId) ??
      document?.items[0] ??
      null,
    [document, selectedItemId],
  );
  const selectedSection = useMemo(
    () =>
      document?.sections.find((section) => section.id === selectedSectionId) ??
      document?.sections[0] ??
      null,
    [document, selectedSectionId],
  );

  function edit(next: LongFormTimelineDocument, itemId = selectedItemId) {
    if (!document) return;
    setPast((current) => [...current.slice(-29), document]);
    setDocument(next);
    setSelectedItemId(itemId);
    setDirty(true);
    setMessage(null);
    setError(null);
  }

  function undo() {
    const previous = past.at(-1);
    if (!previous || !document) return;
    setPast((current) => current.slice(0, -1));
    setDocument(previous);
    setSelectedItemId((current) =>
      previous.items.some((item) => item.id === current)
        ? current
        : (previous.items[0]?.id ?? ""),
    );
    setDirty(true);
  }

  async function initialize() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/long-form-timeline`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        timeline?: LongFormTimelineState;
        error?: { message?: string };
      };
      if (!response.ok || !body.timeline) {
        throw new Error(
          body.error?.message || "The first timeline could not be created.",
        );
      }
      setState(body.timeline);
      const next = body.timeline.currentRevision?.document ?? null;
      setDocument(next);
      setSelectedItemId(next?.items[0]?.id ?? "");
      setSelectedSectionId(next?.sections[0]?.id ?? "");
      setDirty(false);
      setMessage(
        "Timeline version 1 created from the saved plan. Source recordings were not changed.",
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function persist(
    snapshot: LongFormTimelineDocument,
    reason = "Manual long-form timeline save",
  ) {
    const response = await fetch(
      `/api/studio-projects/${studioProjectId}/long-form-timeline`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: snapshot, reason }),
      },
    );
    const body = (await response.json()) as {
      timeline?: LongFormTimelineState;
      error?: { message?: string };
    };
    if (!response.ok || !body.timeline) {
      throw new Error(
        body.error?.message || "The timeline revision could not be saved.",
      );
    }
    setState(body.timeline);
    setDocument(body.timeline.currentRevision?.document ?? snapshot);
    setDirty(false);
    return body.timeline;
  }

  async function saveNow() {
    if (!document) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const next = await persist(document);
      setMessage(
        `Saved immutable timeline version ${next.currentVersion}. Earlier versions remain available.`,
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function fitDuration() {
    if (!document) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await persist(document, "Before automatic duration fit");
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/long-form-timeline`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetDurationSeconds: document.targetDurationSeconds,
          }),
        },
      );
      const body = (await response.json()) as {
        state?: LongFormTimelineState;
        fitted?: boolean;
        remainingSeconds?: number;
        warnings?: string[];
        error?: { message?: string };
      };
      if (!response.ok || !body.state) {
        throw new Error(
          body.error?.message || "The timeline could not be fitted.",
        );
      }
      setState(body.state);
      setDocument(body.state.currentRevision?.document ?? null);
      setDirty(false);
      setMessage(
        body.fitted
          ? "Unlocked source ranges now fit the target. Locked sections were preserved."
          : `The safe fit stopped with ${(body.remainingSeconds ?? 0).toFixed(1)} seconds remaining. Review the displayed warning.`,
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!state.available) {
    return (
      <section className="panel p-6">
        <p className="section-kicker">U4.2 · Non-destructive editor</p>
        <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
          Save a plan before editing
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{state.message}</p>
      </section>
    );
  }

  if (!document) {
    return (
      <section className="panel p-6">
        <p className="section-kicker">U4.2 · Non-destructive editor</p>
        <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
          Build the first long-form timeline
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Convert the current plan into editable source ranges and sections.
          This stores instructions in SQLite and never overwrites a recording.
        </p>
        <button
          type="button"
          className="primary-button mt-5"
          disabled={busy}
          onClick={() => void initialize()}
        >
          {busy ? (
            <LoaderCircle className="animate-spin" size={16} />
          ) : (
            <Clapperboard size={16} />
          )}
          Create non-destructive timeline
        </button>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-200">
            {error}
          </p>
        )}
      </section>
    );
  }

  const metrics = calculateLongFormTimelineMetrics(document);
  const videoItems = document.items.filter((item) => item.track === "VIDEO");
  const overlayItems = document.items.filter(
    (item) => item.track === "OVERLAY",
  );
  const audioItems = document.items.filter(
    (item) => item.track === "VOICEOVER" || item.track === "MUSIC",
  );

  function addItem(kind: LongFormTimelineItem["kind"], mediaAssetId?: string) {
    if (!document) return;
    const track =
      kind === "TEXT_OVERLAY" || kind === "CAPTION"
        ? ("OVERLAY" as const)
        : kind === "VOICEOVER"
          ? ("VOICEOVER" as const)
          : kind === "MUSIC"
            ? ("MUSIC" as const)
            : ("VIDEO" as const);
    const asset =
      kind === "VOICEOVER" || kind === "MUSIC"
        ? state.mediaAssets.find(
            (candidate) =>
              candidate.kind === kind &&
              (!mediaAssetId || candidate.id === mediaAssetId),
          )
        : null;
    if ((kind === "VOICEOVER" || kind === "MUSIC") && !asset) {
      setError(
        `Import a permission-confirmed ${kind === "VOICEOVER" ? "voiceover" : "music"} asset before adding it.`,
      );
      return;
    }
    const item = createLongFormTimelineItem({
      id: crypto.randomUUID(),
      sectionId: selectedSection?.id ?? null,
      kind,
      track,
      order: document.items.filter((candidate) => candidate.track === track)
        .length,
      timelineStartSeconds:
        track === "VIDEO" ? document.currentDurationSeconds : 0,
      durationSeconds:
        kind === "SOURCE_VIDEO"
          ? 1
          : asset
            ? Math.min(asset.durationSeconds, document.currentDurationSeconds)
            : kind === "TRANSITION"
              ? 0.75
              : 2,
      mediaAssetId: asset?.id ?? null,
      text:
        kind === "CARD"
          ? "Edit chapter card"
          : kind === "TRANSITION"
            ? "Transition"
            : kind === "CAPTION"
              ? "Edit caption"
              : kind === "TEXT_OVERLAY"
                ? "Edit on-screen explanation"
                : null,
      duckOtherAudio: kind === "VOICEOVER",
      volume: kind === "MUSIC" ? 0.25 : 1,
      reason:
        kind === "VOICEOVER" || kind === "MUSIC"
          ? "User-added permission-confirmed local audio."
          : "User-added timeline element.",
    });
    edit(addLongFormTimelineItem(document, item), item.id);
  }

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-white/8 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-kicker">U4.2 · Lockable long-form timeline</p>
            <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
              Edit the plan without touching the source
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Lock important sections, trim or reorder source ranges, add
              original cards and overlays, and fit unlocked footage to the
              target. No random speed stretching is used.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="secondary-button"
              disabled={past.length === 0 || busy}
              onClick={undo}
            >
              <Undo2 size={15} /> Undo
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() => void fitDuration()}
            >
              <Gauge size={15} /> Fit unlocked sections
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy || !dirty}
              onClick={() => void saveNow()}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <Save size={15} />
              )}
              Save revision
            </button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <MetricPill
            label="Current"
            value={formatDuration(metrics.currentSeconds)}
          />
          <MetricPill
            label="Target"
            value={formatDuration(metrics.targetSeconds)}
          />
          <MetricPill
            label="Gameplay"
            value={formatDuration(metrics.gameplaySeconds)}
          />
          <MetricPill
            label="Voiceover"
            value={formatDuration(metrics.voiceoverSeconds)}
          />
          <MetricPill
            label="Removed source"
            value={formatDuration(metrics.removedSourceSeconds)}
          />
          <MetricPill label="Cuts" value={String(metrics.requiredCuts)} />
          <span
            role="status"
            className="rounded-full border border-[#b8ff2c]/15 px-3 py-1.5 text-[#d8ff8a]"
          >
            {dirty ? "Unsaved local changes" : `Saved v${state.currentVersion}`}
          </span>
        </div>
        {(message || error) && (
          <p
            role={error ? "alert" : "status"}
            className={`mt-4 text-sm ${error ? "text-red-200" : "text-[#d8ff8a]"}`}
          >
            {error ?? message}
          </p>
        )}
        {document.rebalanceWarnings.length > 0 && (
          <ul className="mt-4 space-y-2 rounded-xl border border-amber-300/15 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100/80">
            {document.rebalanceWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
        {document.sourcePlanVersion !== state.currentPlanVersion && (
          <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100/80">
            This timeline was created from plan version{" "}
            {document.sourcePlanVersion}, while the planner is now on version{" "}
            {state.currentPlanVersion}. Existing edits were preserved instead of
            being silently replaced.
          </p>
        )}
      </div>

      <div className="grid gap-7 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="secondary-button"
              onClick={() => addItem("CARD")}
            >
              <Plus size={14} /> Card
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => addItem("TRANSITION")}
            >
              <Layers3 size={14} /> Transition
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => addItem("TEXT_OVERLAY")}
            >
              <Type size={14} /> Explanation
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => addItem("CAPTION")}
            >
              <Captions size={14} /> Caption
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => addItem("VOICEOVER")}
            >
              <Volume2 size={14} /> Existing voiceover
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => addItem("MUSIC")}
            >
              <Music size={14} /> Existing music
            </button>
          </div>

          <TimelineTrack
            title="Video, cards, and transitions"
            items={videoItems}
            selectedItemId={selectedItem?.id ?? ""}
            totalDuration={Math.max(1, document.currentDurationSeconds)}
            onSelect={(item) => {
              setSelectedItemId(item.id);
              if (item.sectionId) setSelectedSectionId(item.sectionId);
            }}
          />
          <TimelineTrack
            title="Text and captions"
            items={overlayItems}
            selectedItemId={selectedItem?.id ?? ""}
            totalDuration={Math.max(1, document.currentDurationSeconds)}
            onSelect={(item) => setSelectedItemId(item.id)}
          />
          <TimelineTrack
            title="Voiceover and music"
            items={audioItems}
            selectedItemId={selectedItem?.id ?? ""}
            totalDuration={Math.max(1, document.currentDurationSeconds)}
            onSelect={(item) => setSelectedItemId(item.id)}
          />

          <LongFormAudioPanel
            studioProjectId={studioProjectId}
            assets={state.mediaAssets}
            onState={setState}
            onAdd={(kind, id) => addItem(kind, id)}
          />

          <LongFormRenderPanel
            studioProjectId={studioProjectId}
            state={state}
            onState={setState}
            canRender={!dirty && !busy}
          />

          <div className="mt-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="section-kicker">Story structure</p>
                <h3 className="font-display mt-1 text-2xl font-bold text-white uppercase">
                  Lock and arrange sections
                </h3>
              </div>
              <span className="text-xs text-slate-600">
                {metrics.lockedSectionCount} locked
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {document.sections.map((section) => (
                <SectionRow
                  key={section.id}
                  section={section}
                  selected={selectedSection?.id === section.id}
                  onSelect={() => setSelectedSectionId(section.id)}
                  onChange={(next) =>
                    edit(
                      replaceLongFormTimelineSection(document, next),
                      selectedItemId,
                    )
                  }
                  onMove={(direction) =>
                    edit(
                      moveLongFormTimelineSection(
                        document,
                        section.id,
                        direction,
                      ),
                    )
                  }
                  onDuplicate={() => {
                    const items = document.items.filter(
                      (item) => item.sectionId === section.id,
                    );
                    const id = crypto.randomUUID();
                    edit(
                      duplicateLongFormTimelineSection(
                        document,
                        section.id,
                        id,
                        items.map(() => crypto.randomUUID()),
                      ),
                    );
                    setSelectedSectionId(id);
                  }}
                  onDelete={() => {
                    edit(deleteLongFormTimelineSection(document, section.id));
                    setSelectedSectionId("");
                  }}
                />
              ))}
            </div>
          </div>

          <details className="mt-6 rounded-xl border border-white/8 bg-black/15 p-4">
            <summary className="cursor-pointer text-xs font-semibold text-slate-300">
              <History className="mr-2 inline" size={14} />
              Immutable timeline history
            </summary>
            <div className="mt-3 space-y-2">
              {state.revisions.map((revision) => (
                <p key={revision.id} className="text-xs text-slate-600">
                  Version {revision.version} · {revision.reason} ·{" "}
                  {new Date(revision.createdAt).toLocaleString()}
                </p>
              ))}
            </div>
          </details>
        </div>

        {selectedItem ? (
          <ItemEditor
            item={selectedItem}
            sections={document.sections}
            onChange={(next) =>
              edit(replaceLongFormTimelineItem(document, next), next.id)
            }
            onMove={(direction) =>
              edit(
                moveLongFormTimelineItem(document, selectedItem.id, direction),
              )
            }
            onDuplicate={() => {
              const id = crypto.randomUUID();
              edit(
                duplicateLongFormTimelineItem(document, selectedItem.id, id),
                id,
              );
            }}
            onDelete={() => {
              edit(deleteLongFormTimelineItem(document, selectedItem.id), "");
            }}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-slate-600">
            Select a timeline item to edit it.
          </div>
        )}
      </div>
    </section>
  );
}

function MetricPill({ label: name, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-white/8 px-3 py-1.5 text-slate-400">
      {name} {value}
    </span>
  );
}

function TimelineTrack({
  title,
  items,
  selectedItemId,
  totalDuration,
  onSelect,
}: {
  title: string;
  items: LongFormTimelineItem[];
  selectedItemId: string;
  totalDuration: number;
  onSelect: (item: LongFormTimelineItem) => void;
}) {
  return (
    <div className="mt-5">
      <p className="form-label">{title}</p>
      <div className="mt-2 min-h-20 overflow-x-auto rounded-xl border border-white/8 bg-black/30 p-2">
        {items.length === 0 ? (
          <p className="px-2 py-5 text-xs text-slate-700">No items</p>
        ) : (
          <div className="relative h-14 min-w-[48rem]">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`absolute top-0 h-14 min-w-8 overflow-hidden rounded-lg border px-2 text-left text-[9px] font-bold uppercase ${
                  selectedItemId === item.id
                    ? "z-10 border-[#b8ff2c]/50 bg-[#b8ff2c]/12 text-white"
                    : "border-white/10 bg-slate-900 text-slate-400"
                }`}
                style={{
                  left: `${Math.min(99, (item.timelineStartSeconds / totalDuration) * 100)}%`,
                  width: `${Math.max(1.25, (item.durationSeconds / totalDuration) * 100)}%`,
                }}
                onClick={() => onSelect(item)}
                title={`${label(item.kind)} · ${formatDuration(item.timelineStartSeconds)} · ${formatDuration(item.durationSeconds)}`}
              >
                <span className="block truncate">{label(item.kind)}</span>
                {item.locked && <Lock className="mt-1" size={10} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionRow({
  section,
  selected,
  onSelect,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  section: LongFormTimelineSection;
  selected: boolean;
  onSelect: () => void;
  onChange: (section: LongFormTimelineSection) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      className={`rounded-xl border p-4 ${
        selected
          ? "border-[#b8ff2c]/30 bg-[#b8ff2c]/5"
          : "border-white/8 bg-black/15"
      }`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onSelect}
        >
          <span className="block text-[10px] font-bold tracking-[0.12em] text-slate-600 uppercase">
            {label(section.kind)}
          </span>
          <span className="mt-1 block truncate text-sm font-semibold text-white">
            {section.title}
          </span>
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="secondary-button px-3"
            disabled={section.locked}
            onClick={() => onMove(-1)}
            aria-label={`Move ${section.title} earlier`}
          >
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className="secondary-button px-3"
            disabled={section.locked}
            onClick={() => onMove(1)}
            aria-label={`Move ${section.title} later`}
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            className="secondary-button px-3"
            onClick={onDuplicate}
            aria-label={`Duplicate ${section.title}`}
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            className="secondary-button px-3"
            onClick={() => onChange({ ...section, locked: !section.locked })}
          >
            {section.locked ? <Lock size={14} /> : <Unlock size={14} />}
            {section.locked ? "Locked" : "Unlocked"}
          </button>
          <button
            type="button"
            className="secondary-button px-3 text-red-200"
            disabled={section.locked}
            onClick={onDelete}
            aria-label={`Delete ${section.title}`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {selected && (
        <label className="mt-3 block">
          <span className="form-label">Section title</span>
          <input
            className="field mt-2"
            value={section.title}
            maxLength={300}
            onChange={(event) =>
              onChange({ ...section, title: event.target.value })
            }
          />
        </label>
      )}
    </article>
  );
}

function ItemEditor({
  item,
  sections,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  item: LongFormTimelineItem;
  sections: LongFormTimelineSection[];
  onChange: (item: LongFormTimelineItem) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const set = <Key extends keyof LongFormTimelineItem>(
    key: Key,
    value: LongFormTimelineItem[Key],
  ) => onChange({ ...item, [key]: value });
  const videoLike =
    item.kind === "SOURCE_VIDEO" ||
    item.kind === "CARD" ||
    item.kind === "TRANSITION";

  return (
    <aside className="h-fit rounded-xl border border-white/8 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-kicker">Selected item</p>
          <h3 className="mt-1 font-semibold text-white">{label(item.kind)}</h3>
        </div>
        <button
          type="button"
          className="secondary-button px-3"
          onClick={() => set("locked", !item.locked)}
        >
          {item.locked ? <Lock size={14} /> : <Unlock size={14} />}
          {item.locked ? "Locked" : "Unlocked"}
        </button>
      </div>

      <label className="mt-4 block">
        <span className="form-label">Section</span>
        <select
          className="field mt-2"
          value={item.sectionId ?? ""}
          onChange={(event) => set("sectionId", event.target.value || null)}
        >
          <option value="">No section</option>
          {sections.map((section) => (
            <option key={section.id} value={section.id}>
              {section.title}
            </option>
          ))}
        </select>
      </label>

      {item.kind === "SOURCE_VIDEO" ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <NumberField
            label="Source start"
            value={item.sourceStartSeconds ?? 0}
            min={0}
            max={item.sourceEndSeconds ?? 86_400}
            step={0.01}
            onChange={(value) => set("sourceStartSeconds", value)}
          />
          <NumberField
            label="Source end"
            value={item.sourceEndSeconds ?? 0}
            min={item.sourceStartSeconds ?? 0}
            max={86_400}
            step={0.01}
            onChange={(value) => set("sourceEndSeconds", value)}
          />
          <NumberField
            label="Speed"
            value={item.speed}
            min={0.25}
            max={4}
            step={0.05}
            onChange={(value) => set("speed", value)}
          />
          <NumberField
            label="Freeze at end"
            value={item.freezeFrameSeconds}
            min={0}
            max={30}
            step={0.1}
            onChange={(value) => set("freezeFrameSeconds", value)}
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {!videoLike && (
            <NumberField
              label="Timeline start"
              value={item.timelineStartSeconds}
              min={0}
              max={14_400}
              step={0.1}
              onChange={(value) => set("timelineStartSeconds", value)}
            />
          )}
          <NumberField
            label="Duration"
            value={item.durationSeconds}
            min={0.1}
            max={14_400}
            step={0.1}
            onChange={(value) => set("durationSeconds", value)}
          />
        </div>
      )}

      {(item.kind === "CARD" ||
        item.kind === "TRANSITION" ||
        item.kind === "TEXT_OVERLAY" ||
        item.kind === "CAPTION") && (
        <label className="mt-4 block">
          <span className="form-label">Text</span>
          <textarea
            className="field mt-2 min-h-20"
            value={item.text ?? ""}
            maxLength={10_000}
            onChange={(event) => set("text", event.target.value)}
          />
        </label>
      )}

      {(item.kind === "SOURCE_VIDEO" || item.kind === "CARD") && (
        <div className="mt-5 border-t border-white/8 pt-4">
          <p className="form-label">Framing and explanation emphasis</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="col-span-2">
              <span className="form-label">Crop mode</span>
              <select
                className="field mt-2"
                value={item.cropMode}
                onChange={(event) =>
                  set(
                    "cropMode",
                    event.target.value as LongFormTimelineItem["cropMode"],
                  )
                }
              >
                <option value="FIT">Fit</option>
                <option value="FILL">Fill</option>
                <option value="CENTER_CROP">Center crop</option>
                <option value="MANUAL">Manual</option>
                <option value="AUTO_SUGGESTION">Centered suggestion</option>
              </select>
            </label>
            <NumberField
              label="Zoom"
              value={item.zoom}
              min={1}
              max={4}
              step={0.05}
              onChange={(value) => set("zoom", value)}
            />
            <NumberField
              label="Pan left/right"
              value={item.panX}
              min={-1}
              max={1}
              step={0.05}
              onChange={(value) => set("panX", value)}
            />
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-white/8 pt-4">
        <p className="form-label">Transitions and audio</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label>
            <span className="form-label">Transition in</span>
            <select
              className="field mt-2"
              value={item.transitionIn}
              onChange={(event) =>
                set(
                  "transitionIn",
                  event.target.value as LongFormTimelineItem["transitionIn"],
                )
              }
            >
              <option value="NONE">None</option>
              <option value="FADE">Fade</option>
              <option value="DIP_TO_BLACK">Dip to black</option>
            </select>
          </label>
          <NumberField
            label="Volume"
            value={item.volume}
            min={0}
            max={2}
            step={0.05}
            onChange={(value) => set("volume", value)}
          />
        </div>
        <div className="mt-3 grid gap-2">
          <CheckField
            label="Mute this item"
            checked={item.muted}
            onChange={(value) => set("muted", value)}
          />
          <CheckField
            label="Duck other audio"
            checked={item.duckOtherAudio}
            onChange={(value) => set("duckOtherAudio", value)}
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-4">
        <button
          type="button"
          className="secondary-button px-3"
          disabled={item.locked}
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={14} /> Earlier
        </button>
        <button
          type="button"
          className="secondary-button px-3"
          disabled={item.locked}
          onClick={() => onMove(1)}
        >
          <ArrowDown size={14} /> Later
        </button>
        <button
          type="button"
          className="secondary-button px-3"
          onClick={onDuplicate}
        >
          <Copy size={14} /> Duplicate
        </button>
        <button
          type="button"
          className="secondary-button px-3 text-red-200"
          disabled={item.locked}
          onClick={onDelete}
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
      <div className="mt-4 rounded-lg border border-white/7 p-3">
        <p className="text-[10px] font-bold tracking-[0.1em] text-slate-600 uppercase">
          Why this item exists
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-400">{item.reason}</p>
        {item.warnings.map((warning) => (
          <p key={warning} className="mt-2 text-xs leading-5 text-amber-100/70">
            {warning}
          </p>
        ))}
      </div>
    </aside>
  );
}

function NumberField({
  label: name,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="form-label">{name}</span>
      <input
        className="field mt-2"
        type="number"
        value={round(value)}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function CheckField({
  label: name,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {name}
    </label>
  );
}
