"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Captions,
  CheckCircle2,
  LoaderCircle,
  Mic,
  Play,
  Save,
  Search,
  Square,
} from "lucide-react";

import { formatDuration } from "@/lib/time";
import type {
  AudioTrackDto,
  TranscriptSegmentDto,
  TranscriptionJobDto,
  TranscriptionStateDto,
} from "@/lib/transcription";

const ACTIVE_STATUSES = new Set([
  "QUEUED",
  "EXTRACTING",
  "TRANSCRIBING",
  "SAVING",
]);

export function TranscriptionStudio({
  projectId,
  initialState,
}: {
  projectId: string;
  initialState: TranscriptionStateDto;
}) {
  const [transcription, setTranscription] = useState(initialState);
  const [selectedTrackId, setSelectedTrackId] = useState(
    initialState.job?.audioTrackId ?? initialState.recommendedTrackId ?? "",
  );
  const [query, setQuery] = useState("");
  const [requestState, setRequestState] = useState<
    "idle" | "starting" | "cancelling"
  >("idle");
  const [savingSegmentId, setSavingSegmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = Boolean(
    transcription.job && ACTIVE_STATUSES.has(transcription.job.status),
  );

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/transcription`,
          { cache: "no-store" },
        );
        const body = (await response.json()) as {
          transcription?: TranscriptionStateDto;
          error?: { message?: string };
        };
        if (!response.ok || !body.transcription) {
          throw new Error(
            body.error?.message || "Transcription status could not be loaded.",
          );
        }
        if (!cancelled) {
          setTranscription(body.transcription);
          setError(null);
        }
      } catch (reason) {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Transcription status could not be loaded.",
          );
        }
      }
    }

    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [active, projectId]);

  const filteredSegments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return transcription.segments;
    return transcription.segments.filter((segment) =>
      segment.text.toLowerCase().includes(normalized),
    );
  }, [query, transcription.segments]);

  async function startTranscription() {
    if (!selectedTrackId) {
      setError(
        "Choose the creator microphone or another audio track before starting.",
      );
      return;
    }
    setRequestState("starting");
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/transcription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioTrackId: selectedTrackId }),
      });
      const body = (await response.json()) as {
        job?: TranscriptionJobDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.job) {
        throw new Error(
          body.error?.message || "Transcription could not be started.",
        );
      }
      setTranscription((current) => ({
        ...current,
        job: body.job!,
      }));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Transcription could not be started.",
      );
    } finally {
      setRequestState("idle");
    }
  }

  async function cancelTranscription() {
    if (!transcription.job) return;
    setRequestState("cancelling");
    setError(null);
    try {
      const response = await fetch(
        `/api/transcriptions/${transcription.job.id}/cancel`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        job?: TranscriptionJobDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.job) {
        throw new Error(
          body.error?.message || "Transcription could not be cancelled.",
        );
      }
      setTranscription((current) => ({ ...current, job: body.job! }));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Transcription could not be cancelled.",
      );
    } finally {
      setRequestState("idle");
    }
  }

  function updateSegmentText(segmentId: string, text: string) {
    setTranscription((current) => ({
      ...current,
      segments: current.segments.map((segment) =>
        segment.id === segmentId ? { ...segment, text } : segment,
      ),
    }));
  }

  async function saveSegment(segment: TranscriptSegmentDto) {
    setSavingSegmentId(segment.id);
    setError(null);
    try {
      const response = await fetch(`/api/transcript-segments/${segment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: segment.text }),
      });
      const body = (await response.json()) as {
        segment?: TranscriptSegmentDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.segment) {
        throw new Error(
          body.error?.message || "That transcript line could not be saved.",
        );
      }
      setTranscription((current) => ({
        ...current,
        segments: current.segments.map((currentSegment) =>
          currentSegment.id === segment.id ? body.segment! : currentSegment,
        ),
      }));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That transcript line could not be saved.",
      );
    } finally {
      setSavingSegmentId(null);
    }
  }

  function seekTo(seconds: number) {
    const player = document.querySelector<HTMLVideoElement>(
      "#source-recording-player",
    );
    if (!player) {
      setError("The source video player is not available.");
      return;
    }
    player.currentTime = seconds;
    player.scrollIntoView({ behavior: "smooth", block: "center" });
    player.focus({ preventScroll: true });
    void player.play().catch(() => undefined);
  }

  return (
    <section
      className="panel mt-8 overflow-hidden"
      aria-labelledby="transcription-title"
    >
      <div className="flex flex-col gap-5 border-b border-white/8 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <p className="section-kicker">Local speech workspace</p>
          <h2
            id="transcription-title"
            className="font-display mt-1 text-3xl font-bold text-white uppercase"
          >
            Find the words behind the play
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Only the audio track you choose is converted to text. Processing
            stays on this Mac and the recording is streamed, not loaded into
            browser memory.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#b8ff2c]/15 bg-[#b8ff2c]/5 px-3 py-2 text-xs font-semibold text-[#d8ff8a]">
          <Mic aria-hidden="true" size={14} /> {transcription.health.modelName}·
          local
        </span>
      </div>

      <div className="grid gap-px bg-white/8 lg:grid-cols-[minmax(18rem,0.42fr)_minmax(0,1fr)]">
        <div className="bg-[#0c1013] p-5 sm:p-6">
          <label className="block" htmlFor="transcription-track">
            <span className="form-label">Audio track to transcribe</span>
            <select
              id="transcription-track"
              className="field mt-2"
              value={selectedTrackId}
              onChange={(event) => setSelectedTrackId(event.target.value)}
              disabled={active || transcription.audioTracks.length === 0}
            >
              {transcription.audioTracks.length > 1 && (
                <option value="">Choose a track…</option>
              )}
              {transcription.audioTracks.map((track, index) => (
                <option key={track.id} value={track.id}>
                  {trackLabel(
                    track,
                    index,
                    track.id === transcription.recommendedTrackId,
                  )}
                </option>
              ))}
            </select>
          </label>

          {transcription.audioTracks.length === 0 ? (
            <div className="error-box mt-4" role="status">
              This video has no audio tracks. You can still create clips, but
              there is nothing to transcribe.
            </div>
          ) : (
            <TrackDetails
              track={transcription.audioTracks.find(
                (track) => track.id === selectedTrackId,
              )}
              recommendedTrackId={transcription.recommendedTrackId}
              multiple={transcription.audioTracks.length > 1}
            />
          )}

          {!transcription.health.ready && (
            <div className="error-box mt-4" role="alert">
              {transcription.health.message}
            </div>
          )}
          {error && (
            <div className="error-box mt-4" role="alert">
              {error}
            </div>
          )}

          {active && transcription.job ? (
            <div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-300">
                  {transcription.job.stage}
                </span>
                <span className="font-mono text-[#d8ff8a]">
                  {transcription.job.progress}%
                </span>
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-white/8"
                role="progressbar"
                aria-label="Transcription progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={transcription.job.progress}
              >
                <div
                  className="h-full rounded-full bg-[#b8ff2c] transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${transcription.job.progress}%` }}
                />
              </div>
              <button
                type="button"
                className="secondary-button mt-4 w-full"
                onClick={cancelTranscription}
                disabled={
                  requestState === "cancelling" ||
                  Boolean(transcription.job.cancelRequestedAt)
                }
              >
                {requestState === "cancelling" ||
                transcription.job.cancelRequestedAt ? (
                  <LoaderCircle
                    className="animate-spin"
                    aria-hidden="true"
                    size={16}
                  />
                ) : (
                  <Square aria-hidden="true" size={14} fill="currentColor" />
                )}
                {transcription.job.cancelRequestedAt
                  ? "Cancelling…"
                  : "Cancel transcription"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="primary-button mt-5 w-full"
              onClick={startTranscription}
              disabled={
                requestState === "starting" ||
                !selectedTrackId ||
                !transcription.health.ready
              }
            >
              {requestState === "starting" ? (
                <LoaderCircle
                  className="animate-spin"
                  aria-hidden="true"
                  size={17}
                />
              ) : (
                <Captions aria-hidden="true" size={17} />
              )}
              {transcription.job?.status === "COMPLETED"
                ? "Transcribe this track again"
                : "Start local transcription"}
            </button>
          )}

          {transcription.job?.status === "ERROR" && (
            <div className="error-box mt-4" role="alert">
              <span className="font-semibold">Transcription stopped.</span>{" "}
              {transcription.job.errorMessage}
            </div>
          )}
          {transcription.job?.status === "CANCELLED" && (
            <p className="mt-4 text-xs leading-5 text-slate-500" role="status">
              Transcription was cancelled. No partial transcript was saved.
            </p>
          )}
        </div>

        <div className="min-w-0 bg-[#0c1013]">
          <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div>
              <p className="section-kicker">Transcript</p>
              <h3 className="font-display mt-1 text-2xl font-bold text-white uppercase">
                Timestamped dialogue
              </h3>
            </div>
            <label
              className="relative block sm:w-72"
              htmlFor="transcript-search"
            >
              <span className="sr-only">Search transcript</span>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-600"
                aria-hidden="true"
                size={15}
              />
              <input
                id="transcript-search"
                className="field pl-9"
                type="search"
                placeholder="Search transcript…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={transcription.segments.length === 0}
              />
            </label>
          </div>

          {transcription.segments.length === 0 ? (
            <TranscriptEmptyState job={transcription.job} active={active} />
          ) : filteredSegments.length === 0 ? (
            <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
              <div>
                <Search
                  className="mx-auto text-slate-700"
                  aria-hidden="true"
                  size={30}
                />
                <p className="mt-4 font-semibold text-slate-200">
                  No transcript lines match “{query}”.
                </p>
                <button
                  type="button"
                  className="secondary-button mt-4"
                  onClick={() => setQuery("")}
                >
                  Clear search
                </button>
              </div>
            </div>
          ) : (
            <div className="max-h-[44rem] divide-y divide-white/8 overflow-y-auto">
              {filteredSegments.map((segment) => (
                <article
                  key={segment.id}
                  className="grid gap-3 px-5 py-4 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:px-6"
                >
                  <button
                    type="button"
                    className="inline-flex h-fit w-fit items-center gap-1.5 rounded-lg border border-[#b8ff2c]/15 bg-[#b8ff2c]/5 px-2.5 py-2 font-mono text-xs font-semibold text-[#d8ff8a] hover:bg-[#b8ff2c]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8ff2c]"
                    onClick={() => seekTo(segment.startSeconds)}
                    title="Play from this timestamp"
                  >
                    <Play aria-hidden="true" size={11} fill="currentColor" />
                    {formatDuration(segment.startSeconds)}
                  </button>
                  <label className="min-w-0" htmlFor={`segment-${segment.id}`}>
                    <span className="sr-only">
                      Transcript at {formatDuration(segment.startSeconds)}
                    </span>
                    <textarea
                      id={`segment-${segment.id}`}
                      className="field min-h-20 resize-y leading-6"
                      value={segment.text}
                      maxLength={5_000}
                      onChange={(event) =>
                        updateSegmentText(segment.id, event.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary-button h-fit"
                    onClick={() => saveSegment(segment)}
                    disabled={savingSegmentId === segment.id}
                  >
                    {savingSegmentId === segment.id ? (
                      <LoaderCircle
                        className="animate-spin"
                        aria-hidden="true"
                        size={14}
                      />
                    ) : (
                      <Save aria-hidden="true" size={14} />
                    )}
                    Save
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function trackLabel(track: AudioTrackDto, index: number, recommended: boolean) {
  const name = track.title || `Audio track ${index + 1}`;
  const channels = track.channels === 1 ? "mono" : `${track.channels} channels`;
  return `${name} · ${track.codecName.toUpperCase()} · ${channels}${recommended ? " · recommended" : ""}`;
}

function TrackDetails({
  track,
  recommendedTrackId,
  multiple,
}: {
  track: AudioTrackDto | undefined;
  recommendedTrackId: string | null;
  multiple: boolean;
}) {
  if (!track) {
    return (
      <p className="mt-3 text-xs leading-5 text-amber-200/80">
        Multiple tracks were found. Nothing is preselected because their labels
        do not clearly identify the creator microphone.
      </p>
    );
  }
  const recommended = track.id === recommendedTrackId;
  return (
    <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3 text-xs leading-5 text-slate-500">
      <p className="flex items-center gap-2 font-semibold text-slate-300">
        {recommended ? (
          <CheckCircle2
            aria-hidden="true"
            size={14}
            className="text-[#b8ff2c]"
          />
        ) : multiple ? (
          <AlertTriangle
            aria-hidden="true"
            size={14}
            className="text-amber-300"
          />
        ) : (
          <Mic aria-hidden="true" size={14} className="text-[#b8ff2c]" />
        )}
        {recommended ? "Recommended source" : "Selected source"}
      </p>
      <p className="mt-1">
        {track.preferenceReason ||
          "The file does not identify what this track contains. Preview carefully before transcribing voice chat."}
      </p>
      {track.language && <p>Language tag: {track.language}</p>}
    </div>
  );
}

function TranscriptEmptyState({
  job,
  active,
}: {
  job: TranscriptionJobDto | null;
  active: boolean;
}) {
  let title = "No transcript yet";
  let description =
    "Choose the correct audio track and start local transcription. Timestamped lines will appear here.";
  if (active) {
    title = "Listening locally";
    description =
      "You can keep using the rest of the page while transcription runs.";
  } else if (job?.status === "COMPLETED") {
    title = "No recognizable speech found";
    description =
      "The selected track may contain only gameplay audio, music, or silence. Try another audio track if one is available.";
  }
  return (
    <div className="grid min-h-80 place-items-center px-6 py-12 text-center">
      <div>
        {active ? (
          <LoaderCircle
            className="mx-auto animate-spin text-[#b8ff2c]"
            aria-hidden="true"
            size={32}
          />
        ) : (
          <Captions
            className="mx-auto text-slate-700"
            aria-hidden="true"
            size={34}
          />
        )}
        <h3 className="font-display mt-4 text-2xl font-bold text-slate-200 uppercase">
          {title}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}
