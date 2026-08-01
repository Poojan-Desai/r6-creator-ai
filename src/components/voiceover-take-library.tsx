"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  FileAudio,
  LoaderCircle,
  Mic2,
  Square,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { formatBytes } from "@/lib/format";
import type { VoiceoverState } from "@/lib/voiceover";

function errorMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The local narration action could not be completed.";
}

export function VoiceoverTakeLibrary({
  studioProjectId,
  state,
  sections,
  onState,
}: {
  studioProjectId: string;
  state: VoiceoverState;
  sections: Array<{ key: string; title: string }>;
  onState: (state: VoiceoverState) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mountedRef = useRef(true);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [scriptSectionKey, setScriptSectionKey] = useState("");
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function chooseFile(next: File | undefined) {
    setError(null);
    setMessage(null);
    if (!next) return;
    const extension = next.name.split(".").at(-1)?.toLowerCase();
    if (
      !extension ||
      !["wav", "mp3", "m4a", "aac", "flac", "ogg", "webm"].includes(extension)
    ) {
      setError("Choose a WAV, MP3, M4A, AAC, FLAC, OGG, or WebM audio file.");
      return;
    }
    if (next.size <= 0) {
      setError("That audio file is empty.");
      return;
    }
    setFile(next);
    setName(next.name.replace(/\.[^.]+$/, "").slice(0, 100));
  }

  async function startRecording() {
    setError(null);
    setMessage(null);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(
        "This browser cannot record a microphone here. Import a local narration file instead.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType =
        candidates.find((value) => MediaRecorder.isTypeSupported(value)) ?? "";
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const extension = type.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (!mountedRef.current) return;
        const next = new File(
          [blob],
          `narration-${new Date().toISOString().replaceAll(":", "-")}.${extension}`,
          { type },
        );
        setFile(next);
        setName(`Narration take ${state.takes.length + 1}`);
        setPermissionConfirmed(true);
        setRecording(false);
      });
      recorder.start(500);
      setRecording(true);
    } catch (reason) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setError(
        reason instanceof Error && reason.name === "NotAllowedError"
          ? "Microphone access was not allowed. You can import a local narration file instead."
          : errorMessage(reason),
      );
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  function upload() {
    if (!file || !name.trim() || !permissionConfirmed || busy) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    setMessage(null);
    const data = new FormData();
    data.append("kind", "VOICEOVER");
    data.append("name", name.trim());
    data.append("permissionConfirmed", "true");
    if (scriptSectionKey) data.append("scriptSectionKey", scriptSectionKey);
    data.append("audio", file);
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `/api/studio-projects/${studioProjectId}/voiceover/takes`,
    );
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      const body = request.response as {
        voiceover?: VoiceoverState;
        error?: { message?: string };
      } | null;
      setBusy(false);
      if (request.status >= 200 && request.status < 300 && body?.voiceover) {
        onState(body.voiceover);
        setFile(null);
        setName("");
        setScriptSectionKey("");
        setPermissionConfirmed(false);
        setProgress(0);
        if (inputRef.current) inputRef.current.value = "";
        setMessage("Narration take saved locally.");
      } else {
        setError(
          body?.error?.message || "The narration upload could not finish.",
        );
      }
    });
    request.addEventListener("error", () => {
      setBusy(false);
      setError(
        "The local upload connection stopped. The original audio was not changed.",
      );
    });
    request.send(data);
  }

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-white/8 p-5 sm:p-6">
        <p className="section-kicker">U5.2 · Narration takes</p>
        <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
          Record or import your own voice
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Record locally in this browser or import audio you made. Multiple
          takes stay on this Mac. No speaker identity, voiceprint, or cloned
          voice is created.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {recording ? (
            <button
              type="button"
              className="primary-button border-red-300/30 bg-red-400/15 text-red-100"
              onClick={stopRecording}
            >
              <Square size={14} /> Stop recording
            </button>
          ) : (
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => void startRecording()}
            >
              <Mic2 size={14} /> Record microphone
            </button>
          )}
          <button
            type="button"
            className="secondary-button"
            disabled={busy || recording}
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud size={14} /> Import narration
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".wav,.mp3,.m4a,.aac,.flac,.ogg,.webm,audio/*"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />
        </div>
      </div>

      {file && (
        <div className="border-b border-white/8 p-5 sm:p-6">
          <p className="text-xs text-slate-500">
            {file.name} · {formatBytes(file.size)}
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label>
              <span className="form-label">Take name</span>
              <input
                className="field mt-2"
                value={name}
                maxLength={100}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              <span className="form-label">Script section</span>
              <select
                className="field mt-2"
                value={scriptSectionKey}
                disabled={busy}
                onChange={(event) => setScriptSectionKey(event.target.value)}
              >
                <option value="">Whole script or unassigned</option>
                {sections.map((section) => (
                  <option key={section.key} value={section.key}>
                    {section.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-400">
            <input
              type="checkbox"
              checked={permissionConfirmed}
              disabled={busy}
              onChange={(event) => setPermissionConfirmed(event.target.checked)}
            />
            I recorded this narration or own and have permission to use it.
          </label>
          {busy && (
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                <span>Saving locally</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full bg-[#b8ff2c]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
          <button
            type="button"
            className="primary-button mt-4"
            disabled={!name.trim() || !permissionConfirmed || busy}
            onClick={upload}
          >
            {busy ? (
              <LoaderCircle className="animate-spin" size={14} />
            ) : (
              <FileAudio size={14} />
            )}
            Save take
          </button>
        </div>
      )}

      <div className="p-5 sm:p-6">
        {state.takes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-7 text-center">
            <Mic2 className="mx-auto text-slate-700" size={28} />
            <p className="mt-3 text-sm text-slate-500">
              No narration takes yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {state.takes.map((take) => (
              <TakeCard
                key={take.id}
                studioProjectId={studioProjectId}
                take={take}
                sections={sections}
                onState={onState}
                onError={setError}
                onMessage={setMessage}
              />
            ))}
          </div>
        )}
      </div>
      {message && (
        <p role="status" className="mx-5 mb-5 text-sm text-[#b8ff2c] sm:mx-6">
          <CheckCircle2 className="mr-2 inline" size={15} /> {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mx-5 mb-5 text-sm text-red-200 sm:mx-6">
          {error}
        </p>
      )}
    </section>
  );
}

function TakeCard({
  studioProjectId,
  take,
  sections,
  onState,
  onError,
  onMessage,
}: {
  studioProjectId: string;
  take: VoiceoverState["takes"][number];
  sections: Array<{ key: string; title: string }>;
  onState: (state: VoiceoverState) => void;
  onError: (value: string | null) => void;
  onMessage: (value: string | null) => void;
}) {
  const [name, setName] = useState(take.name);
  const [scriptSectionKey, setScriptSectionKey] = useState(
    take.scriptSectionKey ?? "",
  );
  const [alignmentStartSeconds, setAlignmentStartSeconds] = useState(
    take.alignmentStartSeconds,
  );
  const [busy, setBusy] = useState(false);
  const asset = take.processedAsset ?? take.sourceAsset;
  const sectionTitle =
    sections.find((section) => section.key === take.scriptSectionKey)?.title ??
    take.scriptSectionKey ??
    "whole script";

  async function update(extra: Record<string, unknown> = {}) {
    setBusy(true);
    onError(null);
    onMessage(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/voiceover/takes/${take.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            scriptSectionKey: scriptSectionKey || null,
            alignmentStartSeconds,
            ...extra,
          }),
        },
      );
      const body = (await response.json()) as {
        voiceover?: VoiceoverState;
        error?: { message?: string };
      };
      if (!response.ok || !body.voiceover) {
        throw new Error(
          body.error?.message || "The take settings could not be saved.",
        );
      }
      onState(body.voiceover);
      onMessage(
        extra.isActive ? "Active take selected." : "Take settings saved.",
      );
    } catch (reason) {
      onError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        `Delete "${take.name}" and its app-owned audio from this project?`,
      )
    ) {
      return;
    }
    setBusy(true);
    onError(null);
    onMessage(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/voiceover/takes/${take.id}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as {
        voiceover?: VoiceoverState;
        error?: { message?: string };
      };
      if (!response.ok || !body.voiceover) {
        throw new Error(
          body.error?.message || "The take could not be deleted.",
        );
      }
      onState(body.voiceover);
      onMessage("Narration take and its app-owned audio were deleted.");
    } catch (reason) {
      onError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border border-white/8 bg-black/15 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{take.name}</p>
          <p className="mt-1 text-[10px] text-slate-600">
            {asset.durationSeconds.toFixed(1)}s ·{" "}
            {formatBytes(asset.fileSizeBytes)} · {sectionTitle}
          </p>
        </div>
        {take.isActive && (
          <span className="rounded-full border border-[#b8ff2c]/20 bg-[#b8ff2c]/6 px-2 py-1 text-[10px] font-bold text-[#d8ff8a] uppercase">
            Active
          </span>
        )}
      </div>
      <audio
        className="mt-3 h-8 w-full"
        controls
        preload="metadata"
        src={`/api/media/studio-assets/${asset.id}`}
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="form-label">Take name</span>
          <input
            className="field mt-2"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          <span className="form-label">Script section</span>
          <select
            className="field mt-2"
            value={scriptSectionKey}
            disabled={busy}
            onChange={(event) => setScriptSectionKey(event.target.value)}
          >
            <option value="">Whole script or unassigned</option>
            {sections.map((section) => (
              <option key={section.key} value={section.key}>
                {section.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">Timeline start (seconds)</span>
          <input
            className="field mt-2"
            type="number"
            min={0}
            max={14_400}
            step="0.1"
            value={alignmentStartSeconds}
            disabled={busy}
            onChange={(event) =>
              setAlignmentStartSeconds(Number(event.target.value))
            }
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void update()}
        >
          Save settings
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy || take.isActive}
          onClick={() => void update({ isActive: true })}
        >
          <CheckCircle2 size={13} /> Select active
        </button>
        <button
          type="button"
          className="secondary-button text-red-200"
          disabled={busy}
          onClick={() => void remove()}
        >
          <Trash2 size={13} /> Delete take
        </button>
      </div>
    </article>
  );
}
