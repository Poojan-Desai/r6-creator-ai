"use client";

import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Play,
  Save,
  Search,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SignalExplorerStateDto } from "@/lib/signal-explorer";
import { formatDuration } from "@/lib/time";
import type { TimeSeriesPoint } from "@/lib/signals/time-series";

type CurveMeta = SignalExplorerStateDto["curves"][number];
type ExplorerEvent = SignalExplorerStateDto["events"][number];

const LEFT_GUTTER = 172;
const ROW_HEIGHT = 72;

const COLORS = [
  "#b8ff2c",
  "#38bdf8",
  "#f59e0b",
  "#e879f9",
  "#fb7185",
  "#a78bfa",
  "#2dd4bf",
  "#facc15",
];

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
  return "Signal Explorer could not complete that action.";
}

function label(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function SignalExplorer({
  projectId,
  initialState,
  confirmedMapContext,
}: {
  projectId: string;
  initialState: SignalExplorerStateDto;
  confirmedMapContext: string | null;
}) {
  const [state, setState] = useState(initialState);
  const initialVisible = initialState.preferences.visibleTracks;
  const [visible, setVisible] = useState(
    new Set(
      initialVisible.length > 0
        ? initialVisible
        : initialState.curves.map((curve) => curve.id),
    ),
  );
  const [curvePoints, setCurvePoints] = useState(
    new Map<string, TimeSeriesPoint[]>(),
  );
  const [detectorFilter, setDetectorFilter] = useState("ALL");
  const [minimumConfidence, setMinimumConfidence] = useState(
    initialState.preferences.minimumConfidence,
  );
  const [zoomStart, setZoomStart] = useState(
    initialState.preferences.zoomStartSeconds ?? 0,
  );
  const [zoomEnd, setZoomEnd] = useState(
    initialState.preferences.zoomEndSeconds ?? initialState.durationSeconds,
  );
  const [selectedEvent, setSelectedEvent] = useState<ExplorerEvent | null>(
    null,
  );
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(
    Math.min(10, initialState.durationSeconds),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const filteredCurves = useMemo(
    () =>
      state.curves.filter(
        (curve) =>
          visible.has(curve.id) &&
          (detectorFilter === "ALL" ||
            curve.detectorStableId === detectorFilter),
      ),
    [detectorFilter, state.curves, visible],
  );
  const filteredEvents = useMemo(
    () =>
      state.events.filter(
        (event) =>
          event.confidence >= minimumConfidence &&
          (detectorFilter === "ALL" ||
            event.detectorStableId === detectorFilter) &&
          event.endSeconds >= zoomStart &&
          event.startSeconds <= zoomEnd,
      ),
    [detectorFilter, minimumConfidence, state.events, zoomEnd, zoomStart],
  );
  const detectors = useMemo(
    () =>
      [...new Set(state.curves.map((curve) => curve.detectorStableId))].sort(),
    [state.curves],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const loaded = new Map<string, TimeSeriesPoint[]>();
      await Promise.all(
        state.curves.map(async (curve) => {
          const query = new URLSearchParams({ maxPoints: "1200" });
          const response = await fetch(
            `/api/signal-curves/${curve.id}?${query.toString()}`,
            { cache: "no-store" },
          );
          const payload = (await response.json().catch(() => null)) as {
            curve?: { points?: TimeSeriesPoint[] };
          } | null;
          if (response.ok && payload?.curve?.points) {
            loaded.set(curve.id, payload.curve.points);
          }
        }),
      );
      if (!cancelled) setCurvePoints(loaded);
    }
    void load().catch((caught) =>
      setError(
        caught instanceof Error
          ? caught.message
          : "Signal curves could not load.",
      ),
    );
    return () => {
      cancelled = true;
    };
  }, [state.curves]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = Math.max(640, canvas.clientWidth);
    const rows = filteredCurves.length + 2;
    const height = 34 + rows * ROW_HEIGHT;
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(scale, scale);
    context.fillStyle = "#090d10";
    context.fillRect(0, 0, width, height);
    const plotWidth = Math.max(1, width - LEFT_GUTTER - 12);
    const span = Math.max(0.001, zoomEnd - zoomStart);
    const x = (time: number) =>
      LEFT_GUTTER + ((time - zoomStart) / span) * plotWidth;

    context.font = "11px ui-monospace, SFMono-Regular, monospace";
    context.fillStyle = "#64748b";
    for (let tick = 0; tick <= 5; tick += 1) {
      const time = zoomStart + (span * tick) / 5;
      const tickX = x(time);
      context.strokeStyle = "rgba(255,255,255,0.07)";
      context.beginPath();
      context.moveTo(tickX, 25);
      context.lineTo(tickX, height);
      context.stroke();
      context.fillText(formatDuration(time), tickX + 3, 16);
    }

    filteredCurves.forEach((curve, index) => {
      const top = 34 + index * ROW_HEIGHT;
      context.fillStyle = index % 2 === 0 ? "#0d1216" : "#0b1014";
      context.fillRect(0, top, width, ROW_HEIGHT);
      context.fillStyle = "#cbd5e1";
      context.font = "600 11px system-ui, sans-serif";
      context.fillText(curve.displayName.slice(0, 24), 12, top + 24);
      context.fillStyle = "#64748b";
      context.font = "10px ui-monospace, SFMono-Regular, monospace";
      context.fillText(
        `${curve.detectorStableId}@${curve.detectorVersion}`.slice(0, 29),
        12,
        top + 43,
      );
      const points = curvePoints.get(curve.id) ?? [];
      context.strokeStyle = COLORS[index % COLORS.length] ?? "#b8ff2c";
      context.lineWidth = 1.5;
      context.beginPath();
      let started = false;
      for (const point of points) {
        if (
          point.timestampSeconds < zoomStart ||
          point.timestampSeconds > zoomEnd
        )
          continue;
        const pointX = x(point.timestampSeconds);
        const pointY = top + 58 - point.normalizedValue * 46;
        if (!started) {
          context.moveTo(pointX, pointY);
          started = true;
        } else context.lineTo(pointX, pointY);
      }
      context.stroke();
    });

    const eventsTop = 34 + filteredCurves.length * ROW_HEIGHT;
    context.fillStyle = "#10151a";
    context.fillRect(0, eventsTop, width, ROW_HEIGHT);
    context.fillStyle = "#e2e8f0";
    context.font = "600 11px system-ui, sans-serif";
    context.fillText("Automatic evidence", 12, eventsTop + 24);
    context.fillStyle = "#64748b";
    context.font = "10px system-ui, sans-serif";
    context.fillText(
      `${filteredEvents.length} visible events`,
      12,
      eventsTop + 43,
    );
    for (const event of filteredEvents) {
      context.fillStyle =
        selectedEvent?.id === event.id ? "#ffffff" : "rgba(56,189,248,0.75)";
      const startX = x(Math.max(zoomStart, event.startSeconds));
      const endX = x(Math.min(zoomEnd, event.endSeconds));
      context.fillRect(startX, eventsTop + 20, Math.max(2, endX - startX), 34);
      context.fillStyle = "#b8ff2c";
      context.fillRect(x(event.peakSeconds) - 1, eventsTop + 12, 2, 50);
    }

    const labelsTop = eventsTop + ROW_HEIGHT;
    context.fillStyle = "#0d1216";
    context.fillRect(0, labelsTop, width, ROW_HEIGHT);
    context.fillStyle = "#e2e8f0";
    context.font = "600 11px system-ui, sans-serif";
    context.fillText("Human ground truth", 12, labelsTop + 24);
    context.fillStyle = "#64748b";
    context.font = "10px system-ui, sans-serif";
    context.fillText(
      `${state.labels.length} manual labels`,
      12,
      labelsTop + 43,
    );
    for (const manual of state.labels) {
      if (manual.endSeconds < zoomStart || manual.startSeconds > zoomEnd)
        continue;
      context.fillStyle = manual.approved
        ? "rgba(184,255,44,0.48)"
        : "rgba(245,158,11,0.45)";
      context.fillRect(
        x(Math.max(zoomStart, manual.startSeconds)),
        labelsTop + 20,
        Math.max(
          2,
          x(Math.min(zoomEnd, manual.endSeconds)) -
            x(Math.max(zoomStart, manual.startSeconds)),
        ),
        34,
      );
    }
  }, [
    curvePoints,
    filteredCurves,
    filteredEvents,
    selectedEvent?.id,
    state.labels,
    zoomEnd,
    zoomStart,
  ]);

  useEffect(() => {
    draw();
    const observer = new ResizeObserver(draw);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [draw]);

  function timeAtPointer(event: React.MouseEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const plotWidth = Math.max(1, bounds.width - LEFT_GUTTER - 12);
    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - bounds.left - LEFT_GUTTER) / plotWidth),
    );
    return zoomStart + ratio * (zoomEnd - zoomStart);
  }

  function seek(time: number, play = false, end?: number) {
    window.dispatchEvent(
      new CustomEvent("r6-seek-source", { detail: { time, play, end } }),
    );
  }

  function handleCanvasClick(event: React.MouseEvent<HTMLCanvasElement>) {
    const time = timeAtPointer(event);
    const tolerance = Math.max(0.25, (zoomEnd - zoomStart) * 0.015);
    const nearest = filteredEvents
      .filter((item) => Math.abs(item.peakSeconds - time) <= tolerance)
      .sort(
        (left, right) =>
          Math.abs(left.peakSeconds - time) -
          Math.abs(right.peakSeconds - time),
      )[0];
    setSelectedEvent(nearest ?? null);
    seek(nearest?.peakSeconds ?? time);
  }

  function changeZoom(nextStart: number, nextEnd: number) {
    const span = Math.max(1, nextEnd - nextStart);
    const start = Math.max(
      0,
      Math.min(
        state.durationSeconds - Math.min(span, state.durationSeconds),
        nextStart,
      ),
    );
    setZoomStart(start);
    setZoomEnd(Math.min(state.durationSeconds, start + span));
  }

  async function savePreferences() {
    setBusy("preferences");
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/signals`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          visibleTracks: [...visible],
          hiddenDetectors: [],
          minimumConfidence,
          zoomStartSeconds: zoomStart,
          zoomEndSeconds: zoomEnd,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        signals?: SignalExplorerStateDto;
      } | null;
      if (!response.ok || !payload?.signals)
        throw new Error(readError(payload));
      setMessage("Signal Explorer view saved locally.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "View could not be saved.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function deleteCurve(curve: CurveMeta) {
    if (
      !window.confirm(
        `Delete the stored ${curve.displayName} curve? You can regenerate it by rerunning ${curve.detectorName}.`,
      )
    ) {
      return;
    }
    setBusy(`delete-${curve.id}`);
    setError(null);
    try {
      const response = await fetch(`/api/signal-curves/${curve.id}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readError(payload));
      setState((current) => ({
        ...current,
        curves: current.curves.filter((item) => item.id !== curve.id),
      }));
      setVisible((current) => {
        const next = new Set(current);
        next.delete(curve.id);
        return next;
      });
      setMessage(
        "Stored curve deleted. Detector events and historical jobs remain inspectable.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Curve could not be deleted.",
      );
    } finally {
      setBusy(null);
    }
  }

  const currentSpan = zoomEnd - zoomStart;

  return (
    <section
      className="panel mt-8 p-5 sm:p-6"
      aria-labelledby="signal-explorer-title"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="section-kicker">Phase 3B.2 · Synchronized evidence</p>
          <h2
            id="signal-explorer-title"
            className="font-display mt-1 text-3xl font-extrabold text-white uppercase"
          >
            Signal Explorer
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Curves are downsampled and event-preserving. Click the timeline to
            seek the source video; inspect measurements and limitations before
            creating human ground truth.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={busy !== null}
          onClick={() => void savePreferences()}
        >
          <Save size={15} /> Save view
        </button>
      </div>

      {confirmedMapContext && (
        <p className="mt-4 rounded-xl border border-sky-300/15 bg-sky-400/6 px-4 py-3 text-xs leading-5 text-sky-100">
          User-confirmed project context: {confirmedMapContext}. Signal
          detectors did not discover this map context.
        </p>
      )}

      {!state.job ? (
        <div className="mt-6 rounded-xl border border-dashed border-white/10 p-8 text-center">
          <Search className="mx-auto text-slate-600" size={24} />
          <p className="mt-3 font-semibold text-slate-300">
            No completed signal detector yet
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Run local analysis above. Successful detector results remain
            available even if a later detector fails.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(13rem,0.3fr)_minmax(0,0.7fr)]">
            <div className="rounded-xl border border-white/8 bg-black/20 p-4">
              <label className="block">
                <span className="form-label">Detector filter</span>
                <select
                  className="field mt-2"
                  value={detectorFilter}
                  onChange={(event) => setDetectorFilter(event.target.value)}
                >
                  <option value="ALL">All detectors</option>
                  {detectors.map((detector) => (
                    <option key={detector} value={detector}>
                      {detector}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 block">
                <span className="form-label">
                  Minimum confidence · {minimumConfidence.toFixed(2)}
                </span>
                <input
                  className="mt-3 w-full accent-[#b8ff2c]"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={minimumConfidence}
                  onChange={(event) =>
                    setMinimumConfidence(Number(event.target.value))
                  }
                />
              </label>
              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                {state.curves.map((curve) => (
                  <div
                    key={curve.id}
                    className="flex items-center gap-2 rounded-lg border border-white/6 p-2"
                  >
                    <button
                      type="button"
                      className="icon-button size-8"
                      aria-label={`${visible.has(curve.id) ? "Hide" : "Show"} ${curve.displayName}`}
                      onClick={() =>
                        setVisible((current) => {
                          const next = new Set(current);
                          if (next.has(curve.id)) next.delete(curve.id);
                          else next.add(curve.id);
                          return next;
                        })
                      }
                    >
                      {visible.has(curve.id) ? (
                        <Eye size={13} />
                      ) : (
                        <EyeOff size={13} />
                      )}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-300">
                      {curve.displayName}
                    </span>
                    <button
                      type="button"
                      className="icon-button size-8 text-red-300"
                      aria-label={`Delete ${curve.displayName}`}
                      disabled={busy !== null}
                      onClick={() => void deleteCurve(curve)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/8 bg-black/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Pan timeline left"
                  onClick={() =>
                    changeZoom(
                      zoomStart - currentSpan / 2,
                      zoomEnd - currentSpan / 2,
                    )
                  }
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    changeZoom(
                      zoomStart + currentSpan * 0.25,
                      zoomEnd - currentSpan * 0.25,
                    )
                  }
                  disabled={currentSpan <= 2}
                >
                  <ZoomIn size={14} /> Zoom in
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    changeZoom(
                      zoomStart - currentSpan / 2,
                      zoomEnd + currentSpan / 2,
                    )
                  }
                  disabled={currentSpan >= state.durationSeconds}
                >
                  <ZoomOut size={14} /> Zoom out
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Pan timeline right"
                  onClick={() =>
                    changeZoom(
                      zoomStart + currentSpan / 2,
                      zoomEnd + currentSpan / 2,
                    )
                  }
                >
                  <ChevronRight size={15} />
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => changeZoom(0, state.durationSeconds)}
                >
                  Reset
                </button>
                <span className="ml-auto text-xs text-slate-500">
                  {formatDuration(zoomStart)}–{formatDuration(zoomEnd)}
                  {hoverTime === null
                    ? ""
                    : ` · hover ${formatDuration(hoverTime)}`}
                </span>
              </div>
              <div className="mt-4 overflow-x-auto rounded-lg border border-white/6">
                <canvas
                  ref={canvasRef}
                  className="block w-full min-w-[640px] cursor-crosshair"
                  aria-label="Synchronized signal curves, automatic evidence, and human ground-truth timeline"
                  onMouseMove={(event) => setHoverTime(timeAtPointer(event))}
                  onMouseLeave={() => setHoverTime(null)}
                  onClick={handleCanvasClick}
                />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/8 bg-black/20 p-4">
              <p className="section-kicker">Selected range</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <TimeField
                  label="Start"
                  value={rangeStart}
                  maximum={state.durationSeconds}
                  onChange={setRangeStart}
                />
                <TimeField
                  label="End"
                  value={rangeEnd}
                  maximum={state.durationSeconds}
                  onChange={setRangeEnd}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={rangeStart >= rangeEnd}
                  onClick={() => seek(rangeStart, true, rangeEnd)}
                >
                  <Play size={14} /> Replay range
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={rangeStart >= rangeEnd}
                  onClick={() => {
                    const peakSeconds = (rangeStart + rangeEnd) / 2;
                    window.dispatchEvent(
                      new CustomEvent("r6-benchmark-range", {
                        detail: {
                          startSeconds: rangeStart,
                          peakSeconds,
                          endSeconds: rangeEnd,
                        },
                      }),
                    );
                    document
                      .getElementById("benchmark-labeler")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Create manual label
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/8 bg-black/20 p-4">
              <p className="section-kicker">Event inspection</p>
              {selectedEvent ? (
                <div className="mt-3 space-y-3 text-xs leading-5 text-slate-400">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">
                      {label(selectedEvent.eventType)}
                    </span>
                    <span className="rounded-full border border-white/8 px-2 py-0.5">
                      {selectedEvent.confidence.toFixed(2)} confidence
                    </span>
                  </div>
                  <p>
                    {formatDuration(selectedEvent.startSeconds)}–
                    {formatDuration(selectedEvent.endSeconds)} · peak{" "}
                    {formatDuration(selectedEvent.peakSeconds)}
                  </p>
                  <p>
                    {selectedEvent.detectorStableId}@
                    {selectedEvent.detectorVersion}
                  </p>
                  {selectedEvent.supportingEvidence.map((item, index) => (
                    <p key={`support-${index}`} className="text-[#d8ff8a]">
                      Supports: {String(item)}
                    </p>
                  ))}
                  {selectedEvent.conflictingEvidence.map((item, index) => (
                    <p key={`conflict-${index}`} className="text-amber-200">
                      Limitation: {String(item)}
                    </p>
                  ))}
                  <details>
                    <summary className="cursor-pointer text-slate-300">
                      Raw measurements and thresholds
                    </summary>
                    <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-black/30 p-3 text-[10px] whitespace-pre-wrap">
                      {JSON.stringify(
                        {
                          measurements: selectedEvent.rawMeasurements,
                          thresholds: selectedEvent.thresholds,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => seek(selectedEvent.peakSeconds, true)}
                  >
                    <Play size={14} /> Play from evidence
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Click near an automatic event marker to inspect its evidence,
                  thresholds, version, and limitations.
                </p>
              )}
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-600">
            {state.job.analysisVersion} · {state.job.detectorSetVersion} ·{" "}
            {state.curves.length} stored curves · {state.events.length} loaded
            events
            {state.truncatedEventCount > 0
              ? ` · ${state.truncatedEventCount} additional events omitted from this view`
              : ""}
          </p>
        </>
      )}

      {(message || error) && (
        <div
          role={error ? "alert" : "status"}
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${error ? "border-red-400/20 bg-red-500/8 text-red-200" : "border-[#b8ff2c]/20 bg-[#b8ff2c]/8 text-[#d8ff8a]"}`}
        >
          {error ?? message}
        </div>
      )}
    </section>
  );
}

function TimeField({
  label: fieldLabel,
  value,
  maximum,
  onChange,
}: {
  label: string;
  value: number;
  maximum: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="form-label">{fieldLabel}</span>
      <input
        className="field mt-2"
        type="number"
        min="0"
        max={maximum}
        step="0.05"
        value={value}
        onChange={(event) =>
          onChange(Math.max(0, Math.min(maximum, Number(event.target.value))))
        }
      />
    </label>
  );
}
