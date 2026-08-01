"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Captions,
  Clapperboard,
  Copy,
  History,
  LoaderCircle,
  Lock,
  Plus,
  Redo2,
  Save,
  Scissors,
  Trash2,
  Type,
  Undo2,
  Unlock,
} from "lucide-react";

import type { ShortFormTimelineState } from "@/lib/short-form-timeline";
import {
  addTimelineItem,
  createTimelineItem,
  deleteTimelineItem,
  duplicateTimelineItem,
  moveTimelineItem,
  replaceTimelineItem,
  splitSourceTimelineItem,
  type TimelineDocument,
  type TimelineItem,
} from "@/lib/timeline-document";

function errorMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The non-destructive editor could not finish that action.";
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

export function ShortFormEditorWorkspace({
  studioProjectId,
  initialState,
}: {
  studioProjectId: string;
  initialState: ShortFormTimelineState;
}) {
  const [state, setState] = useState(initialState);
  const [document, setDocument] = useState<TimelineDocument | null>(
    initialState.currentRevision?.document ?? null,
  );
  const [selectedItemId, setSelectedItemId] = useState(
    initialState.currentRevision?.document.items[0]?.id ?? "",
  );
  const [past, setPast] = useState<TimelineDocument[]>([]);
  const [future, setFuture] = useState<TimelineDocument[]>([]);
  const [dirtySequence, setDirtySequence] = useState(0);
  const [saveState, setSaveState] = useState<
    "idle" | "dirty" | "saving" | "saved"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const latestDocument = useRef(document);

  useEffect(() => {
    latestDocument.current = document;
  }, [document]);

  const selectedItem = useMemo(
    () =>
      document?.items.find((item) => item.id === selectedItemId) ??
      document?.items[0] ??
      null,
    [document, selectedItemId],
  );

  async function refresh() {
    setError(null);
    const response = await fetch(
      `/api/studio-projects/${studioProjectId}/timeline`,
    );
    const body = (await response.json()) as {
      timeline?: ShortFormTimelineState;
      error?: { message?: string };
    };
    if (!response.ok || !body.timeline) {
      throw new Error(
        body.error?.message || "The timeline state could not be loaded.",
      );
    }
    setState(body.timeline);
    const next = body.timeline.currentRevision?.document ?? null;
    setDocument(next);
    setSelectedItemId(next?.items[0]?.id ?? "");
    return body.timeline;
  }

  async function initialize() {
    setSaveState("saving");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/timeline`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        timeline?: ShortFormTimelineState;
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
      setMessage(
        "Timeline version 1 created from the reviewed candidate. The source recording was not changed.",
      );
      setSaveState("saved");
    } catch (reason) {
      setError(errorMessage(reason));
      setSaveState("idle");
    }
  }

  function edit(next: TimelineDocument, nextSelectedId = selectedItemId) {
    if (!document) return;
    setPast((current) => [...current.slice(-49), document]);
    setFuture([]);
    setDocument(next);
    setSelectedItemId(nextSelectedId);
    setDirtySequence((current) => current + 1);
    setSaveState("dirty");
    setMessage(null);
    setError(null);
  }

  function updateItem(next: TimelineItem) {
    if (!document) return;
    edit(replaceTimelineItem(document, next), next.id);
  }

  const persist = useCallback(
    async (snapshot: TimelineDocument, reason = "Timeline autosave") => {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/timeline`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: snapshot, reason }),
        },
      );
      const body = (await response.json()) as {
        timeline?: ShortFormTimelineState;
        error?: { message?: string };
      };
      if (!response.ok || !body.timeline) {
        throw new Error(body.error?.message || "Timeline autosave failed.");
      }
      setState(body.timeline);
      setSaveState("saved");
      return body.timeline;
    },
    [studioProjectId],
  );

  useEffect(() => {
    if (!document || dirtySequence === 0) return;
    const timer = window.setTimeout(() => {
      const snapshot = latestDocument.current;
      if (!snapshot) return;
      setSaveState("saving");
      saveChain.current = saveChain.current
        .then(() => persist(snapshot))
        .catch((reason: unknown) => {
          setSaveState("dirty");
          setError(errorMessage(reason));
        });
    }, 1_100);
    return () => window.clearTimeout(timer);
  }, [dirtySequence, document, persist]);

  function undo() {
    if (!document || past.length === 0) return;
    const previous = past.at(-1)!;
    setPast((current) => current.slice(0, -1));
    setFuture((current) => [document, ...current].slice(0, 50));
    setDocument(previous);
    setSelectedItemId((current) =>
      previous.items.some((item) => item.id === current)
        ? current
        : (previous.items[0]?.id ?? ""),
    );
    setDirtySequence((current) => current + 1);
    setSaveState("dirty");
  }

  function redo() {
    if (!document || future.length === 0) return;
    const next = future[0]!;
    setFuture((current) => current.slice(1));
    setPast((current) => [...current.slice(-49), document]);
    setDocument(next);
    setSelectedItemId((current) =>
      next.items.some((item) => item.id === current)
        ? current
        : (next.items[0]?.id ?? ""),
    );
    setDirtySequence((current) => current + 1);
    setSaveState("dirty");
  }

  function addCard(position: "start" | "end") {
    if (!document) return;
    const card = createTimelineItem({
      id: crypto.randomUUID(),
      kind: "CARD",
      track: "VIDEO",
      order:
        position === "start"
          ? 0
          : document.items.filter((item) => item.track === "VIDEO").length,
      durationSeconds: 2,
      text: position === "start" ? "Intro card" : "Ending card",
      cropMode: "FILL",
    });
    const base =
      position === "start"
        ? {
            ...document,
            items: document.items.map((item) =>
              item.track === "VIDEO"
                ? { ...item, order: item.order + 1 }
                : item,
            ),
          }
        : document;
    edit(addTimelineItem(base, card), card.id);
  }

  function addOverlay(kind: "TEXT_OVERLAY" | "CAPTION") {
    if (!document) return;
    const overlay = createTimelineItem({
      id: crypto.randomUUID(),
      kind,
      track: "OVERLAY",
      order: document.items.filter((item) => item.track === "OVERLAY").length,
      timelineStartSeconds: 0,
      durationSeconds: Math.min(
        3,
        Math.max(0.1, document.currentDurationSeconds),
      ),
      text: kind === "CAPTION" ? "Edit caption text" : "Edit overlay text",
    });
    edit(addTimelineItem(document, overlay), overlay.id);
  }

  function addAudio(kind: "VOICEOVER" | "MUSIC", mediaAssetId: string) {
    if (!document) return;
    const asset = state.mediaAssets.find((item) => item.id === mediaAssetId);
    if (!asset) return;
    const item = createTimelineItem({
      id: crypto.randomUUID(),
      kind,
      track: kind,
      order: document.items.filter((candidate) => candidate.track === kind)
        .length,
      durationSeconds: Math.min(
        asset.durationSeconds,
        Math.max(0.1, document.currentDurationSeconds),
      ),
      mediaAssetId: asset.id,
      duckOtherAudio: kind === "VOICEOVER",
      volume: kind === "MUSIC" ? 0.25 : 1,
    });
    edit(addTimelineItem(document, item), item.id);
  }

  if (!state.available) {
    return (
      <section className="panel mt-8 p-6">
        <p className="section-kicker">U3.3 · Non-destructive editor</p>
        <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
          Save the story before editing
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          {state.message}
        </p>
        <button
          type="button"
          className="secondary-button mt-5"
          onClick={() =>
            void refresh().catch((reason) => setError(errorMessage(reason)))
          }
        >
          Refresh editor availability
        </button>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-200">
            {error}
          </p>
        )}
      </section>
    );
  }

  if (!document) {
    return (
      <section className="panel mt-8 p-6">
        <p className="section-kicker">U3.3 · Non-destructive editor</p>
        <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
          Build the first timeline
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Create a local edit from the reviewed candidate. This stores
          instructions and never changes the original MP4.
        </p>
        <button
          type="button"
          className="primary-button mt-5"
          disabled={saveState === "saving"}
          onClick={() => void initialize()}
        >
          {saveState === "saving" ? (
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

  const videoItems = document.items.filter((item) => item.track === "VIDEO");
  const overlayItems = document.items.filter(
    (item) => item.track === "OVERLAY",
  );
  const audioItems = document.items.filter(
    (item) => item.track === "VOICEOVER" || item.track === "MUSIC",
  );

  return (
    <section className="panel mt-8 overflow-hidden">
      <div className="border-b border-white/8 p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-kicker">U3.3 · Non-destructive editor</p>
            <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
              Shape the edit, preserve the source
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Timeline edits save as immutable local revisions. The original
              recordings and uploaded audio are never overwritten.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="secondary-button"
              disabled={past.length === 0}
              onClick={undo}
              aria-label="Undo last timeline edit"
            >
              <Undo2 size={15} /> Undo
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={future.length === 0}
              onClick={redo}
              aria-label="Redo timeline edit"
            >
              <Redo2 size={15} /> Redo
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={saveState === "saving"}
              onClick={() => {
                setSaveState("saving");
                void persist(document, "Manual timeline save")
                  .then(() =>
                    setMessage("Timeline saved as a new immutable revision."),
                  )
                  .catch((reason) => {
                    setSaveState("dirty");
                    setError(errorMessage(reason));
                  });
              }}
            >
              {saveState === "saving" ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <Save size={15} />
              )}
              Save now
            </button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/8 px-3 py-1.5 text-slate-400">
            Current {document.currentDurationSeconds.toFixed(1)}s
          </span>
          <span className="rounded-full border border-white/8 px-3 py-1.5 text-slate-400">
            Target {document.targetDurationSeconds.toFixed(0)}s
          </span>
          <span className="rounded-full border border-white/8 px-3 py-1.5 text-slate-400">
            {label(document.aspectRatio)}
          </span>
          <span
            role="status"
            className="rounded-full border border-[#b8ff2c]/15 px-3 py-1.5 text-[#d8ff8a]"
          >
            {saveState === "saving"
              ? "Autosaving…"
              : saveState === "dirty"
                ? "Unsaved changes"
                : `Saved version ${state.currentVersion}`}
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
      </div>

      <div className="grid gap-7 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
        <div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="secondary-button"
              onClick={() => addCard("start")}
            >
              <Plus size={14} /> Intro card
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => addOverlay("TEXT_OVERLAY")}
            >
              <Type size={14} /> Text overlay
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => addOverlay("CAPTION")}
            >
              <Captions size={14} /> Caption
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => addCard("end")}
            >
              <Plus size={14} /> Ending card
            </button>
          </div>

          <TimelineTrack
            title="Video"
            items={videoItems}
            selectedItemId={selectedItem?.id ?? ""}
            totalDuration={Math.max(1, document.currentDurationSeconds)}
            onSelect={setSelectedItemId}
          />
          <TimelineTrack
            title="Text and captions"
            items={overlayItems}
            selectedItemId={selectedItem?.id ?? ""}
            totalDuration={Math.max(1, document.currentDurationSeconds)}
            onSelect={setSelectedItemId}
          />
          <TimelineTrack
            title="Voiceover and music"
            items={audioItems}
            selectedItemId={selectedItem?.id ?? ""}
            totalDuration={Math.max(1, document.currentDurationSeconds)}
            onSelect={setSelectedItemId}
          />

          <div className="mt-5 rounded-xl border border-white/8 bg-black/15 p-4">
            <p className="text-xs font-bold tracking-wide text-slate-300 uppercase">
              Local voiceover and licensed music
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Audio uploads arrive in the proxy-render checkpoint. Only audio
              you record, own, or may use can be added. The app never supplies
              copyrighted music.
            </p>
            {state.mediaAssets.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {state.mediaAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    className="secondary-button"
                    onClick={() => addAudio(asset.kind, asset.id)}
                  >
                    <Plus size={13} /> {asset.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <details className="mt-5 rounded-xl border border-white/8 bg-black/15 p-4">
            <summary className="cursor-pointer text-xs font-semibold text-slate-300">
              <History className="mr-2 inline" size={14} />
              Immutable timeline history
            </summary>
            <div className="mt-3 space-y-2">
              {state.revisions.map((revision) => (
                <p key={revision.id} className="text-xs text-slate-600">
                  Version {revision.version} · {revision.reason}
                </p>
              ))}
            </div>
          </details>
        </div>

        {selectedItem ? (
          <TimelineItemEditor
            key={selectedItem.id}
            item={selectedItem}
            document={document}
            onChange={updateItem}
            onDelete={() => {
              edit(deleteTimelineItem(document, selectedItem.id));
              setSelectedItemId("");
            }}
            onDuplicate={() => {
              const id = crypto.randomUUID();
              edit(duplicateTimelineItem(document, selectedItem.id, id), id);
            }}
            onMove={(direction) =>
              edit(moveTimelineItem(document, selectedItem.id, direction))
            }
            onSplit={(sourceSeconds) => {
              const id = crypto.randomUUID();
              try {
                edit(
                  splitSourceTimelineItem(
                    document,
                    selectedItem.id,
                    sourceSeconds,
                    id,
                  ),
                  id,
                );
              } catch (reason) {
                setError(errorMessage(reason));
              }
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

function TimelineTrack({
  title,
  items,
  selectedItemId,
  totalDuration,
  onSelect,
}: {
  title: string;
  items: TimelineItem[];
  selectedItemId: string;
  totalDuration: number;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-5">
      <p className="form-label">{title}</p>
      <div className="relative mt-2 min-h-16 overflow-hidden rounded-xl border border-white/8 bg-black/30 p-2">
        {items.length === 0 ? (
          <p className="px-2 py-3 text-xs text-slate-700">No items</p>
        ) : (
          <div className="relative h-12">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`absolute top-0 h-12 min-w-16 overflow-hidden rounded-lg border px-2 text-left text-[10px] font-bold uppercase ${
                  selectedItemId === item.id
                    ? "border-[#b8ff2c]/50 bg-[#b8ff2c]/12 text-white"
                    : "border-white/10 bg-slate-900 text-slate-400"
                }`}
                style={{
                  left: `${Math.min(98, (item.timelineStartSeconds / totalDuration) * 100)}%`,
                  width: `${Math.max(4, (item.durationSeconds / totalDuration) * 100)}%`,
                }}
                onClick={() => onSelect(item.id)}
              >
                <span className="block truncate">{label(item.kind)}</span>
                <span className="mt-1 block font-normal text-slate-600">
                  {item.durationSeconds.toFixed(1)}s
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineItemEditor({
  item,
  document,
  onChange,
  onDelete,
  onDuplicate,
  onMove,
  onSplit,
}: {
  item: TimelineItem;
  document: TimelineDocument;
  onChange: (item: TimelineItem) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
  onSplit: (sourceSeconds: number) => void;
}) {
  const midpoint =
    item.sourceStartSeconds !== null && item.sourceEndSeconds !== null
      ? round((item.sourceStartSeconds + item.sourceEndSeconds) / 2)
      : 0;
  const [splitSeconds, setSplitSeconds] = useState(midpoint);
  const set = <Key extends keyof TimelineItem>(
    key: Key,
    value: TimelineItem[Key],
  ) => onChange({ ...item, [key]: value });

  return (
    <aside className="h-fit rounded-xl border border-white/8 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="section-kicker">Selected timeline item</p>
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

      <div className="mt-4 grid grid-cols-2 gap-3">
        {item.track !== "VIDEO" && (
          <NumberField
            label="Timeline start"
            value={item.timelineStartSeconds}
            min={0}
            max={180}
            step={0.1}
            onChange={(value) => set("timelineStartSeconds", value)}
          />
        )}
        {item.kind !== "SOURCE_VIDEO" && (
          <NumberField
            label="Duration"
            value={item.durationSeconds}
            min={0.1}
            max={180}
            step={0.1}
            onChange={(value) => set("durationSeconds", value)}
          />
        )}
      </div>

      {(item.kind === "CARD" ||
        item.kind === "TEXT_OVERLAY" ||
        item.kind === "CAPTION") && (
        <label className="mt-4 block">
          <span className="form-label">Text</span>
          <textarea
            className="field mt-2 min-h-20"
            value={item.text ?? ""}
            maxLength={2_000}
            onChange={(event) => set("text", event.target.value)}
          />
        </label>
      )}

      {item.kind === "SOURCE_VIDEO" && (
        <>
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
              max={15}
              step={0.1}
              onChange={(value) => set("freezeFrameSeconds", value)}
            />
          </div>
          <div className="mt-4 flex items-end gap-2">
            <NumberField
              label="Split at source second"
              value={splitSeconds}
              min={(item.sourceStartSeconds ?? 0) + 0.05}
              max={(item.sourceEndSeconds ?? 0) - 0.05}
              step={0.01}
              onChange={setSplitSeconds}
            />
            <button
              type="button"
              className="secondary-button mb-0.5"
              onClick={() => onSplit(splitSeconds)}
            >
              <Scissors size={14} /> Split
            </button>
          </div>
        </>
      )}

      {(item.kind === "SOURCE_VIDEO" || item.kind === "CARD") && (
        <div className="mt-5 border-t border-white/8 pt-4">
          <p className="form-label">Reframe and motion</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="col-span-2">
              <span className="form-label">Crop mode</span>
              <select
                className="field mt-2"
                value={item.cropMode}
                onChange={(event) =>
                  set(
                    "cropMode",
                    event.target.value as TimelineItem["cropMode"],
                  )
                }
              >
                <option value="FIT">Fit with bars</option>
                <option value="FILL">Fill frame</option>
                <option value="CENTER_CROP">Centered crop</option>
                <option value="MANUAL">Manual reframe</option>
                <option value="AUTO_SUGGESTION">
                  Centered automatic suggestion
                </option>
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
            <NumberField
              label="Pan up/down"
              value={item.panY}
              min={-1}
              max={1}
              step={0.05}
              onChange={(value) => set("panY", value)}
            />
          </div>
          <button
            type="button"
            className="secondary-button mt-3"
            onClick={() =>
              onChange({
                ...item,
                cropMode: "AUTO_SUGGESTION",
                reframeKeyframes: [
                  {
                    id: crypto.randomUUID(),
                    timeSeconds: 0,
                    panX: 0,
                    panY: 0,
                    zoom: item.zoom,
                  },
                  {
                    id: crypto.randomUUID(),
                    timeSeconds: item.durationSeconds,
                    panX: 0,
                    panY: 0,
                    zoom: item.zoom,
                  },
                ],
              })
            }
          >
            Centered reframe suggestion
          </button>
          <p className="mt-2 text-[10px] leading-4 text-slate-600">
            This suggestion does not track players. Its keyframes stay visible
            and editable.
          </p>
          {item.reframeKeyframes.map((keyframe, index) => (
            <div
              key={keyframe.id}
              className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-white/7 p-3"
            >
              <NumberField
                label={`Keyframe ${index + 1} time`}
                value={keyframe.timeSeconds}
                min={0}
                max={item.durationSeconds}
                step={0.1}
                onChange={(value) =>
                  set(
                    "reframeKeyframes",
                    item.reframeKeyframes.map((current) =>
                      current.id === keyframe.id
                        ? { ...current, timeSeconds: value }
                        : current,
                    ),
                  )
                }
              />
              <NumberField
                label="Zoom"
                value={keyframe.zoom}
                min={1}
                max={4}
                step={0.05}
                onChange={(value) =>
                  set(
                    "reframeKeyframes",
                    item.reframeKeyframes.map((current) =>
                      current.id === keyframe.id
                        ? { ...current, zoom: value }
                        : current,
                    ),
                  )
                }
              />
            </div>
          ))}
        </div>
      )}

      {(item.track === "OVERLAY" || item.track === "VIDEO") && (
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/8 pt-4">
          <NumberField
            label="Text size"
            value={item.fontScale}
            min={0.5}
            max={3}
            step={0.1}
            onChange={(value) => set("fontScale", value)}
          />
          <NumberField
            label="Text vertical position"
            value={item.positionY}
            min={0}
            max={1}
            step={0.05}
            onChange={(value) => set("positionY", value)}
          />
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
                  event.target.value as TimelineItem["transitionIn"],
                )
              }
            >
              <option value="NONE">None</option>
              <option value="FADE">Fade</option>
              <option value="DIP_TO_BLACK">Dip to black</option>
            </select>
          </label>
          <label>
            <span className="form-label">Transition out</span>
            <select
              className="field mt-2"
              value={item.transitionOut}
              onChange={(event) =>
                set(
                  "transitionOut",
                  event.target.value as TimelineItem["transitionOut"],
                )
              }
            >
              <option value="NONE">None</option>
              <option value="FADE">Fade</option>
              <option value="DIP_TO_BLACK">Dip to black</option>
            </select>
          </label>
          <NumberField
            label="Transition seconds"
            value={item.transitionDurationSeconds}
            min={0}
            max={2}
            step={0.05}
            onChange={(value) => set("transitionDurationSeconds", value)}
          />
          <NumberField
            label="Volume"
            value={item.volume}
            min={0}
            max={2}
            step={0.05}
            onChange={(value) => set("volume", value)}
          />
          <NumberField
            label="Fade in"
            value={item.fadeInSeconds}
            min={0}
            max={10}
            step={0.1}
            onChange={(value) => set("fadeInSeconds", value)}
          />
          <NumberField
            label="Fade out"
            value={item.fadeOutSeconds}
            min={0}
            max={10}
            step={0.1}
            onChange={(value) => set("fadeOutSeconds", value)}
          />
        </div>
        <label className="mt-3 flex items-start gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={item.muted}
            onChange={(event) => set("muted", event.target.checked)}
          />
          Mute this item
        </label>
        <label className="mt-2 flex items-start gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={item.duckOtherAudio}
            onChange={(event) => set("duckOtherAudio", event.target.checked)}
          />
          Duck other audio while this item plays
        </label>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/8 pt-4">
        <button
          type="button"
          className="secondary-button justify-center"
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={14} /> Earlier
        </button>
        <button
          type="button"
          className="secondary-button justify-center"
          onClick={() => onMove(1)}
        >
          <ArrowDown size={14} /> Later
        </button>
        <button
          type="button"
          className="secondary-button justify-center"
          onClick={onDuplicate}
        >
          <Copy size={14} /> Duplicate
        </button>
        <button
          type="button"
          className="secondary-button justify-center text-red-200"
          onClick={onDelete}
        >
          <Trash2 size={14} /> Delete
        </button>
      </div>
      <p className="mt-3 text-[10px] leading-4 text-slate-700">
        Item {item.id.slice(0, 8)} · track {label(item.track)} · timeline{" "}
        {item.timelineStartSeconds.toFixed(2)}–
        {(item.timelineStartSeconds + item.durationSeconds).toFixed(2)}s
      </p>
      <p className="mt-2 text-[10px] leading-4 text-slate-700">
        Current edit {document.currentDurationSeconds.toFixed(2)}s. Locked items
        remain protected from future automatic rebalancing.
      </p>
    </aside>
  );
}

function NumberField({
  label,
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
      <span className="form-label">{label}</span>
      <input
        className="field mt-2"
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
