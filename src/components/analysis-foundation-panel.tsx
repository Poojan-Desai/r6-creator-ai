"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  RefreshCw,
  Save,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AnalysisJobDto,
  DetectorFrameworkStateDto,
} from "@/lib/detector-framework";
import type { AudioTrackDto } from "@/lib/transcription";
import { formatBytes } from "@/lib/format";

const ACTIVE = new Set(["QUEUED", "RUNNING"]);

export function AnalysisFoundationPanel({
  projectId,
  initialState,
  initialAudioTracks,
}: {
  projectId: string;
  initialState: DetectorFrameworkStateDto;
  initialAudioTracks: AudioTrackDto[];
}) {
  const [state, setState] = useState(initialState);
  const [audioTracks, setAudioTracks] = useState(initialAudioTracks);
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
      setMessage("Local signal analysis started.");
      await reload();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function updateTrackRole(
    trackId: string,
    analysisRole: AudioTrackDto["analysisRole"],
  ) {
    setBusy(`track-${trackId}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/audio-tracks/${trackId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ analysisRole }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        track?: AudioTrackDto;
      } | null;
      if (!response.ok || !body?.track) throw new Error(readError(body));
      setAudioTracks((current) =>
        current.map((track) =>
          track.id === body.track?.id ? body.track : track,
        ),
      );
      setMessage(
        analysisRole
          ? "Audio role confirmed for local analysis."
          : "Audio role cleared. This track will not be analyzed.",
      );
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
      const detector = state.detectors.find((item) => item.id === definitionId);
      const response = await fetch(
        `/api/projects/${projectId}/detectors/${definitionId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            enabled,
            parameters: detector?.parameters ?? {},
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        analysis?: DetectorFrameworkStateDto;
      } | null;
      if (!response.ok || !body?.analysis) throw new Error(readError(body));
      setState(body.analysis);
      setMessage(enabled ? "Local detector enabled." : "Detector disabled.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  function setDetectorParameter(
    definitionId: string,
    key: string,
    value: number | boolean | string,
  ) {
    setState((current) => ({
      ...current,
      detectors: current.detectors.map((detector) =>
        detector.id === definitionId
          ? {
              ...detector,
              parameters: { ...detector.parameters, [key]: value },
            }
          : detector,
      ),
    }));
  }

  async function saveDetectorSettings(definitionId: string) {
    const detector = state.detectors.find((item) => item.id === definitionId);
    if (!detector) return;
    setBusy(`settings-${definitionId}`);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/detectors/${definitionId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            enabled: detector.enabled,
            parameters: detector.parameters,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        analysis?: DetectorFrameworkStateDto;
      } | null;
      if (!response.ok || !body?.analysis) throw new Error(readError(body));
      setState(body.analysis);
      setMessage(
        `${detector.name} settings saved. Existing historical runs were not changed.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function runSingleDetector(definitionId: string) {
    setBusy(`run-${definitionId}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/detectors/${definitionId}/run`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readError(body));
      setMessage("A version-pinned single-detector rerun was queued.");
      await reload();
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
          <p className="section-kicker">Phase 3B.2 · General local signals</p>
          <h2
            id="analysis-title"
            className="font-display mt-1 text-3xl font-extrabold tracking-tight text-white uppercase"
          >
            Evidence-first local analysis
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            {state.message} Each result keeps its detector version,
            measurements, thresholds, evidence, and limitations.
          </p>
        </div>
        <button
          type="button"
          className="primary-button shrink-0"
          disabled={busy !== null || hasActiveJob || enabledCount === 0}
          onClick={() => void startFrameworkCheck()}
        >
          <FlaskConical size={16} />
          {hasActiveJob ? "Local analysis running" : "Run local analysis"}
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-amber-300/15 bg-amber-400/6 p-4 text-sm leading-6 text-amber-100">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0" size={17} />
          <p>
            General motion, audio, and transcript patterns are supporting
            signals only. R6 HUD and screen-state evidence starts in Phase 3B.3;
            candidate fusion starts in Phase 3B.4.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-white/8 bg-black/20 p-4">
        <h3 className="text-sm font-bold text-white">Confirm audio roles</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Track labels are recommendations only. A track is analyzed only after
          you confirm its role. Teammate audio is never selected automatically.
        </p>
        {audioTracks.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-white/10 p-3 text-xs text-slate-500">
            This recording has no audio. Video detectors can still run.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {audioTracks.map((track) => (
              <label
                key={track.id}
                className="rounded-lg border border-white/8 p-3"
              >
                <span className="block text-xs font-semibold text-slate-200">
                  Stream {track.streamIndex}
                  {track.title ? ` · ${track.title}` : ""}
                </span>
                <span className="mt-1 block text-[11px] text-slate-600">
                  {track.codecName} · {track.channels} channel
                  {track.channels === 1 ? "" : "s"}
                </span>
                <select
                  className="field mt-2"
                  aria-label={`Analysis role for audio stream ${track.streamIndex}`}
                  value={track.analysisRole ?? ""}
                  disabled={hasActiveJob || busy === `track-${track.id}`}
                  onChange={(event) =>
                    void updateTrackRole(
                      track.id,
                      (event.target.value ||
                        null) as AudioTrackDto["analysisRole"],
                    )
                  }
                >
                  <option value="">Do not analyze</option>
                  <option value="CREATOR_MICROPHONE">Creator microphone</option>
                  <option value="GAME_AUDIO">Game audio</option>
                  <option value="MIXED_AUDIO">Mixed audio</option>
                  <option value="UNKNOWN">Unknown</option>
                </select>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-3">
        {state.detectors.map((detector) => (
          <article
            key={detector.id}
            className="rounded-xl border border-white/8 bg-black/20 p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex min-w-0 flex-1 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[#b8ff2c]"
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
              </label>
              <span className="flex flex-wrap gap-2 text-[10px] font-bold tracking-wide uppercase">
                <span className="rounded-full border border-white/8 px-2.5 py-1 text-slate-500">
                  {detector.stableId}@{detector.version}
                </span>
                <span className="rounded-full border border-white/8 px-2.5 py-1 text-slate-500">
                  {detector.estimatedCost} cost
                </span>
                <span className="rounded-full border border-sky-300/15 bg-sky-400/6 px-2.5 py-1 text-sky-200">
                  {detector.implementationState === "ACTIVE"
                    ? "Active local detector"
                    : "Framework only"}
                </span>
              </span>
            </div>
            <details className="mt-3 border-t border-white/6 pt-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-300">
                Settings, work inputs, and rerun
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {parameterEntries(detector).length === 0 ? (
                  <p className="text-xs text-slate-600">
                    This detector has no adjustable settings.
                  </p>
                ) : (
                  parameterEntries(detector).map(([key, schema]) => (
                    <label key={key}>
                      <span className="form-label">{schema.label}</span>
                      {schema.type === "boolean" ? (
                        <input
                          className="mt-3 size-4 accent-[#b8ff2c]"
                          type="checkbox"
                          checked={Boolean(
                            detector.parameters[key] ?? schema.defaultValue,
                          )}
                          disabled={hasActiveJob}
                          onChange={(event) =>
                            setDetectorParameter(
                              detector.id,
                              key,
                              event.target.checked,
                            )
                          }
                        />
                      ) : (
                        <input
                          className="field mt-2"
                          type={schema.type === "number" ? "number" : "text"}
                          min={schema.minimum}
                          max={schema.maximum}
                          step={schema.type === "number" ? "any" : undefined}
                          value={String(
                            detector.parameters[key] ?? schema.defaultValue,
                          )}
                          disabled={hasActiveJob}
                          onChange={(event) =>
                            setDetectorParameter(
                              detector.id,
                              key,
                              schema.type === "number"
                                ? Number(event.target.value)
                                : event.target.value,
                            )
                          }
                        />
                      )}
                      <span className="mt-1 block text-[10px] leading-4 text-slate-600">
                        {schema.description}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={hasActiveJob || busy !== null}
                  onClick={() => void saveDetectorSettings(detector.id)}
                >
                  <Save size={14} /> Save settings
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={hasActiveJob || busy !== null}
                  onClick={() => void runSingleDetector(detector.id)}
                >
                  <RefreshCw size={14} /> Rerun only this detector
                </button>
                <span className="self-center text-[10px] text-slate-600">
                  Inputs: {detector.requiredInputs.join(", ") || "none"}
                </span>
              </div>
            </details>
          </article>
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
            No local analysis jobs yet. Manual benchmark labeling works
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
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-semibold text-slate-200">{run.name}</span>
                <span>
                  · {run.detectorStableId}@{run.detectorVersion} · {run.status}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-slate-600">
                {run.processedSourceSeconds === null
                  ? "No measured source work yet"
                  : `${run.processedSourceSeconds.toFixed(1)} video/audio seconds processed`}
                {run.processingDurationMs === null
                  ? ""
                  : ` · ${(run.processingDurationMs / 1_000).toFixed(2)}s wall time`}
                {run.processingSpeedRatio === null
                  ? ""
                  : ` · ${run.processingSpeedRatio.toFixed(2)}× realtime`}
                {run.peakMemoryBytes === null
                  ? ""
                  : ` · ${formatBytes(run.peakMemoryBytes)} peak process memory`}
                {` · ${formatBytes(run.temporaryDiskUsageBytes)} temporary · ${formatBytes(run.permanentDataBytes)} stored`}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-slate-600">
                {run.rawMeasurementCount} raw measurements ·{" "}
                {run.aggregatedMeasurementCount} stored measurements ·{" "}
                {run.curveCount} curves · {run.generatedEventCount} events
              </p>
              {run.errorMessage && (
                <p className="mt-1 text-red-200">{run.errorMessage}</p>
              )}
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

type ParameterView = {
  type: "number" | "boolean" | "string";
  label: string;
  description: string;
  defaultValue: number | boolean | string;
  minimum?: number;
  maximum?: number;
};

function parameterEntries(
  detector: DetectorFrameworkStateDto["detectors"][number],
) {
  return Object.entries(detector.parameterSchema).filter(
    (entry): entry is [string, ParameterView] => {
      const value = entry[1];
      return Boolean(
        value &&
        typeof value === "object" &&
        "type" in value &&
        ["number", "boolean", "string"].includes(String(value.type)) &&
        "label" in value &&
        typeof value.label === "string" &&
        "description" in value &&
        typeof value.description === "string" &&
        "defaultValue" in value,
      );
    },
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
