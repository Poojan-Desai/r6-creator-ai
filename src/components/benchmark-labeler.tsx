"use client";

import { Download, Flag, Play, Save, Trash2, Upload } from "lucide-react";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  GroundTruthLabelDto,
  GroundTruthStateDto,
} from "@/lib/ground-truth";
import { formatDuration } from "@/lib/time";

type Draft = {
  category: string;
  startSeconds: number;
  peakSeconds: number;
  endSeconds: number;
  description: string;
  humanConfidence: number;
  approved: boolean;
};

const NUDGE_SECONDS = 0.25;

export function BenchmarkLabeler({
  projectId,
  projectName,
  durationSeconds,
  initialState,
}: {
  projectId: string;
  projectName: string;
  durationSeconds: number;
  initialState: GroundTruthStateDto;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const replayEndRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState(initialState);
  const [currentTime, setCurrentTime] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    category: "HIGH_ACTION_GAMEPLAY",
    startSeconds: 0,
    peakSeconds: 0,
    endSeconds: Math.min(5, durationSeconds),
    description: "",
    humanConfidence: 0.8,
    approved: false,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importDocument, setImportDocument] = useState<unknown>(null);
  const [importFilename, setImportFilename] = useState<string | null>(null);

  const setMark = useCallback(
    (field: "startSeconds" | "peakSeconds" | "endSeconds") => {
      const value = roundTime(videoRef.current?.currentTime ?? currentTime);
      setDraft((current) => ({ ...current, [field]: value }));
      setMessage(
        `${field === "startSeconds" ? "Start" : field === "peakSeconds" ? "Peak" : "End"} marked at ${formatDuration(value)}.`,
      );
      setError(null);
    },
    [currentTime],
  );

  const playRange = useCallback((startSeconds: number, endSeconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    replayEndRef.current = endSeconds;
    video.currentTime = startSeconds;
    void video.play();
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches("input, textarea, select, button") ||
        target?.isContentEditable ||
        !event.shiftKey
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "s") setMark("startSeconds");
      else if (key === "p") setMark("peakSeconds");
      else if (key === "e") setMark("endSeconds");
      else if (key === "r") playRange(draft.startSeconds, draft.endSeconds);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [draft.endSeconds, draft.startSeconds, playRange, setMark]);

  async function createLabel() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/ground-truth-labels`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...draft,
            description: draft.description.trim() || null,
          }),
        },
      );
      const body = await readJson(response);
      if (!response.ok) throw new Error(readError(body));
      const label = (body as { label: GroundTruthLabelDto }).label;
      setState((current) => ({
        ...current,
        labels: [...current.labels, label].sort(
          (left, right) => left.startSeconds - right.startSeconds,
        ),
      }));
      setDraft((current) => ({
        ...current,
        startSeconds: current.endSeconds,
        peakSeconds: current.endSeconds,
        endSeconds: Math.min(durationSeconds, current.endSeconds + 5),
        description: "",
        approved: false,
      }));
      setMessage("Benchmark label saved locally.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function patchLabel(labelId: string, patch: Record<string, unknown>) {
    setError(null);
    const response = await fetch(`/api/ground-truth-labels/${labelId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await readJson(response);
    if (!response.ok) throw new Error(readError(body));
    const label = (body as { label: GroundTruthLabelDto }).label;
    setState((current) => ({
      ...current,
      labels: current.labels
        .map((item) => (item.id === label.id ? label : item))
        .sort((left, right) => left.startSeconds - right.startSeconds),
    }));
    setMessage("Label update saved.");
  }

  async function removeLabel(labelId: string) {
    setError(null);
    const response = await fetch(`/api/ground-truth-labels/${labelId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const body = await readJson(response);
      throw new Error(readError(body));
    }
    setState((current) => ({
      ...current,
      labels: current.labels.filter((label) => label.id !== labelId),
    }));
    setMessage("Label deleted.");
  }

  async function chooseImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      setImportDocument(parsed);
      setImportFilename(file.name);
      setMessage(
        "Benchmark JSON is ready to validate. Importing replaces this project's current labels.",
      );
    } catch {
      setImportDocument(null);
      setImportFilename(null);
      setError("That file is not readable JSON.");
    }
  }

  async function importLabels() {
    if (!importDocument) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/ground-truth-labels/import`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(importDocument),
        },
      );
      const body = await readJson(response);
      if (!response.ok) throw new Error(readError(body));
      setState((body as { groundTruth: GroundTruthStateDto }).groundTruth);
      setImportDocument(null);
      setImportFilename(null);
      if (importInputRef.current) importInputRef.current.value = "";
      setMessage("Versioned labels imported and saved locally.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const approvedCount = state.labels.filter((label) => label.approved).length;

  return (
    <section className="mt-8" aria-labelledby="benchmark-labeler-title">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-kicker">Phase 3B.1 · Human ground truth</p>
          <h2
            id="benchmark-labeler-title"
            className="font-display mt-1 text-3xl font-extrabold tracking-tight text-white uppercase"
          >
            Label what actually happened
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            These labels are the evidence used to judge future detectors. Draft
            labels are excluded from verified metrics until you approve them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
            {state.labels.length} labels
          </span>
          <span className="rounded-full border border-[#b8ff2c]/20 bg-[#b8ff2c]/8 px-3 py-2 text-[#d8ff8a]">
            {approvedCount} approved
          </span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
        <div className="panel overflow-hidden">
          <div className="border-b border-white/8 px-5 py-4 sm:px-6">
            <p className="section-kicker">Range player</p>
            <p className="mt-1 text-sm text-slate-400">
              {projectName} · {formatDuration(currentTime)} /{" "}
              {formatDuration(durationSeconds)}
            </p>
          </div>
          <video
            ref={videoRef}
            controls
            preload="metadata"
            className="aspect-video w-full bg-black"
            src={`/api/media/projects/${projectId}/source`}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              setCurrentTime(video.currentTime);
              if (
                replayEndRef.current !== null &&
                video.currentTime >= replayEndRef.current
              ) {
                video.pause();
                replayEndRef.current = null;
              }
            }}
            onPause={() => {
              if (
                replayEndRef.current !== null &&
                (videoRef.current?.currentTime ?? 0) < replayEndRef.current
              ) {
                replayEndRef.current = null;
              }
            }}
          >
            Your browser could not play this local MP4.
          </video>
          <div className="grid gap-3 border-t border-white/8 p-4 sm:grid-cols-4 sm:p-5">
            <MarkButton
              label="Start label"
              shortcut="Shift S"
              value={draft.startSeconds}
              onClick={() => setMark("startSeconds")}
            />
            <MarkButton
              label="Mark peak"
              shortcut="Shift P"
              value={draft.peakSeconds}
              onClick={() => setMark("peakSeconds")}
            />
            <MarkButton
              label="End label"
              shortcut="Shift E"
              value={draft.endSeconds}
              onClick={() => setMark("endSeconds")}
            />
            <button
              type="button"
              className="secondary-button justify-center"
              onClick={() => playRange(draft.startSeconds, draft.endSeconds)}
            >
              <Play size={15} /> Replay range
              <kbd className="ml-auto text-[10px] text-slate-500">Shift R</kbd>
            </button>
          </div>
        </div>

        <div className="panel p-5 sm:p-6">
          <p className="section-kicker">New manual label</p>
          <div className="mt-5 space-y-4">
            <label className="block text-xs font-bold tracking-wide text-slate-400 uppercase">
              Category
              <select
                className="input mt-2"
                value={draft.category}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
              >
                {state.categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-3 gap-2">
              <TimeInput
                label="Start"
                value={draft.startSeconds}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, startSeconds: value }))
                }
              />
              <TimeInput
                label="Peak"
                value={draft.peakSeconds}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, peakSeconds: value }))
                }
              />
              <TimeInput
                label="End"
                value={draft.endSeconds}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, endSeconds: value }))
                }
              />
            </div>

            <label className="block text-xs font-bold tracking-wide text-slate-400 uppercase">
              Optional description
              <textarea
                className="input mt-2 min-h-20 resize-y"
                maxLength={2000}
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="What makes this range useful as ground truth?"
              />
            </label>

            <label className="block text-xs font-bold tracking-wide text-slate-400 uppercase">
              Human confidence · {Math.round(draft.humanConfidence * 100)}%
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                className="mt-3 w-full accent-[#b8ff2c]"
                value={draft.humanConfidence}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    humanConfidence: Number(event.target.value),
                  }))
                }
              />
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3 text-sm text-slate-300">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[#b8ff2c]"
                checked={draft.approved}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    approved: event.target.checked,
                  }))
                }
              />
              Approved as benchmark ground truth
            </label>

            <button
              type="button"
              className="primary-button w-full justify-center"
              disabled={busy}
              onClick={() => void createLabel()}
            >
              <Save size={16} /> {busy ? "Saving…" : "Save manual label"}
            </button>
          </div>
        </div>
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

      <div className="panel mt-6 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="section-kicker">Versioned interchange</p>
            <h3 className="font-display mt-1 text-xl font-bold text-white uppercase">
              Export or restore labels
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Export computes a local SHA-256 video fingerprint. The JSON never
              contains your filename or computer path. Import rejects a
              different video and replaces this project&apos;s labels
              atomically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className="secondary-button"
              href={`/api/projects/${projectId}/ground-truth-labels/export`}
              download
            >
              <Download size={15} /> Export JSON
            </a>
            <label className="secondary-button cursor-pointer">
              <Upload size={15} /> Choose JSON
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => void chooseImport(event)}
              />
            </label>
            {importDocument !== null && (
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={() => void importLabels()}
              >
                Import and replace
              </button>
            )}
          </div>
        </div>
        {importFilename && (
          <p className="mt-3 text-xs text-slate-400">
            Ready to validate: {importFilename}
          </p>
        )}
        <p className="mt-4 text-xs text-slate-600">
          {state.schemaVersion} · timestamps in {state.timestampUnits}
        </p>
      </div>

      <div className="mt-6 space-y-3">
        {state.labels.length === 0 ? (
          <div className="panel p-8 text-center">
            <Flag className="mx-auto text-slate-600" size={25} />
            <p className="mt-3 font-semibold text-slate-300">
              No manual labels yet
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Play the recording, mark start/peak/end, then save the first
              evidence range.
            </p>
          </div>
        ) : (
          state.labels.map((label) => (
            <SavedLabel
              key={label.id}
              label={label}
              categories={state.categories}
              durationSeconds={durationSeconds}
              onReplay={playRange}
              onPatch={async (patch) => {
                try {
                  await patchLabel(label.id, patch);
                } catch (caught) {
                  setError(errorMessage(caught));
                }
              }}
              onDelete={async () => {
                try {
                  await removeLabel(label.id);
                } catch (caught) {
                  setError(errorMessage(caught));
                }
              }}
            />
          ))
        )}
      </div>
    </section>
  );
}

