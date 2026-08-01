"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Film,
  LoaderCircle,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { formatBytes } from "@/lib/format";
import type { ShortFormTimelineState } from "@/lib/short-form-timeline";

function errorMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The preview action could not be completed.";
}

export function ShortFormProxyPanel({
  studioProjectId,
  state,
  onState,
  canRender,
}: {
  studioProjectId: string;
  state: ShortFormTimelineState;
  onState: (state: ShortFormTimelineState) => void;
  canRender: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentRevisionId = state.currentRevision?.id ?? null;
  const currentRevisionJobs = useMemo(
    () =>
      state.proxyJobs.filter(
        (job) => job.timelineRevisionId === currentRevisionId,
      ),
    [currentRevisionId, state.proxyJobs],
  );
  const currentJob = currentRevisionJobs[0] ?? null;
  const completedJob =
    currentRevisionJobs.find((job) => job.status === "COMPLETED") ?? null;
  const activeJob = state.proxyJobs.find((job) =>
    ["QUEUED", "RUNNING"].includes(job.status),
  );

  useEffect(() => {
    if (!activeJob) return;
    const timer = window.setInterval(() => {
      void refreshTimeline(studioProjectId)
        .then(onState)
        .catch((reason) => setError(errorMessage(reason)));
    }, 900);
    return () => window.clearInterval(timer);
  }, [activeJob, onState, studioProjectId]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/timeline/proxy`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        timeline?: ShortFormTimelineState;
        error?: { message?: string };
      };
      if (!response.ok || !body.timeline) {
        throw new Error(
          body.error?.message || "The preview job could not start.",
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
    if (!activeJob) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/timeline/proxy/${activeJob.id}/cancel`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        timeline?: ShortFormTimelineState;
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

  return (
    <div className="mt-5 rounded-xl border border-white/8 bg-black/15 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-wide text-slate-300 uppercase">
            Low-resolution preview proxy
          </p>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600">
            Render only when you ask. The proxy uses the latest saved timeline,
            keeps editing responsive, and is not the full-resolution export.
          </p>
        </div>
        {activeJob ? (
          <button
            type="button"
            className="secondary-button shrink-0 text-red-200"
            disabled={busy}
            onClick={() => void cancel()}
          >
            <XCircle size={14} /> Cancel preview
          </button>
        ) : (
          <button
            type="button"
            className="primary-button shrink-0"
            disabled={!canRender || busy}
            onClick={() => void start()}
          >
            {busy ? (
              <LoaderCircle className="animate-spin" size={14} />
            ) : (
              <Play size={14} />
            )}
            {completedJob ? "Preview saved revision" : "Render preview"}
          </button>
        )}
      </div>

      {!canRender && (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-100/80">
          <AlertTriangle className="mt-0.5 shrink-0" size={14} />
          Wait for timeline autosave before rendering.
        </p>
      )}

      {activeJob && (
        <div className="mt-4" role="status">
          <div className="mb-2 flex justify-between text-[10px] font-bold tracking-wide text-slate-500 uppercase">
            <span>{activeJob.stage}</span>
            <span>{activeJob.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-[#b8ff2c] transition-[width]"
              style={{ width: `${activeJob.progress}%` }}
            />
          </div>
        </div>
      )}

      {completedJob && (
        <div className="mt-4 overflow-hidden rounded-xl border border-white/8 bg-black">
          <video
            className="max-h-[42rem] w-full bg-black object-contain"
            controls
            preload="metadata"
            src={`/api/media/short-form-proxies/${completedJob.id}`}
          >
            Your browser does not support MP4 preview playback.
          </video>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/8 px-4 py-3 text-[10px] text-slate-600">
            <span>
              {completedJob.width}×{completedJob.height}
            </span>
            <span>{completedJob.durationSeconds?.toFixed(1)}s</span>
            <span>
              {completedJob.fileSizeBytes
                ? formatBytes(completedJob.fileSizeBytes)
                : "Size unavailable"}
            </span>
            <span>{completedJob.pipelineVersion}</span>
          </div>
        </div>
      )}

      {currentJob?.status === "ERROR" && (
        <div
          role="alert"
          className="mt-4 flex gap-3 rounded-lg border border-red-400/15 bg-red-500/5 p-3 text-xs leading-5 text-red-200"
        >
          <Film className="mt-0.5 shrink-0" size={15} />
          <div>
            <p>{currentJob.errorMessage || "The preview could not render."}</p>
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-white"
              onClick={() =>
                void refreshTimeline(studioProjectId)
                  .then(onState)
                  .catch((reason) => setError(errorMessage(reason)))
              }
            >
              <RefreshCw size={12} /> Refresh status
            </button>
          </div>
        </div>
      )}

      {currentJob?.status === "CANCELLED" && (
        <p className="mt-4 text-xs text-slate-500">
          Preview cancelled. No partial MP4 was kept.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs leading-5 text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}

async function refreshTimeline(studioProjectId: string) {
  const response = await fetch(
    `/api/studio-projects/${studioProjectId}/timeline`,
  );
  const body = (await response.json()) as {
    timeline?: ShortFormTimelineState;
    error?: { message?: string };
  };
  if (!response.ok || !body.timeline) {
    throw new Error(
      body.error?.message || "The preview status could not be refreshed.",
    );
  }
  return body.timeline;
}
