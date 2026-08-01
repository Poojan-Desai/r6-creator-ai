"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  CircleHelp,
  Eye,
  FileQuestion,
  History,
  LoaderCircle,
  Play,
  Plus,
  RotateCcw,
  Save,
  ScanSearch,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { CoachingState } from "@/lib/coaching";
import { formatDuration } from "@/lib/time";

type CategoryOption = {
  value: string;
  label: string;
  kind: "review" | "strength";
  evidenceBoundary: string;
};

type ValueLabel = { value: string; label: string };

type Finding = CoachingState["findings"][number];

const evidenceLabels: Record<string, string> = {
  DIRECT_VIDEO_OBSERVATION: "Direct visible observation",
  REPLAY_CONFIRMED_FACT: "Replay-confirmed fact",
  TRANSCRIPT_EVIDENCE: "Transcript evidence",
  USER_CONFIRMED_MAP_CONTEXT: "User-confirmed map context",
  USER_CONFIRMED_CONTEXT: "User-confirmed context",
  INFERENCE: "Inference",
  CONFLICTING_EVIDENCE: "Conflicting evidence",
  MISSING_CONTEXT: "Missing context",
};

function failureMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The local Coaching Lab could not finish that action.";
}

function apiMessage(body: { error?: { message?: string } }) {
  return body.error?.message || "The local Coaching Lab request failed.";
}

