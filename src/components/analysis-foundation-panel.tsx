"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AnalysisJobDto,
  DetectorFrameworkStateDto,
} from "@/lib/detector-framework";

const ACTIVE = new Set(["QUEUED", "RUNNING"]);

export function AnalysisFoundationPanel({
  projectId,
  initialState,
}: {
  projectId: string;
  initialState: DetectorFrameworkStateDto;
}) {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasActiveJob = state.jobs.some((job) => ACTIVE.has(job.status));

  const reload = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/analysis`, {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as {
      analysis?: DetectorFrameworkStateDto;
      error?: { message?: string };
    } | null;
    if (!response.ok || !body?.analysis) {
      throw new Error(
        body?.error?.message ?? "Analysis status is unavailable.",
      );
    }
    setState(body.analysis);
  }, [projectId]);

  useEffect(() => {
    if (!hasActiveJob) return;
    const timer = window.setInterval(() => {
      void reload().catch((caught) => setError(errorMessage(caught)));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [hasActiveJob, reload]);

  const enabledCount = useMemo(
    () => state.detectors.filter((detector) => detector.enabled).length,
    [state.detectors],
  );

  async function startFrameworkCheck() {
    setBusy("start");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/analysis`, {
        method: "POST",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readError(body));
      setMessage("Local framework check started.");
      await reload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function toggleDetector(definitionId: string, enabled: boolean) {
    setBusy(`detector-${definitionId}`);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/detectors/${definitionId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled, parameters: {} }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        analysis?: DetectorFrameworkStateDto;
      } | null;
      if (!response.ok || !body?.analysis) throw new Error(readError(body));
      setState(body.analysis);
      setMessage(enabled ? "Framework check enabled." : "Detector disabled.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function jobAction(
    job: AnalysisJobDto,
    action: "cancel" | "retry" | "delete",
  ) {
    setBusy(`${action}-${job.id}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/analysis-jobs/${job.id}${action === "delete" ? "" : `/${action}`}`,
        { method: action === "delete" ? "DELETE" : "POST" },
      );
      if (!response.ok) {
        throw new Error(readError(await response.json().catch(() => null)));
      }
      setMessage(
        action === "cancel"
          ? "Cancellation requested."
          : action === "retry"
            ? "A new version-pinned framework job was queued."
            : "Analysis job and its local artifacts were deleted.",
      );
      await reload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel mt-8 p-5 sm:p-6" aria-labelledby="analysis-title">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="section-kicker">Phase 3B.1 · Detector framework</p>
          <h2
            id="analysis-title"
            className="font-display mt-1 text-3xl font-extrabold tracking-tight text-white uppercase"
          >
            Analysis jobs, without false claims
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            {state.message} The check below validates versioning, progress,
            retry, deletion, failure isolation, restart recovery, and cleanup.
          </p>
        </div>
        <button
          type="button"
          className="primary-button shrink-0"
          disabled={busy !== null || hasActiveJob || enabledCount === 0}
          onClick={() => void startFrameworkCheck()}
        >
          <FlaskConical size={16} />
          {hasActiveJob ? "Framework check running" : "Run framework check"}
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-amber-300/15 bg-amber-400/6 p-4 text-sm leading-6 text-amber-100">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0" size={17} />
          <p>
            This stage does not detect kills, deaths, reactions, or candidate
            moments. Scene, audio, and transcript detectors begin in Phase 3B.2,
            after this labeling foundation is verified.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {state.detectors.map((detector) => (
          <label
            key={detector.id}
            className="flex flex-col gap-3 rounded-xl border border-white/8 bg-black/20 p-4 sm:flex-row sm:items-center"
          >
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-[#b8ff2c]"
              checked={detector.enabled}
              disabled={busy === `detector-${detector.id}` || hasActiveJob}
              onChange={(event) =>
                void toggleDetector(detector.id, event.target.checked)
              }
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-white">
                {detector.name}
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                {detector.description}
              </span>
            </span>
            <span className="flex flex-wrap gap-2 text-[10px] font-bold tracking-wide uppercase">
              <span className="rounded-full border border-white/8 px-2.5 py-1 text-slate-500">
                {detector.stableId}@{detector.version}
              </span>
              <span className="rounded-full border border-white/8 px-2.5 py-1 text-slate-500">
                {detector.estimatedCost} cost
              </span>
              <span className="rounded-full border border-sky-300/15 bg-sky-400/6 px-2.5 py-1 text-sky-200">
                Framework only
              </span>
            </span>
          </label>
        ))}
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

      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-white uppercase">
            Recent framework jobs
          </h3>
          <button
            type="button"
            className="icon-button"
            aria-label="Refresh analysis jobs"
            onClick={() =>
              void reload().catch((caught) => setError(errorMessage(caught)))
            }
          >
            <RefreshCw size={15} />
          </button>
        </div>
        {state.jobs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-500">
            No framework jobs yet. Manual benchmark labeling works
            independently.
          </p>
        ) : (
          state.jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              busy={busy}
              onAction={(action) => void jobAction(job, action)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function JobCard({
  job,
  busy,
  onAction,
}: {
  job: AnalysisJobDto;
  busy: string | null;
  onAction: (action: "cancel" | "retry" | "delete") => void;
}) {
  const active = ACTIVE.has(job.status);
  return (
    <article className="rounded-xl border border-white/8 bg-black/20 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {job.status === "COMPLETED" ? (
              <CheckCircle2 className="text-[#b8ff2c]" size={17} />
            ) : job.status === "ERROR" ? (
              <AlertTriangle className="text-red-300" size={17} />
            ) : (
              <RefreshCw className="text-sky-300" size={17} />
            )}
            <span className="text-sm font-bold text-white">{job.stage}</span>
            <span className="rounded-full border border-white/8 px-2 py-0.5 text-[10px] font-bold tracking-wide text-slate-500 uppercase">
              {job.status}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/6">
            <div
              className="h-full rounded-full bg-[#b8ff2c] transition-[width]"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {job.progress}% · {job.completedDetectorCount} completed ·{" "}
            {job.failedDetectorCount} failed · {job.detectorSetVersion}
          </p>
          {job.runs.map((run) => (
            <div
              key={run.id}
              className="mt-3 rounded-lg border border-white/6 bg-white/3 px-3 py-2 text-xs text-slate-400"
            >
              <span className="font-semibold text-slate-200">{run.name}</span> ·{" "}
              {run.detectorStableId}@{run.detectorVersion} · {run.status}
              {run.errorMessage ? ` · ${run.errorMessage}` : ""}
            </div>
          ))}
          {job.warnings.map((warning) => (
            <p key={warning} className="mt-2 text-xs text-amber-200/80">
              {warning}
            </p>
          ))}
        </div>
        <div className="flex shrink-0 gap-2">
          {active ? (
            <button
              type="button"
              className="secondary-button"
              disabled={busy === `cancel-${job.id}`}
              onClick={() => onAction("cancel")}
            >
              <Square size={14} /> Cancel
            </button>
          ) : (
            <button
              type="button"
              className="secondary-button"
              disabled={busy === `retry-${job.id}`}
              onClick={() => onAction("retry")}
            >
              <RefreshCw size={14} /> Retry
            </button>
          )}
          {!active && (
            <button
              type="button"
              className="icon-button text-red-300"
              aria-label="Delete analysis job"
              disabled={busy === `delete-${job.id}`}
              onClick={() => onAction("delete")}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
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
  return "The local analysis action could not be completed.";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}
