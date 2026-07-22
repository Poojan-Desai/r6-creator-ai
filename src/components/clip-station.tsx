"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Download,
  Film,
  Lightbulb,
  LoaderCircle,
  Play,
  Scissors,
  Sparkles,
  Trash2,
} from "lucide-react";

import {
  CONTENT_SUGGESTION_EVENT,
  CONTENT_TONES,
  type ContentSuggestion,
  type ContentTone,
} from "@/lib/content-writing";
import { formatBytes } from "@/lib/format";
import type { ClipDto } from "@/lib/projects";
import { formatDuration, parseTimeInput } from "@/lib/time";

type FormState = "idle" | "creating";

export function ClipStation({
  projectId,
  sourceDuration,
  initialClips,
}: {
  projectId: string;
  sourceDuration: number;
  initialClips: ClipDto[];
}) {
  const [clips, setClips] = useState(initialClips);
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tone, setTone] = useState<ContentTone>("Natural");
  const [suggestion, setSuggestion] = useState<ContentSuggestion | null>(null);
  const [suggestionClipName, setSuggestionClipName] = useState("");
  const [generatingClipId, setGeneratingClipId] = useState<string | null>(null);
  const [writingError, setWritingError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const selectedDuration = useMemo(() => {
    const start = parseTimeInput(startTime);
    const end = parseTimeInput(endTime);
    return Number.isFinite(start) && Number.isFinite(end) && end > start
      ? end - start
      : null;
  }, [startTime, endTime]);

  function setTimeFromPlayer(target: "start" | "end") {
    const player = document.querySelector<HTMLVideoElement>(
      "#source-recording-player",
    );
    if (!player || !Number.isFinite(player.currentTime)) {
      setError(
        "Play or seek the source recording first, then try this button again.",
      );
      return;
    }
    const value = player.currentTime.toFixed(2);
    if (target === "start") setStartTime(value);
    else setEndTime(value);
    setError(null);
  }

  function validateForm() {
    const start = parseTimeInput(startTime);
    const end = parseTimeInput(endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return "Enter both times as seconds, MM:SS, or HH:MM:SS.";
    }
    if (start < 0 || end <= start)
      return "The end time must be later than the start time.";
    if (end > sourceDuration + 0.01) {
      return `The recording ends at ${formatDuration(sourceDuration)}. Choose an earlier end time.`;
    }
    return null;
  }

  async function createClip() {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setState("creating");
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, startTime, endTime }),
      });
      const body = (await response.json()) as {
        clip?: ClipDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.clip) {
        throw new Error(
          body.error?.message || "The clip could not be created.",
        );
      }
      setClips((current) => [body.clip!, ...current]);
      setName("");
      setStartTime("");
      setEndTime("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The clip could not be created.",
      );
    } finally {
      setState("idle");
    }
  }

  async function deleteClip(clipId: string) {
    setDeletingId(clipId);
    setError(null);
    try {
      const response = await fetch(`/api/clips/${clipId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(
          body.error?.message || "The clip could not be deleted.",
        );
      }
      setClips((current) => current.filter((clip) => clip.id !== clipId));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The clip could not be deleted.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function generateSuggestions(clip: ClipDto) {
    setGeneratingClipId(clip.id);
    setWritingError(null);
    setApplied(false);
    try {
      const response = await fetch(`/api/clips/${clip.id}/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone }),
      });
      const body = (await response.json()) as {
        suggestion?: ContentSuggestion;
        error?: { message?: string };
      };
      if (!response.ok || !body.suggestion) {
        throw new Error(
          body.error?.message || "Writing suggestions could not be generated.",
        );
      }
      setSuggestion(body.suggestion);
      setSuggestionClipName(clip.name);
    } catch (reason) {
      setWritingError(
        reason instanceof Error
          ? reason.message
          : "Writing suggestions could not be generated.",
      );
    } finally {
      setGeneratingClipId(null);
    }
  }

  function applySuggestion() {
    if (!suggestion) return;
    window.dispatchEvent(
      new CustomEvent<ContentSuggestion>(CONTENT_SUGGESTION_EVENT, {
        detail: suggestion,
      }),
    );
    setApplied(true);
    document
      .querySelector("#content-workbench-title")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section
      className="mt-8 grid gap-7 xl:grid-cols-[minmax(19rem,0.55fr)_minmax(0,1.45fr)]"
      aria-labelledby="clip-station-title"
    >
      <div className="panel h-fit p-5 sm:p-6">
        <p className="section-kicker">Clip station</p>
        <h2
          id="clip-station-title"
          className="font-display mt-1 text-3xl font-bold text-white uppercase"
        >
          Mark the moment
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Play the recording above, pause around the moment you want, then set
          the start and end.
        </p>

        <label className="mt-6 block" htmlFor="clip-name">
          <span className="form-label">Clip name</span>
          <input
            id="clip-name"
            className="field mt-2"
            placeholder={`Clip ${String(clips.length + 1).padStart(2, "0")}`}
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={state === "creating"}
          />
        </label>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <TimeField
            id="clip-start"
            label="Start time"
            value={startTime}
            placeholder="00:15"
            onChange={setStartTime}
            onUseCurrent={() => setTimeFromPlayer("start")}
            disabled={state === "creating"}
          />
          <TimeField
            id="clip-end"
            label="End time"
            value={endTime}
            placeholder="00:35"
            onChange={setEndTime}
            onUseCurrent={() => setTimeFromPlayer("end")}
            disabled={state === "creating"}
          />
        </div>

        <div className="mt-5 flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-4 py-3 text-xs">
          <span className="flex items-center gap-2 text-slate-500">
            <Clock3 aria-hidden="true" size={14} /> Selected length
          </span>
          <span className="font-semibold text-slate-200">
            {selectedDuration === null ? "—" : formatDuration(selectedDuration)}
          </span>
        </div>

        {error && (
          <div className="error-box mt-4" role="alert">
            {error}
          </div>
        )}

        <button
          type="button"
          className="primary-button mt-5 w-full"
          onClick={createClip}
          disabled={state === "creating"}
        >
          {state === "creating" ? (
            <LoaderCircle
              className="animate-spin"
              aria-hidden="true"
              size={18}
            />
          ) : (
            <Scissors aria-hidden="true" size={18} />
          )}
          {state === "creating" ? "Creating local clip…" : "Create clip"}
        </button>
        {state === "creating" && (
          <p
            className="mt-3 text-center text-xs leading-5 text-slate-600"
            aria-live="polite"
          >
            Longer or high-resolution clips can take a few minutes. Keep this
            page open.
          </p>
        )}
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-5 sm:px-6">
          <div>
            <p className="section-kicker">Outputs</p>
            <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
              Clip library
            </h2>
          </div>
          <span className="rounded-full border border-white/8 px-3 py-1.5 text-xs font-semibold text-slate-500">
            {clips.length} {clips.length === 1 ? "clip" : "clips"}
          </span>
        </div>

        {clips.length > 0 && (
          <div className="flex flex-col gap-3 border-b border-white/8 bg-[#b8ff2c]/3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Sparkles
                  className="text-[#b8ff2c]"
                  aria-hidden="true"
                  size={15}
                />
                Local writing assistant
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Choose a tone, then use a clip’s transcript to draft all six
                content fields.
              </p>
            </div>
            <label
              className="flex items-center gap-2 text-xs font-semibold text-slate-400"
              htmlFor="writing-tone"
            >
              Tone
              <select
                id="writing-tone"
                className="field w-40 py-2"
                value={tone}
                onChange={(event) => setTone(event.target.value as ContentTone)}
                disabled={Boolean(generatingClipId)}
              >
                {CONTENT_TONES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {writingError && (
          <div className="error-box m-5 sm:m-6" role="alert">
            {writingError}
          </div>
        )}

        {clips.length === 0 ? (
          <div className="grid min-h-80 place-items-center px-6 py-12 text-center">
            <div>
              <Film
                className="mx-auto text-slate-700"
                aria-hidden="true"
                size={34}
              />
              <h3 className="font-display mt-4 text-2xl font-bold text-slate-200 uppercase">
                Your first clip starts here
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                A created clip will be saved on this Mac and appear here with
                its own player and download button.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-px bg-white/8 sm:grid-cols-2">
            {clips.map((clip) => (
              <article key={clip.id} className="bg-[#0c1013] p-4 sm:p-5">
                {clip.status === "READY" ? (
                  <video
                    className="aspect-video w-full rounded-xl bg-black object-contain"
                    controls
                    preload="metadata"
                    src={`/api/media/clips/${clip.id}`}
                    aria-label={`Clip preview: ${clip.name}`}
                  />
                ) : (
                  <div className="grid aspect-video place-items-center rounded-xl border border-rose-400/15 bg-rose-400/5 p-5 text-center">
                    <div>
                      <Film
                        className="mx-auto text-rose-300/70"
                        aria-hidden="true"
                        size={24}
                      />
                      <p className="mt-3 text-sm font-semibold text-rose-100">
                        Clip creation failed
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-white">
                      {clip.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDuration(clip.startSeconds)} →{" "}
                      {formatDuration(clip.endSeconds)} ·{" "}
                      {formatDuration(clip.durationSeconds)}
                    </p>
                  </div>
                  {clip.status === "READY" && (
                    <CheckCircle2
                      className="shrink-0 text-[#b8ff2c]"
                      aria-label="Ready"
                      size={17}
                    />
                  )}
                </div>

                {clip.errorMessage && (
                  <p className="mt-3 text-xs leading-5 text-rose-200/70">
                    {clip.errorMessage}
                  </p>
                )}

                <div className="mt-4 flex items-center gap-2 border-t border-white/8 pt-4">
                  {clip.status === "READY" && (
                    <>
                      <button
                        type="button"
                        className="secondary-button flex-1"
                        onClick={() => generateSuggestions(clip)}
                        disabled={generatingClipId === clip.id}
                      >
                        {generatingClipId === clip.id ? (
                          <LoaderCircle
                            className="animate-spin"
                            aria-hidden="true"
                            size={15}
                          />
                        ) : (
                          <Lightbulb aria-hidden="true" size={15} />
                        )}
                        Write
                      </button>
                      <a
                        className="icon-button"
                        href={`/api/media/clips/${clip.id}?download=1`}
                        download
                        aria-label={`Download ${clip.name}`}
                      >
                        <Download aria-hidden="true" size={15} />
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => deleteClip(clip.id)}
                    disabled={deletingId === clip.id}
                    aria-label={`Delete ${clip.name}`}
                  >
                    {deletingId === clip.id ? (
                      <LoaderCircle
                        className="animate-spin"
                        aria-hidden="true"
                        size={16}
                      />
                    ) : (
                      <Trash2 aria-hidden="true" size={16} />
                    )}
                  </button>
                  <span className="ml-auto text-[11px] text-slate-600">
                    {clip.fileSizeBytes === null
                      ? "Not saved"
                      : formatBytes(clip.fileSizeBytes)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}

        {suggestion && (
          <SuggestionPreview
            suggestion={suggestion}
            clipName={suggestionClipName}
            tone={tone}
            applied={applied}
            onApply={applySuggestion}
          />
        )}
      </div>
    </section>
  );
}

const suggestionFields: Array<{
  key: keyof ContentSuggestion;
  label: string;
}> = [
  { key: "openingHook", label: "Opening hook" },
  { key: "voiceoverScript", label: "Full voiceover script" },
  { key: "youtubeTitle", label: "YouTube title" },
  { key: "shortFormCaption", label: "Short-form caption" },
  { key: "thumbnailText", label: "Thumbnail text" },
  { key: "editingInstructions", label: "Editing instructions" },
];

function SuggestionPreview({
  suggestion,
  clipName,
  tone,
  applied,
  onApply,
}: {
  suggestion: ContentSuggestion;
  clipName: string;
  tone: ContentTone;
  applied: boolean;
  onApply: () => void;
}) {
  return (
    <section className="border-t border-white/8 bg-black/15 px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="section-kicker">Draft ready · {tone}</p>
          <h3 className="font-display mt-1 text-2xl font-bold text-white uppercase">
            {clipName}
          </h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Generated locally from the overlapping edited transcript. Review the
            wording before publishing.
          </p>
        </div>
        <button type="button" className="primary-button" onClick={onApply}>
          {applied ? (
            <CheckCircle2 aria-hidden="true" size={16} />
          ) : (
            <Sparkles aria-hidden="true" size={16} />
          )}
          {applied ? "Added below" : "Use in content package"}
        </button>
      </div>
      <dl className="mt-5 grid gap-3 md:grid-cols-2">
        {suggestionFields.map((field) => (
          <div
            key={field.key}
            className="rounded-xl border border-white/8 bg-[#0c1013] p-4"
          >
            <dt className="text-[10px] font-bold tracking-[0.12em] text-[#b8ff2c] uppercase">
              {field.label}
            </dt>
            <dd className="mt-2 text-sm leading-6 whitespace-pre-wrap text-slate-300">
              {suggestion[field.key]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TimeField({
  id,
  label,
  value,
  placeholder,
  disabled,
  onChange,
  onUseCurrent,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onUseCurrent: () => void;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="flex items-center justify-between gap-3">
        <span className="form-label">{label}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider text-[#b8ff2c] uppercase hover:text-[#d8ff8a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b8ff2c]"
          onClick={onUseCurrent}
          disabled={disabled}
        >
          <Play aria-hidden="true" size={10} fill="currentColor" /> Use player
        </button>
      </span>
      <input
        id={id}
        className="field mt-2 font-mono"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </label>
  );
}