function MarkButton({
  label,
  shortcut,
  value,
  onClick,
}: {
  label: string;
  shortcut: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-xl border border-white/10 bg-white/4 p-3 text-left transition hover:border-[#b8ff2c]/30 hover:bg-[#b8ff2c]/6 focus-visible:outline-2 focus-visible:outline-[#b8ff2c]"
      onClick={onClick}
    >
      <span className="block text-xs font-bold text-slate-200">{label}</span>
      <span className="mt-1 block text-sm text-[#b8ff2c]">
        {formatDuration(value)}
      </span>
      <kbd className="mt-2 block text-[10px] text-slate-600">{shortcut}</kbd>
    </button>
  );
}

function TimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
      {label}
      <input
        type="number"
        min="0"
        step="0.05"
        className="input mt-1 px-2 text-sm"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SavedLabel({
  label,
  categories,
  durationSeconds,
  onReplay,
  onPatch,
  onDelete,
}: {
  label: GroundTruthLabelDto;
  categories: GroundTruthStateDto["categories"];
  durationSeconds: number;
  onReplay: (startSeconds: number, endSeconds: number) => void;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [description, setDescription] = useState(label.description ?? "");
  const [busy, setBusy] = useState(false);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const nudge = (boundary: "startSeconds" | "endSeconds", amount: number) => {
    const next =
      boundary === "startSeconds"
        ? Math.max(0, Math.min(label.peakSeconds, label.startSeconds + amount))
        : Math.min(
            durationSeconds,
            Math.max(label.peakSeconds, label.endSeconds + amount),
          );
    return perform(() => onPatch({ [boundary]: roundTime(next) }));
  };

  return (
    <article className="panel p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(18rem,1.2fr)_auto] lg:items-center">
        <div>
          <select
            aria-label="Label category"
            className="input text-sm"
            disabled={busy}
            value={label.category}
            onChange={(event) =>
              void perform(() => onPatch({ category: event.target.value }))
            }
          >
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              className="size-4 accent-[#b8ff2c]"
              checked={label.approved}
              disabled={busy}
              onChange={(event) =>
                void perform(() => onPatch({ approved: event.target.checked }))
              }
            />
            Approved ground truth
          </label>
          <p className="mt-2 text-[11px] text-slate-600">
            Human confidence {Math.round(label.humanConfidence * 100)}%
          </p>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg border border-white/8 bg-black/20 px-2.5 py-1.5 text-slate-300">
              {formatDuration(label.startSeconds)}
            </span>
            <span className="text-slate-600">→ peak</span>
            <span className="rounded-lg border border-[#b8ff2c]/20 bg-[#b8ff2c]/6 px-2.5 py-1.5 text-[#d8ff8a]">
              {formatDuration(label.peakSeconds)}
            </span>
            <span className="text-slate-600">→</span>
            <span className="rounded-lg border border-white/8 bg-black/20 px-2.5 py-1.5 text-slate-300">
              {formatDuration(label.endSeconds)}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <NudgeButton
              label="Start −0.25"
              disabled={busy}
              onClick={() => void nudge("startSeconds", -NUDGE_SECONDS)}
            />
            <NudgeButton
              label="Start +0.25"
              disabled={busy}
              onClick={() => void nudge("startSeconds", NUDGE_SECONDS)}
            />
            <NudgeButton
              label="End −0.25"
              disabled={busy}
              onClick={() => void nudge("endSeconds", -NUDGE_SECONDS)}
            />
            <NudgeButton
              label="End +0.25"
              disabled={busy}
              onClick={() => void nudge("endSeconds", NUDGE_SECONDS)}
            />
          </div>
          <div className="mt-3 flex gap-2">
            <input
              aria-label="Label description"
              className="input min-w-0 flex-1 text-sm"
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional description"
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Save label description"
              disabled={busy}
              onClick={() =>
                void perform(() =>
                  onPatch({ description: description.trim() || null }),
                )
              }
            >
              <Save size={15} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 lg:justify-end">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => onReplay(label.startSeconds, label.endSeconds)}
          >
            <Play size={15} /> Replay
          </button>
          <button
            type="button"
            className="icon-button text-red-300"
            aria-label="Delete label"
            disabled={busy}
            onClick={() => void perform(onDelete)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

function NudgeButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-lg border border-white/8 bg-white/4 px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-white disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

async function readJson(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  return response.json().catch(() => null) as Promise<unknown>;
}

function readError(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    value.error &&
    typeof value.error === "object" &&
    "message" in value.error &&
    typeof value.error.message === "string"
  ) {
    return value.error.message;
  }
  return "The benchmark label could not be saved.";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000;
}
