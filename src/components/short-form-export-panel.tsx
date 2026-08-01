"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileOutput,
  LoaderCircle,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";

import { formatBytes } from "@/lib/format";
import type {
  ShortFormExportJobDto,
  ShortFormTimelineState,
} from "@/lib/short-form-timeline";

function errorMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The export action could not be completed.";
}

export function ShortFormExportPanel({
  studioProjectId,
  state,
  onState,
  canExport,
}: {
  studioProjectId: string;
  state: ShortFormTimelineState;
  onState: (state: ShortFormTimelineState) => void;
  canExport: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentRevisionId = state.currentRevision?.id ?? null;
  const currentRevisionExports = useMemo(
    () =>
      state.exportJobs.filter(
        (job) => job.timelineRevisionId === currentRevisionId,
      ),
    [currentRevisionId, state.exportJobs],
  );
  const currentJob = currentRevisionExports[0] ?? null;
  const completedJob =
    currentRevisionExports.find((job) => job.status === "COMPLETED") ?? null;
  const activeExport = state.exportJobs.find((job) =>
    ["QUEUED", "RUNNING"].includes(job.status),
  );
  const activeProxy = state.proxyJobs.find((job) =>
    ["QUEUED", "RUNNING"].includes(job.status),
  );
  const anotherRenderIsActive = Boolean(activeExport || activeProxy);

  useEffect(() => {
    if (!activeExport) return;
    const timer = window.setInterval(() => {
      void refreshTimeline(studioProjectId)
        .then(onState)
        .catch((reason) => setError(errorMessage(reason)));
    }, 900);
    return () => window.clearInterval(timer);
  }, [activeExport, onState, studioProjectId]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/timeline/exports`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        timeline?: ShortFormTimelineState;
        error?: { message?: string };
      };
      if (!response.ok || !body.timeline) {
        throw new Error(
          body.error?.message || "The full-resolution export could not start.",
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
    if (!activeExport) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/timeline/exports/${activeExport.id}/cancel`,
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

  async function remove(job: ShortFormExportJobDto) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/timeline/exports/${job.id}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as {
        timeline?: ShortFormTimelineState;
        error?: { message?: string };
      };
      if (!response.ok || !body.timeline) {
        throw new Error(
          body.error?.message || "The saved export could not be deleted.",
        );
      }
      onState(body.timeline);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-[#b8ff2c]/15 bg-[#b8ff2c]/3 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-wide text-[#b8ff2c] uppercase">
            Full-resolution MP4 export
          </p>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">
            Export only when the saved edit is ready. This deterministic H.264
            and AAC file is separate from the low-resolution preview and stays
            on this Mac.
          </p>
        </div>
        {activeExport ? (
          <button
            type="button"
            className="secondary-button shrink-0 text-red-200"
            disabled={busy}
            onClick={() => void cancel()}
          >
            <XCircle size={14} /> Cancel export
          </button>
        ) : (
          <button
            type="button"
            className="primary-button shrink-0"
            disabled={
              !canExport ||
              busy ||
              anotherRenderIsActive ||
              !currentRevisionId ||
              Boolean(completedJob)
            }
            onClick={() => void start()}
          >
            {busy ? (
              <LoaderCircle className="animate-spin" size={14} />
            ) : (
              <FileOutput size={14} />
            )}
            {completedJob ? "Export ready" : "Export saved revision"}
          </button>
        )}
      </div>

      {!canExport && (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-100/80">
          <AlertTriangle className="mt-0.5 shrink-0" size={14} />
          Wait for timeline autosave before exporting.
        </p>
      )}
      {activeProxy && !activeExport && (
        <p className="mt-3 flex items-start gap-2 text-xs text-amber-100/80">
          <AlertTriangle className="mt-0.5 shrink-0" size={14} />
          Wait for the preview to finish, or cancel it before exporting.
        </p>
      )}

      {activeExport && (
        <div className="mt-4" role="status">
          <div className="mb-2 flex justify-between text-[10px] font-bold tracking-wide text-slate-500 uppercase">
            <span>{activeExport.stage}</span>
            <span>{activeExport.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-[#b8ff2c] transition-[width]"
              style={{ width: `${activeExport.progress}%` }}
            />
          </div>
        </div>
      )}

      {completedJob && (
        <div className="mt-4 overflow-hidden rounded-xl border border-white/8 bg-black">
          <video
            className="max-h-[48rem] w-full bg-black object-contain"
            controls
            preload="metadata"
            src={`/api/media/short-form-exports/${completedJob.id}`}
          >
            Your browser does not support MP4 playback.
          </video>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/8 px-4 py-3 text-[10px] text-slate-500">
            <span>
              {completedJob.width}×{completedJob.height}
            </span>
            <span>{completedJob.durationSeconds?.toFixed(1)}s</span>
            <span>
              {completedJob.fileSizeBytes
                ? formatBytes(completedJob.fileSizeBytes)
                : "Size unavailable"}
            </span>
            <span>H.264 + AAC</span>
            <a
              className="secondary-button ml-auto no-underline"
              href={`/api/media/short-form-exports/${completedJob.id}?download=1`}
            >
              <Download size={13} /> Download MP4
            </a>
          </div>
        </div>
      )}

      {currentJob?.status === "ERROR" && (
        <div
          role="alert"
          className="mt-4 flex gap-3 rounded-lg border border-red-400/15 bg-red-500/5 p-3 text-xs leading-5 text-red-200"
        >
          <FileOutput className="mt-0.5 shrink-0" size={15} />
          <div>
            <p>{currentJob.errorMessage || "The export could not render."}</p>
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
          Export cancelled. No partial MP4 was kept.
        </p>
      )}

      {state.exportJobs.length > 0 && (
        <details className="mt-4 rounded-lg border border-white/8 bg-black/15 p-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-300">
            Export history · {state.exportJobs.length}
          </summary>
          <div className="mt-3 space-y-2">
            {state.exportJobs.map((job) => {
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
                      Edit{" "}
                      {revision ? `version ${revision.version}` : "history"} ·{" "}
                      {job.status.toLowerCase().replaceAll("_", " ")} ·{" "}
                      {job.pipelineVersion}
                    </p>
                  </div>
                  {!["QUEUED", "RUNNING"].includes(job.status) && (
                    <div className="flex flex-wrap gap-2">
                      {job.status === "COMPLETED" && job.relativePath && (
                        <a
                          className="secondary-button no-underline"
                          href={`/api/media/short-form-exports/${job.id}?download=1`}
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
      body.error?.message || "The export status could not be refreshed.",
    );
  }
  return body.timeline;
}
