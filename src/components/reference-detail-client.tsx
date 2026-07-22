"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  FileAudio,
  LoaderCircle,
  Pencil,
  Play,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { formatBytes } from "@/lib/format";
import type {
  ReferenceAnalysisDto,
  ReferenceDetailDto,
  ReferenceFeatureDto,
} from "@/lib/reference-library";
import { formatDuration } from "@/lib/time";

const ACTIVE = new Set([
  "QUEUED",
  "EXTRACTING",
  "TRANSCRIBING",
  "MEASURING",
  "SAVING",
]);

export function ReferenceDetailClient({
  initialReference,
}: {
  initialReference: ReferenceDetailDto;
}) {
  const referenceId = initialReference.id;
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reference, setReference] =
    useState<ReferenceDetailDto>(initialReference);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState(
    initialReference.recommendedTrackId ??
      (initialReference.audioTracks.length === 1
        ? (initialReference.audioTracks[0]?.id ?? "")
        : ""),
  );

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/references/${referenceId}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        reference?: ReferenceDetailDto;
        error?: { message?: string };
      };
      if (!response.ok || !payload.reference) {
        throw new Error(
          payload.error?.message || "The reference could not be loaded.",
        );
      }
      setReference(payload.reference);
      setSelectedTrackId(
        (current) =>
          current ||
          payload.reference?.recommendedTrackId ||
          (payload.reference?.audioTracks.length === 1
            ? (payload.reference.audioTracks[0]?.id ?? "")
            : ""),
      );
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The reference could not be loaded.",
      );
    } finally {
      // Polling failures are shown without replacing the last saved state.
    }
  }, [referenceId]);

  useEffect(() => {
    if (!reference?.analysis || !ACTIVE.has(reference.analysis.status)) return;
    const timer = window.setInterval(() => void load(), 1_250);
    return () => window.clearInterval(timer);
  }, [load, reference?.analysis]);

  async function startAnalysis() {
    setActionBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/references/${referenceId}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioTrackId: selectedTrackId || null }),
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(payload.error?.message || "Analysis could not start.");
      await load();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Analysis could not start.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function cancelAnalysis() {
    if (!reference?.analysis) return;
    setActionBusy(true);
    try {
      const response = await fetch(
        `/api/reference-analyses/${reference.analysis.id}/cancel`,
        { method: "POST" },
      );
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(payload.error?.message || "Cancellation failed.");
      await load();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Cancellation failed.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function deleteReference() {
    if (
      !window.confirm(
        "Delete this reference and its local analysis? The original file outside the app is not changed.",
      )
    )
      return;
    setActionBusy(true);
    try {
      const response = await fetch(`/api/references/${referenceId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(
          payload.error?.message || "The reference could not be deleted.",
        );
      }
      router.push("/references");
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The reference could not be deleted.",
      );
      setActionBusy(false);
    }
  }

  async function deleteTranscript() {
    if (
      !reference?.analysis ||
      !window.confirm(
        "Delete this local reference transcript? Style measurements remain, but the transcript lines are permanently removed.",
      )
    )
      return;
    const response = await fetch(
      `/api/reference-analyses/${reference.analysis.id}/transcript`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      setError(
        payload.error?.message || "The transcript could not be deleted.",
      );
      return;
    }
    await load();
  }

  const analysisActive = Boolean(
    reference.analysis && ACTIVE.has(reference.analysis.status),
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/references" className="secondary-button">
          <ArrowLeft size={16} /> Reference Library
        </Link>
        <button
          type="button"
          className="danger-button"
          onClick={() => void deleteReference()}
          disabled={actionBusy}
        >
          <Trash2 size={15} /> Delete reference
        </button>
      </div>
      <section className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
        <div className="panel overflow-hidden">
          {reference.referenceType === "LOCAL_VIDEO" ? (
            <video
              ref={videoRef}
              className="aspect-video w-full bg-black"
              controls
              preload="metadata"
              src={`/api/media/references/${reference.id}/source`}
            />
          ) : reference.embedUrl ? (
            <iframe
              className="aspect-video w-full bg-black"
              src={reference.embedUrl}
              title={`YouTube reference: ${reference.title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : null}
          <div className="p-6 sm:p-7">
            <p className="section-kicker">
              {reference.referenceType === "LOCAL_VIDEO"
                ? "Permitted local reference"
                : "YouTube reference-only link"}
            </p>
            <h1 className="font-display mt-2 text-4xl font-bold text-white uppercase sm:text-5xl">
              {reference.title}
            </h1>
            <p className="mt-2 text-slate-400">
              {reference.creatorName} · {reference.contentCategory}
            </p>
            {reference.notes && (
              <p className="mt-5 text-sm leading-6 text-slate-400">
                {reference.notes}
              </p>
            )}
            {reference.sourceUrl && (
              <a
                href={reference.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="secondary-button mt-5"
              >
                <ExternalLink size={15} /> Open source link
              </a>
            )}
          </div>
        </div>
        <aside className="space-y-5">
          <div className="panel p-6">
            <p className="section-kicker">Saved facts</p>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <Meta label="Game" value={reference.game} />
              <Meta label="Platform" value={reference.platform} />
              <Meta
                label="Source"
                value={reference.sourceType.replaceAll("_", " ")}
              />
              <Meta
                label="Metadata"
                value={reference.metadataSource.replaceAll("_", " ")}
              />
              <Meta
                label="Duration"
                value={
                  reference.durationSeconds
                    ? formatDuration(reference.durationSeconds)
                    : "Link only"
                }
              />
              <Meta
                label="Resolution"
                value={
                  reference.width && reference.height
                    ? `${reference.width}×${reference.height}`
                    : "Not available"
                }
              />
              <Meta
                label="Frame rate"
                value={
                  reference.frameRate
                    ? `${reference.frameRate.toFixed(2)} fps`
                    : "Not available"
                }
              />
              <Meta
                label="App copy"
                value={
                  reference.fileSizeBytes
                    ? formatBytes(reference.fileSizeBytes)
                    : "No local file"
                }
              />
            </dl>
          </div>
          <div className="rounded-2xl border border-[#b8ff2c]/18 bg-[#b8ff2c]/5 p-5 text-sm leading-6 text-slate-300">
            <div className="flex gap-3">
              <ShieldCheck
                className="mt-0.5 shrink-0 text-[#b8ff2c]"
                size={19}
              />
              <span>
                {reference.permissionConfirmed
                  ? "Ownership or permission was confirmed before this file was accepted."
                  : "This link is stored for official embedded reference viewing only."}
              </span>
            </div>
          </div>
        </aside>
      </section>

      {!reference.fullAnalysisAvailable ? (
        <section className="panel mt-8 p-7">
          <p className="section-kicker">Analysis availability</p>
          <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
            Link safely stored
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
            To run complete visual, audio, transcript, and editing-style
            analysis, upload a video file that you own or have permission to
            use.
          </p>
          <p className="mt-3 text-xs text-slate-500">
            The app does not download this video, captions, browser cookies, or
            unofficial transcript data.
          </p>
        </section>
      ) : (
        <section
          className="panel mt-8 p-6 sm:p-7"
          aria-labelledby="style-analysis-title"
        >
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <p className="section-kicker">Local measurable pipeline</p>
              <h2
                id="style-analysis-title"
                className="font-display mt-2 text-3xl font-bold text-white uppercase"
              >
                Style analysis
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Local Whisper and FFmpeg measure timing, speech, energy,
                silence, cuts, and transitions. Semantic style fields are
                labeled estimates and remain manually correctable.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {analysisActive ? (
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void cancelAnalysis()}
                  disabled={actionBusy}
                >
                  <X size={15} /> Cancel analysis
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void startAnalysis()}
                  disabled={actionBusy}
                >
                  <Play size={16} />{" "}
                  {reference.analysis
                    ? "Run analysis again"
                    : "Run local analysis"}
                </button>
              )}
            </div>
          </div>
          {reference.audioTracks.length > 0 && !analysisActive && (
            <label className="mt-6 block max-w-xl">
              <span className="form-label">Creator audio track</span>
              <select
                className="field mt-2"
                value={selectedTrackId}
                onChange={(event) => setSelectedTrackId(event.target.value)}
              >
                <option value="">Choose deliberately</option>
                {reference.audioTracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    Stream {track.streamIndex} ·{" "}
                    {track.title ||
                      `${track.channels} channel ${track.codecName}`}
                    {track.id === reference.recommendedTrackId
                      ? " · Recommended creator mic"
                      : ""}
                  </option>
                ))}
              </select>
              <span className="mt-2 block text-xs leading-5 text-slate-500">
                Only this selected track is transcribed. Teammate audio is never
                selected by default when tracks are separate.
              </span>
            </label>
          )}
          {reference.audioTracks.length === 0 && (
            <p className="mt-5 rounded-xl border border-white/8 bg-white/3 p-4 text-sm text-slate-400">
              <FileAudio className="mr-2 inline" size={16} />
              This file has no audio. Visual structure can still be measured;
              speech fields will be explicitly unavailable.
            </p>
          )}
          {reference.analysis && (
            <div className="mt-6">
              <div className="flex flex-wrap justify-between gap-3 text-xs font-bold tracking-wider uppercase">
                <span className="text-slate-300">
                  {reference.analysis.stage}
                </span>
                <span className="text-[#b8ff2c]">
                  {reference.analysis.progress}% ·{" "}
                  {reference.analysis.status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-[#b8ff2c] transition-[width]"
                  style={{ width: `${reference.analysis.progress}%` }}
                />
              </div>
              {reference.analysis.errorMessage && (
                <div className="error-box mt-4">
                  {reference.analysis.errorMessage}
                </div>
              )}
            </div>
          )}
          {error && (
            <div className="error-box mt-5" role="alert">
              {error}
            </div>
          )}
        </section>
      )}

      {reference.analysis?.status === "COMPLETED" && (
        <>
          <TranscriptPanel
            analysis={reference.analysis}
            videoRef={videoRef}
            onDelete={() => void deleteTranscript()}
          />
          <section className="mt-8" aria-labelledby="feature-title">
            <div>
              <p className="section-kicker">Confidence + evidence</p>
              <h2
                id="feature-title"
                className="font-display mt-1 text-4xl font-bold text-white uppercase"
              >
                Measured style features
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Green does not mean “correct.” It means the result has stronger
                observable evidence. Estimates remain review items, and every
                value can be replaced with your correction.
              </p>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {reference.analysis.features.map((feature) => (
                <FeatureCard
                  key={feature.id}
                  feature={feature}
                  onSaved={load}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function TranscriptPanel({
  analysis,
  videoRef,
  onDelete,
}: {
  analysis: ReferenceAnalysisDto;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onDelete: () => void;
}) {
  return (
    <section className="panel mt-8 p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-kicker">Selected creator track</p>
          <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
            Local reference transcript
          </h2>
        </div>
        {analysis.transcriptSegments.length > 0 && (
          <button type="button" className="danger-button" onClick={onDelete}>
            <Trash2 size={15} /> Delete transcript
          </button>
        )}
      </div>
      {analysis.transcriptSegments.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">
          No recognizable speech was found on the selected track.
        </p>
      ) : (
        <div className="mt-6 max-h-[32rem] space-y-2 overflow-y-auto pr-2">
          {analysis.transcriptSegments.map((segment) => (
            <div
              key={segment.id}
              className="flex gap-3 rounded-xl border border-white/8 bg-black/15 p-3"
            >
              <button
                type="button"
                className="shrink-0 rounded-lg bg-[#b8ff2c]/10 px-2.5 py-1 text-xs font-bold text-[#b8ff2c]"
                onClick={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = segment.startSeconds;
                    void videoRef.current.play();
                  }
                }}
              >
                <Play className="mr-1 inline" size={11} />
                {formatDuration(segment.startSeconds)}
              </button>
              <p className="text-sm leading-6 text-slate-300">{segment.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FeatureCard({
  feature,
  onSaved,
}: {
  feature: ReferenceFeatureDto;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(formatFeatureValue(feature.value, true));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const parsedValue =
        typeof feature.value === "number" && value.trim() !== ""
          ? Number(value)
          : typeof feature.value === "boolean"
            ? value === "true"
            : value.trim() === "null"
              ? null
              : value;
      if (typeof parsedValue === "number" && !Number.isFinite(parsedValue))
        throw new Error("Enter a valid number.");
      const response = await fetch(`/api/reference-features/${feature.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: parsedValue, correctionNote: note }),
      });
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          payload.error?.message || "Correction could not be saved.",
        );
      setEditing(false);
      await onSaved();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Correction could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-white">{feature.label}</h3>
          <p className="mt-1 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            {feature.source} · {Math.round(feature.confidence * 100)}%
            confidence{feature.manuallyCorrected ? " · corrected" : ""}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={`Correct ${feature.label}`}
          onClick={() => setEditing((current) => !current)}
        >
          {editing ? <X size={15} /> : <Pencil size={15} />}
        </button>
      </div>
      {!editing ? (
        <p className="mt-4 text-lg font-semibold break-words text-[#d8ff8a]">
          {formatFeatureValue(feature.value)}
          {feature.unit ? ` ${feature.unit}` : ""}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <textarea
            className="field min-h-20 resize-y"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={`Corrected value for ${feature.label}`}
          />
          <input
            className="field"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why are you correcting this? (optional)"
          />
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="button"
            className="secondary-button"
            onClick={() => void save()}
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle className="animate-spin" size={14} />
            ) : (
              <Check size={14} />
            )}{" "}
            Save correction
          </button>
        </div>
      )}
      <p className="mt-4 border-t border-white/8 pt-4 text-xs leading-5 text-slate-500">
        {feature.evidence}
      </p>
      {feature.manuallyCorrected && (
        <p className="mt-2 text-xs text-slate-600">
          <RotateCcw className="mr-1 inline" size={12} /> Original:{" "}
          {formatFeatureValue(feature.originalValue)}
        </p>
      )}
    </article>
  );
}

function formatFeatureValue(value: unknown, editable = false): string {
  if (value === null || value === undefined) return "Unavailable";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(Math.round(value * 100) / 100);
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (editable) return JSON.stringify(value, null, 2);
    return `${value.length} saved sample${value.length === 1 ? "" : "s"}`;
  }
  if (typeof value === "object") {
    if (editable) return JSON.stringify(value, null, 2);
    return Object.entries(value)
      .map(
        ([key, item]) =>
          `${key.replaceAll(/([A-Z])/g, " $1")}: ${String(item)}`,
      )
      .join(" · ");
  }
  return String(value);
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium break-words text-slate-200">{value}</dd>
    </div>
  );
}