export function CoachingLabWorkspace({
  studioProjectId,
  initialState,
  categories,
  severities,
  decisions,
}: {
  studioProjectId: string;
  initialState: CoachingState;
  categories: ReadonlyArray<CategoryOption>;
  severities: ReadonlyArray<ValueLabel>;
  decisions: ReadonlyArray<ValueLabel>;
}) {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [form, setForm] = useState({
    category: "REVIEW_RECOMMENDED",
    severity: "MEDIUM",
    confidence: "0.6",
    videoTimestampSeconds: "",
    canonicalEventId: "",
    transcriptSegmentId: "",
    directObservation: "",
    directObservationConfirmed: false,
    inference: "",
    missingContext: "",
    alternativeExplanation: "",
    coachNote: "",
  });
  const selectedCategory = categories.find(
    (category) => category.value === form.category,
  );

  async function createFinding() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/coaching`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: form.category,
            severity: form.severity,
            confidence: Number(form.confidence),
            videoTimestampSeconds: form.videoTimestampSeconds
              ? Number(form.videoTimestampSeconds)
              : null,
            canonicalEventId: form.canonicalEventId || null,
            transcriptSegmentId: form.transcriptSegmentId || null,
            directObservation: form.directObservation || null,
            directObservationConfirmed: form.directObservationConfirmed,
            inference: form.inference || null,
            missingContext: form.missingContext || null,
            alternativeExplanation: form.alternativeExplanation || null,
            coachNote: form.coachNote || null,
          }),
        },
      );
      const body = (await response.json()) as {
        coaching?: CoachingState;
        error?: { message?: string };
      };
      if (!response.ok || !body.coaching) throw new Error(apiMessage(body));
      setState(body.coaching);
      setForm((current) => ({
        ...current,
        videoTimestampSeconds: "",
        canonicalEventId: "",
        transcriptSegmentId: "",
        directObservation: "",
        directObservationConfirmed: false,
        inference: "",
        missingContext: "",
        alternativeExplanation: "",
        coachNote: "",
      }));
      setMessage(
        "Saved the finding with observations, replay facts, inferences, and unknowns kept separate.",
      );
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function updateFinding(
    findingId: string,
    values: Record<string, unknown>,
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/coaching/findings/${findingId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const body = (await response.json()) as {
        coaching?: CoachingState;
        error?: { message?: string };
      };
      if (!response.ok || !body.coaching) throw new Error(apiMessage(body));
      setState(body.coaching);
      setMessage("Saved the correction and retained the previous value.");
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function deleteFinding(findingId: string) {
    if (
      !window.confirm(
        "Delete this coaching finding and its local feedback history?",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/coaching/findings/${findingId}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as {
        coaching?: CoachingState;
        error?: { message?: string };
      };
      if (!response.ok || !body.coaching) throw new Error(apiMessage(body));
      setState(body.coaching);
      setMessage("Deleted the selected local finding.");
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function seek(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    void video.play();
  }

  const capabilityRows = useMemo(
    () => Object.entries(state.capabilities),
    [state.capabilities],
  );

  return (
    <div className="space-y-8">
      <section className="panel overflow-hidden">
        <div className="border-b border-white/8 p-5 sm:p-6">
          <p className="section-kicker">U6 · Evidence boundary</p>
          <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
            What this project can support
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
            Coaching Lab is an AI-assisted replay and POV review. It keeps
            measured or human-reviewed observations separate from replay facts
            and tactical inferences. It does not replace a professional coach.
          </p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
          {capabilityRows.map(([key, capability]) => (
            <article
              key={key}
              className="rounded-2xl border border-white/8 bg-black/15 p-4"
            >
              <div className="flex items-start gap-3">
                {capability.state.startsWith("UN") ? (
                  <FileQuestion
                    className="mt-0.5 shrink-0 text-amber-300"
                    size={18}
                  />
                ) : (
                  <CheckCircle2
                    className="mt-0.5 shrink-0 text-[#b8ff2c]"
                    size={18}
                  />
                )}
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {key.replaceAll(/([A-Z])/g, " $1").trim()}
                  </h3>
                  <p className="mt-1 text-[10px] font-bold tracking-[0.11em] text-slate-600 uppercase">
                    {capability.state.replaceAll("_", " ")}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {capability.explanation}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {state.project.recording && (
        <section className="panel overflow-hidden">
          <div className="border-b border-white/8 p-5 sm:p-6">
            <p className="section-kicker">Owned screen recording</p>
            <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
              Review the visible moment
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {state.project.recording.name} ·{" "}
              {formatDuration(state.project.recording.durationSeconds)} ·{" "}
              {state.project.recording.width}×{state.project.recording.height}
            </p>
          </div>
          <div className="p-5 sm:p-6">
            <video
              ref={videoRef}
              className="aspect-video w-full rounded-2xl bg-black"
              controls
              preload="metadata"
              src={`/api/media/projects/${state.project.recording.id}/source`}
            />
            <button
              type="button"
              className="secondary-button mt-4"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  videoTimestampSeconds:
                    videoRef.current?.currentTime.toFixed(3) ?? "",
                }))
              }
            >
              <Eye size={15} /> Use current video time
            </button>
          </div>
        </section>
      )}

      <section className="panel overflow-hidden">
        <div className="border-b border-white/8 p-5 sm:p-6">
          <p className="section-kicker">U6.1 · Human-reviewed finding</p>
          <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
            Record only what the evidence supports
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
            A direct observation means you personally saw it in the selected
            recording. A replay fact must come from the parsed replay list. A
            transcript line is supporting evidence only.
          </p>
        </div>
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-2">
          <label>
            <span className="form-label">Finding category</span>
            <select
              className="field mt-2"
              value={form.category}
              disabled={busy}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
            >
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
            <span className="mt-2 block text-xs leading-5 text-amber-100/70">
              {selectedCategory?.evidenceBoundary}
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="form-label">Severity</span>
              <select
                className="field mt-2"
                value={form.severity}
                disabled={busy}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    severity: event.target.value,
                  }))
                }
              >
                {severities.map((severity) => (
                  <option key={severity.value} value={severity.value}>
                    {severity.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="form-label">Confidence</span>
              <input
                className="field mt-2"
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={form.confidence}
                disabled={busy}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    confidence: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <label>
            <span className="form-label">Video timestamp (seconds)</span>
            <input
              className="field mt-2"
              type="number"
              min="0"
              max={state.project.recording?.durationSeconds}
              step="0.001"
              value={form.videoTimestampSeconds}
              disabled={busy || !state.project.recording}
              placeholder={
                state.project.recording
                  ? "Use the current video time"
                  : "No screen recording"
              }
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  videoTimestampSeconds: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span className="form-label">Supported replay fact (optional)</span>
            <select
              className="field mt-2"
              value={form.canonicalEventId}
              disabled={busy || state.replayEvents.length === 0}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  canonicalEventId: event.target.value,
                }))
              }
            >
              <option value="">No replay fact selected</option>
              {state.replayEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.summary}
                </option>
              ))}
            </select>
          </label>

          <label className="lg:col-span-2">
            <span className="form-label">
              Direct visible observation (optional)
            </span>
            <textarea
              className="field mt-2 min-h-24"
              value={form.directObservation}
              disabled={busy || !state.project.recording}
              placeholder="Example: At this exact timestamp, the visible crosshair was below the doorway when firing began."
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  directObservation: event.target.value,
                }))
              }
            />
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/15 p-4 lg:col-span-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.directObservationConfirmed}
              disabled={busy || !form.directObservation}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  directObservationConfirmed: event.target.checked,
                }))
              }
            />
            <span className="text-sm leading-6 text-slate-300">
              I personally reviewed this timestamp and the direct observation
              describes only what is visibly present in the selected recording.
            </span>
          </label>

          <label className="lg:col-span-2">
            <span className="form-label">
              Saved transcript line (optional, supporting only)
            </span>
            <select
              className="field mt-2"
              value={form.transcriptSegmentId}
              disabled={busy || state.transcriptSegments.length === 0}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  transcriptSegmentId: event.target.value,
                }))
              }
            >
              <option value="">No transcript line selected</option>
              {state.transcriptSegments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {formatDuration(segment.startSeconds)} · {segment.text}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="form-label">Tactical inference (optional)</span>
            <textarea
              className="field mt-2 min-h-24"
              value={form.inference}
              disabled={busy}
              placeholder="Explain what this may mean. The app will label it as inference."
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  inference: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span className="form-label">Missing context</span>
            <textarea
              className="field mt-2 min-h-24"
              value={form.missingContext}
              disabled={busy}
              placeholder="Example: Teammate positions and the reason for holding this angle are unknown."
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  missingContext: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span className="form-label">Alternative explanation</span>
            <textarea
              className="field mt-2 min-h-20"
              value={form.alternativeExplanation}
              disabled={busy}
              placeholder="What else could explain the same observation?"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  alternativeExplanation: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span className="form-label">Private coach note</span>
            <textarea
              className="field mt-2 min-h-20"
              value={form.coachNote}
              disabled={busy}
              placeholder="Optional note for your later review."
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  coachNote: event.target.value,
                }))
              }
            />
          </label>
          <div className="lg:col-span-2">
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void createFinding()}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <Plus size={16} />
              )}
              Save inspectable finding
            </button>
          </div>
        </div>
      </section>

      {(message || error) && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            error
              ? "border-red-300/20 bg-red-300/6 text-red-100"
              : "border-[#b8ff2c]/20 bg-[#b8ff2c]/6 text-[#d8ff8a]"
          }`}
          role={error ? "alert" : "status"}
        >
          {error ?? message}
        </div>
      )}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="section-kicker">Finding review</p>
            <h2 className="font-display mt-1 text-4xl font-bold text-white uppercase">
              Inspect every claim
            </h2>
          </div>
          <span className="rounded-full border border-white/8 px-3 py-1.5 text-xs font-semibold text-slate-400">
            {state.findings.length} saved finding
            {state.findings.length === 1 ? "" : "s"}
          </span>
        </div>
        {state.findings.length === 0 ? (
          <div className="panel mt-5 p-7 text-center">
            <CircleHelp className="mx-auto text-slate-600" size={28} />
            <p className="mt-3 text-sm text-slate-500">
              No coaching finding has been generated or human-reviewed yet.
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {state.findings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                categories={categories}
                severities={severities}
                decisions={decisions}
                busy={busy}
                hasVideo={Boolean(state.project.recording)}
                onSeek={seek}
                onUpdate={updateFinding}
                onDelete={deleteFinding}
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel p-5 sm:p-6">
        <p className="section-kicker">Analysis history</p>
        <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
          Reproducible versions
        </h2>
        {state.analyses.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No coaching analysis version exists yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {state.analyses.map((analysis) => (
              <div
                key={analysis.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/15 p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-white">
                    {analysis.analysisVersion}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {analysis.ruleSetVersion} · {analysis.inputMode} ·{" "}
                    {analysis.findingCount} finding
                    {analysis.findingCount === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.08em] text-[#d8ff8a] uppercase">
                  <History size={14} /> {analysis.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FindingCard({
  finding,
  categories,
  severities,
  decisions,
  busy,
  hasVideo,
  onSeek,
  onUpdate,
  onDelete,
}: {
  finding: Finding;
  categories: ReadonlyArray<CategoryOption>;
  severities: ReadonlyArray<ValueLabel>;
  decisions: ReadonlyArray<ValueLabel>;
  busy: boolean;
  hasVideo: boolean;
  onSeek: (seconds: number) => void;
  onUpdate: (
    findingId: string,
    values: Record<string, unknown>,
  ) => Promise<void>;
  onDelete: (findingId: string) => Promise<void>;
}) {
  const [decision, setDecision] = useState<string>(finding.decision);
  const [category, setCategory] = useState<string>(finding.category);
  const [severity, setSeverity] = useState<string>(finding.severity);
  const [timestamp, setTimestamp] = useState(
    finding.videoTimestampSeconds?.toFixed(3) ?? "",
  );
  const [coachNote, setCoachNote] = useState(finding.coachNote ?? "");
  const [futurePractice, setFuturePractice] = useState(finding.futurePractice);
  const categoryDetails = categories.find((item) => item.value === category);

  return (
    <article className="panel overflow-hidden">
      <div className="border-b border-white/8 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">
              {categoryDetails?.kind === "strength"
                ? "Observed strength"
                : "Review candidate"}
            </p>
            <h3 className="font-display mt-1 text-3xl font-bold text-white uppercase">
              {categoryDetails?.label ?? finding.category}
            </h3>
            <p className="mt-2 text-xs text-slate-500">
              Confidence {Math.round(finding.confidence * 100)}% ·{" "}
              {finding.analysisVersion}
              {finding.roundIndex != null
                ? ` · Round ${finding.roundIndex + 1}`
                : ""}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-bold tracking-[0.08em] uppercase ${
              finding.decision === "ACCEPTED" ||
              finding.decision === "GOOD_OBSERVATION"
                ? "border-[#b8ff2c]/20 bg-[#b8ff2c]/6 text-[#d8ff8a]"
                : finding.decision === "REJECTED" ||
                    finding.decision === "WRONG_CATEGORY"
                  ? "border-red-300/20 bg-red-300/6 text-red-100"
                  : "border-white/10 text-slate-400"
            }`}
          >
            {finding.decision.replaceAll("_", " ")}
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
              <ScanSearch size={16} className="text-[#b8ff2c]" />
              Bounded explanation
            </h4>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {finding.explanation}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {finding.evidence.map((evidence) => (
              <EvidenceCard key={evidence.id} evidence={evidence} />
            ))}
          </div>

          {finding.alternativeExplanations.length > 0 && (
            <div className="rounded-xl border border-sky-300/15 bg-sky-300/5 p-4">
              <h4 className="text-xs font-bold tracking-[0.1em] text-sky-100 uppercase">
                Alternative explanation
              </h4>
              {finding.alternativeExplanations.map((item) => (
                <p key={item} className="mt-2 text-sm leading-6 text-sky-50/70">
                  {item}
                </p>
              ))}
            </div>
          )}

          {finding.videoTimestampSeconds != null && hasVideo && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => onSeek(finding.videoTimestampSeconds ?? 0)}
            >
              <Play size={15} /> Play source at{" "}
              {formatDuration(finding.videoTimestampSeconds)}
            </button>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
              <BookOpenCheck size={16} className="text-[#b8ff2c]" />
              Your review
            </h4>
            <label className="mt-4 block">
              <span className="form-label">Decision</span>
              <select
                className="field mt-2"
                value={decision}
                disabled={busy}
                onChange={(event) => setDecision(event.target.value)}
              >
                {decisions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block">
              <span className="form-label">Correct category</span>
              <select
                className="field mt-2"
                value={category}
                disabled={busy}
                onChange={(event) => setCategory(event.target.value)}
              >
                {categories.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block">
              <span className="form-label">Severity</span>
              <select
                className="field mt-2"
                value={severity}
                disabled={busy}
                onChange={(event) => setSeverity(event.target.value)}
              >
                {severities.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-4 block">
              <span className="form-label">Correct video time</span>
              <input
                className="field mt-2"
                type="number"
                min="0"
                step="0.001"
                value={timestamp}
                disabled={busy || !hasVideo}
                onChange={(event) => setTimestamp(event.target.value)}
              />
            </label>
            <label className="mt-4 block">
              <span className="form-label">Coach note</span>
              <textarea
                className="field mt-2 min-h-20"
                value={coachNote}
                disabled={busy}
                onChange={(event) => setCoachNote(event.target.value)}
              />
            </label>
            <label className="mt-4 flex items-start gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                className="mt-1"
                checked={futurePractice}
                disabled={busy}
                onChange={(event) => setFuturePractice(event.target.checked)}
              />
              Add this finding to future practice.
            </label>
            <button
              type="button"
              className="primary-button mt-5 w-full justify-center"
              disabled={busy}
              onClick={() =>
                void onUpdate(finding.id, {
                  decision,
                  category,
                  severity,
                  videoTimestampSeconds: timestamp ? Number(timestamp) : null,
                  coachNote: coachNote || null,
                  futurePractice,
                })
              }
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <Save size={15} />
              )}
              Save review
            </button>
          </div>

          {(finding.originalCategory !== finding.category ||
            finding.originalSeverity !== finding.severity ||
            finding.originalVideoTimestampSeconds !==
              finding.videoTimestampSeconds) && (
            <div className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100/75">
              <p className="flex items-center gap-2 font-semibold text-amber-100">
                <RotateCcw size={14} /> Original retained
              </p>
              <p className="mt-2">
                {finding.originalCategory.replaceAll("_", " ")} ·{" "}
                {finding.originalSeverity.toLowerCase()}
                {finding.originalVideoTimestampSeconds != null
                  ? ` · ${formatDuration(
                      finding.originalVideoTimestampSeconds,
                    )}`
                  : ""}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-white/8 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <History size={14} /> {finding.feedbackHistory.length} saved
              review change
              {finding.feedbackHistory.length === 1 ? "" : "s"}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              Previous decisions, categories, severity, timestamps, and notes
              remain in local history.
            </p>
          </div>

          <button
            type="button"
            className="secondary-button w-full justify-center text-red-200"
            disabled={busy}
            onClick={() => void onDelete(finding.id)}
          >
            <Trash2 size={15} /> Delete finding
          </button>
        </aside>
      </div>
    </article>
  );
}

function EvidenceCard({ evidence }: { evidence: Finding["evidence"][number] }) {
  const isUnknown = evidence.evidenceClass === "MISSING_CONTEXT";
  const isInference = evidence.evidenceClass === "INFERENCE";
  const isReplay = evidence.evidenceClass === "REPLAY_CONFIRMED_FACT";
  return (
    <article
      className={`rounded-xl border p-4 ${
        isUnknown
          ? "border-amber-300/15 bg-amber-300/5"
          : isInference
            ? "border-sky-300/15 bg-sky-300/5"
            : "border-white/8 bg-black/15"
      }`}
    >
      <h4 className="flex items-start gap-2 text-xs font-bold tracking-[0.08em] text-slate-200 uppercase">
        {isUnknown ? (
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-300" size={14} />
        ) : isReplay ? (
          <ShieldCheck className="mt-0.5 shrink-0 text-[#b8ff2c]" size={14} />
        ) : (
          <Eye className="mt-0.5 shrink-0 text-sky-300" size={14} />
        )}
        {evidenceLabels[evidence.evidenceClass] ?? evidence.evidenceClass}
      </h4>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        {evidence.summary}
      </p>
      <p className="mt-3 text-[10px] font-semibold tracking-[0.08em] text-slate-600 uppercase">
        {evidence.sourceType.replaceAll("_", " ")}
        {evidence.confidence != null
          ? ` · ${Math.round(evidence.confidence * 100)}%`
          : ""}
      </p>
    </article>
  );
}
