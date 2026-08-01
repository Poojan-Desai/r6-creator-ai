"use client";

import {
  FileAudio,
  LoaderCircle,
  Mic2,
  Music,
  Plus,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useRef, useState } from "react";

import { formatBytes } from "@/lib/format";
import type {
  LongFormMediaAssetDto,
  LongFormTimelineState,
} from "@/lib/long-form-timeline";

function errorMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The local audio action could not be completed.";
}

export function LongFormAudioPanel({
  studioProjectId,
  assets,
  onState,
  onAdd,
}: {
  studioProjectId: string;
  assets: LongFormMediaAssetDto[];
  onState: (state: LongFormTimelineState) => void;
  onAdd: (kind: "VOICEOVER" | "MUSIC", id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"VOICEOVER" | "MUSIC">("VOICEOVER");
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseFile(next: File | undefined) {
    setError(null);
    if (!next) return;
    const extension = next.name.split(".").at(-1)?.toLowerCase();
    if (
      !extension ||
      !["wav", "mp3", "m4a", "aac", "flac", "ogg"].includes(extension)
    ) {
      setError("Choose a WAV, MP3, M4A, AAC, FLAC, or OGG audio file.");
      setFile(null);
      return;
    }
    if (next.size <= 0) {
      setError("That audio file is empty.");
      setFile(null);
      return;
    }
    setFile(next);
    setName(next.name.replace(/\.[^.]+$/, "").slice(0, 100));
  }

  function upload() {
    if (!file || !name.trim() || !confirmed || busy) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    const body = new FormData();
    body.append("kind", kind);
    body.append("name", name.trim());
    body.append("permissionConfirmed", "true");
    body.append("audio", file);
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `/api/studio-projects/${studioProjectId}/media-assets`,
    );
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      const response = request.response as {
        longFormTimeline?: LongFormTimelineState;
        error?: { message?: string };
      } | null;
      setBusy(false);
      if (
        request.status >= 200 &&
        request.status < 300 &&
        response?.longFormTimeline
      ) {
        onState(response.longFormTimeline);
        setFile(null);
        setName("");
        setConfirmed(false);
        setProgress(0);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      setError(
        response?.error?.message || "The local audio upload could not finish.",
      );
    });
    request.addEventListener("error", () => {
      setBusy(false);
      setError(
        "The local app lost the upload connection. Your original audio file was not changed.",
      );
    });
    request.send(body);
  }

  async function refresh() {
    const response = await fetch(
      `/api/studio-projects/${studioProjectId}/long-form-timeline`,
    );
    const body = (await response.json()) as {
      timeline?: LongFormTimelineState;
      error?: { message?: string };
    };
    if (!response.ok || !body.timeline) {
      throw new Error(
        body.error?.message || "The timeline state could not be refreshed.",
      );
    }
    onState(body.timeline);
  }

  async function remove(asset: LongFormMediaAssetDto) {
    setError(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/media-assets/${asset.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(
          body.error?.message || "The audio asset could not be deleted.",
        );
      }
      await refresh();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-white/8 bg-black/15 p-4">
      <p className="text-xs font-bold tracking-wide text-slate-300 uppercase">
        Local voiceover and permitted music
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        Import only audio you recorded, own, or may use. Files stay on this Mac.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label>
          <span className="form-label">Audio type</span>
          <select
            className="field mt-2"
            value={kind}
            disabled={busy}
            onChange={(event) =>
              setKind(event.target.value as "VOICEOVER" | "MUSIC")
            }
          >
            <option value="VOICEOVER">My voiceover</option>
            <option value="MUSIC">Music I may use</option>
          </select>
        </label>
        <label>
          <span className="form-label">Audio name</span>
          <input
            className="field mt-2"
            value={name}
            disabled={busy}
            maxLength={100}
            placeholder="Chapter bridge take"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </div>
      <button
        type="button"
        className="secondary-button mt-3"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <UploadCloud size={14} />
        {file ? file.name : "Choose local audio"}
      </button>
      {file && (
        <p className="mt-2 text-xs text-slate-600">{formatBytes(file.size)}</p>
      )}
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".wav,.mp3,.m4a,.aac,.flac,.ogg,audio/*"
        onChange={(event) => chooseFile(event.target.files?.[0])}
      />
      <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-400">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        I recorded, own, or have permission to use this audio in my content.
      </label>
      {busy && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[10px] font-bold text-slate-500 uppercase">
            <span>Uploading locally</span>
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
        disabled={!file || !name.trim() || !confirmed || busy}
        onClick={upload}
      >
        {busy ? (
          <LoaderCircle className="animate-spin" size={14} />
        ) : kind === "VOICEOVER" ? (
          <Mic2 size={14} />
        ) : (
          <Music size={14} />
        )}
        Save local audio
      </button>

      {error && (
        <p role="alert" className="mt-3 text-xs leading-5 text-red-200">
          {error}
        </p>
      )}

      {assets.length > 0 && (
        <div className="mt-5 space-y-3 border-t border-white/8 pt-4">
          {assets.map((asset) => (
            <article
              key={asset.id}
              className="rounded-lg border border-white/7 p-3"
            >
              <div className="flex items-start gap-3">
                <FileAudio className="mt-0.5 text-slate-600" size={16} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-white">
                    {asset.name}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    {asset.kind === "VOICEOVER" ? "Voiceover" : "Music"} ·{" "}
                    {asset.durationSeconds.toFixed(1)}s ·{" "}
                    {formatBytes(asset.fileSizeBytes)}
                  </p>
                </div>
              </div>
              <audio
                className="mt-3 h-8 w-full"
                controls
                preload="metadata"
                src={`/api/media/studio-assets/${asset.id}`}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onAdd(asset.kind, asset.id)}
                >
                  <Plus size={13} /> Add to timeline
                </button>
                <button
                  type="button"
                  className="secondary-button text-red-200"
                  onClick={() => void remove(asset)}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
