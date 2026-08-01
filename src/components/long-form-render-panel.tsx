"use client";

import {
  Download,
  FileOutput,
  LoaderCircle,
  MonitorPlay,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { formatBytes } from "@/lib/format";
import type {
  LongFormRenderJobDto,
  LongFormTimelineState,
} from "@/lib/long-form-timeline";
import { formatDuration } from "@/lib/time";

function errorMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The long-form render action could not be completed.";
}

async function refresh(studioProjectId: string) {
  const response = await fetch(
    `/api/studio-projects/${studioProjectId}/long-form-timeline`,
  );
  const body = (await response.json()) as {
    timeline?: LongFormTimelineState;
    error?: { message?: string };
  };
  if (!response.ok || !body.timeline) {
    throw new Error(
      body.error?.message || "The render status could not be refreshed.",
    );
  }
  return body.timeline;
}

export function LongFormRenderPanel({
  studioProjectId,
  state,
  onState,
  canRender,
}: {
  studioProjectId: string;
  state: LongFormTimelineState;
  onState: (state: LongFormTimelineState) => void;
  canRender: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revisionId = state.currentRevision?.id ?? null;
  const jobs = useMemo(
    () =>
      state.renderJobs.filter((job) => job.timelineRevisionId === revisionId),
    [revisionId, state.renderJobs],
  );
  const active = state.renderJobs.find((job) =>
    ["QUEUED", "RUNNING"].includes(job.status),
  );
  const preview = jobs.find(
    (job) => job.kind === "PREVIEW" && job.status === "COMPLETED",
  );
  const output = jobs.find(
    (job) => job.kind === "EXPORT" && job.status === "COMPLETED",
  );

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      void refresh(studioProjectId)
        .then(onState)
        .catch((reason) => setError(errorMessage(reason)));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [active, onState, studioProjectId]);

  async function start(kind: "PREVIEW" | "EXPORT") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/long-form-timeline/renders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        },
      );
      const body = (await response.json()) as {
        timeline?: LongFormTimelineState;
        error?: { message?: string };
      };
      if (!response.ok || !body.timeline) {
        throw new Error(
          body.error?.message || "The long-form render could not start.",
        );
      }
      onState(body.timeline);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/long-form-timeline/renders/${active.id}/cancel`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        timeline?: LongFormTimelineState;
        error?: { message?: string };
      };
      if (!response.ok || !body.timeline) {
        throw new Error(body.error?.message || "Cancellation could not start.");
      }
      onState(body.timeline);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove(job: LongFormRenderJobDto) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/long-form-timeline/renders/${job.id}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as {
        timeline?: LongFormTimelineState;
        error?: { message?: string };
      };
      if (!response.ok || !body.timeline) {
        throw new Error(
          body.error?.message || "The saved render could not be deleted.",
        );
      }
      onState(body.timeline);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const visible = output ?? preview;
  return (
    <div className="mt-6 rounded-xl border border-cyan-300/15 bg-cyan-300/3 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold tracking-wide text-cyan-200 uppercase">
            U4.3 · Segmented local rendering
          </p>
          <h3 className="mt-1 font-semibold text-white">
            Preview first, then export 1080p
          </h3>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
            Each saved revision is rendered in bounded local segments. Preview
            is 640×360; final export is 1920×1080 H.264/AAC. Your source files
            remain unchanged.
          </p>
        </div>
        {active ? (
          <button
            type="button"
            className="secondary-button shrink-0 text-red-200"
            disabled={busy}
            onClick={() => void cancel()}
          >
            <XCircle size={14} /> Cancel render
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="secondary-button"
              disabled={!canRender || busy || !revisionId || Boolean(preview)}
              onClick={() => void start("PREVIEW")}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : (
                <MonitorPlay size={14} />
              )}
              {preview ? "Preview ready" : "Generate preview"}
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!canRender || busy || !revisionId || Boolean(output)}
              onClick={() => void start("EXPORT")}
            >
              <FileOutput size={14} />
              {output ? "1080p ready" : "Export 1080p MP4"}
            </button>
          </div>
        )}
      </div>

      {!canRender && (
        <p className="mt-3 text-xs text-amber-100/80">
          Save the current timeline revision before rendering it.
        </p>
      )}

      {active && (
        <div className="mt-4" role="status">
          <div className="mb-2 flex justify-between gap-3 text-[10px] font-bold tracking-wide text-slate-500 uppercase">
            <span>{active.stage}</span>
            <span>{active.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-cyan-300 transition-[width]"
              style={{ width: `${active.progress}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] text-slate-600">
            {active.segmentCount
              ? `${active.segmentCount} bounded segments`
              : "Preparing deterministic render manifest"}
          </p>
        </div>
      )}

      {visible && (
        <div className="mt-4 overflow-hidden rounded-xl border border-white/8 bg-black">
          <video
            className="max-h-[40rem] w-full bg-black object-contain"
            controls
            preload="metadata"
            src={`/api/media/long-form-renders/${visible.id}`}
          >
            Your browser does not support MP4 playback.
          </video>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/8 px-4 py-3 text-[10px] text-slate-500">
            <span>
              {visible.kind === "PREVIEW" ? "Preview" : "Final export"}
            </span>
            <span>
              {visible.width}×{visible.height}
            </span>
            <span>{formatDuration(visible.durationSeconds ?? 0)}</span>
            <span>
              {visible.fileSizeBytes
                ? formatBytes(visible.fileSizeBytes)
                : "Size unavailable"}
            </span>
            <span>H.264 + AAC</span>
            <a
              className="secondary-button ml-auto no-underline"
              href={`/api/media/long-form-renders/${visible.id}?download=1`}
            >
              <Download size={13} /> Download MP4
            </a>
          </div>
        </div>
      )}

      {jobs.some((job) => job.status === "ERROR") && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-400/15 bg-red-500/5 p-3 text-xs leading-5 text-red-200"
        >
          <p>
            {jobs.find((job) => job.status === "ERROR")?.errorMessage ||
              "A render failed. Source files were not changed."}
          </p>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1 font-bold text-white"
            onClick={() =>
              void refresh(studioProjectId)
                .then(onState)
                .catch((reason) => setError(errorMessage(reason)))
            }
          >
            <RefreshCw size={12} /> Refresh status
          </button>
        </div>
      )}

      {state.renderJobs.length > 0 && (
        <details className="mt-4 rounded-lg border border-white/8 bg-black/15 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-300">
            Render history · {state.renderJobs.length}
          </summary>
          <div className="mt-3 space-y-2">
            {state.renderJobs.map((job) => {
              const revision = state.revisions.find(
                (item) => item.id === job.timelineRevisionId,
              );
              return (
                <div
                  key={job.id}
                  className="flex flex-col gap-2 rounded-lg border border-white/7 p-3 text-[10px] text-slate-500 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-300">
                      {job.outputFilename}
                    </p>
                    <p className="mt-1">
                      Timeline {revision ? `v${revision.version}` : "history"} ·{" "}
                      {job.kind.toLowerCase()} ·{" "}
                      {job.status.toLowerCase().replaceAll("_", " ")} ·{" "}
                      {job.segmentCount ?? "pending"} segments
                    </p>
                  </div>
                  {!["QUEUED", "RUNNING"].includes(job.status) && (
                    <div className="flex flex-wrap gap-2">
                      {job.status === "COMPLETED" && job.relativePath && (
                        <a
                          className="secondary-button no-underline"
                          href={`/api/media/long-form-renders/${job.id}?download=1`}
                        >
                          <Download size={12} /> Download
                        </a>
                      )}
                      <button
                        type="button"
                        className="secondary-button text-red-200"
                        disabled={busy}
                        onClick={() => void remove(job)}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      {error && (
        <p role="alert" className="mt-3 text-xs leading-5 text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
