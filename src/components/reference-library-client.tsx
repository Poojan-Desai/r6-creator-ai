"use client";

import { useRef, useState } from "react";
import {
  ExternalLink,
  FileVideo2,
  Link2,
  LoaderCircle,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { formatBytes } from "@/lib/format";
import type { ReferenceSummaryDto } from "@/lib/reference-library";
import { formatDuration } from "@/lib/time";

type LocalForm = {
  title: string;
  creatorName: string;
  game: string;
  platform: string;
  sourceType: string;
  sourceUrl: string;
  contentCategory: string;
  notes: string;
  thumbnailText: string;
  permissionConfirmed: boolean;
};

const initialLocalForm: LocalForm = {
  title: "",
  creatorName: "My channel",
  game: "Rainbow Six Siege",
  platform: "YouTube Shorts",
  sourceType: "OWN_CREATION",
  sourceUrl: "",
  contentCategory: "High-energy gaming",
  notes: "",
  thumbnailText: "",
  permissionConfirmed: false,
};

export function ReferenceLibraryClient({
  references,
  maxUploadBytes,
  youtubeMetadataConfigured,
}: {
  references: ReferenceSummaryDto[];
  maxUploadBytes: number;
  youtubeMetadataConfigured: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localForm, setLocalForm] = useState(initialLocalForm);
  const [localBusy, setLocalBusy] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [youtubeForm, setYoutubeForm] = useState({
    url: "",
    title: "",
    creatorName: "",
    contentCategory: "Reference inspiration",
    notes: "",
    thumbnailText: "",
  });
  const [youtubeBusy, setYoutubeBusy] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeWarning, setYoutubeWarning] = useState<string | null>(null);

  function chooseFile(next: File | undefined) {
    setLocalError(null);
    if (!next) return;
    if (
      !next.name.toLowerCase().endsWith(".mp4") ||
      !["video/mp4", "application/mp4"].includes(next.type)
    ) {
      setLocalError("Choose an MP4 reference video.");
      return;
    }
    if (next.size <= 0 || next.size > maxUploadBytes) {
      setLocalError(
        `Choose a non-empty MP4 below ${formatBytes(maxUploadBytes)}.`,
      );
      return;
    }
    setFile(next);
    setLocalForm((current) => ({
      ...current,
      title: current.title || next.name.replace(/\.mp4$/i, ""),
    }));
  }

  function updateLocal<K extends keyof LocalForm>(key: K, value: LocalForm[K]) {
    setLocalForm((current) => ({ ...current, [key]: value }));
  }

  function uploadLocal() {
    if (!file || localBusy) return;
    if (!localForm.permissionConfirmed) {
      setLocalError(
        "Confirm that you own this file or have permission to analyze it.",
      );
      return;
    }
    setLocalBusy(true);
    setLocalProgress(0);
    setLocalError(null);
    const body = new FormData();
    for (const [key, value] of Object.entries(localForm)) {
      body.append(key, String(value));
    }
    body.append("video", file);

    const request = new XMLHttpRequest();
    request.open("POST", "/api/references");
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        setLocalProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      const response = request.response as {
        reference?: { id: string };
        error?: { message?: string };
      } | null;
      if (
        request.status >= 200 &&
        request.status < 300 &&
        response?.reference
      ) {
        router.push(`/references/${response.reference.id}`);
        router.refresh();
        return;
      }
      setLocalBusy(false);
      setLocalError(
        response?.error?.message || "The local reference could not be saved.",
      );
    });
    request.addEventListener("error", () => {
      setLocalBusy(false);
      setLocalError("The local upload connection was interrupted.");
    });
    request.send(body);
  }

  async function saveYouTubeReference() {
    setYoutubeBusy(true);
    setYoutubeError(null);
    setYoutubeWarning(null);
    try {
      const response = await fetch("/api/references/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...youtubeForm,
          game: "Rainbow Six Siege",
          platform: "YouTube",
          sourceType: "REFERENCE_LINK",
        }),
      });
      const payload = (await response.json()) as {
        reference?: { id: string };
        metadataWarning?: string | null;
        error?: { message?: string };
      };
      if (!response.ok || !payload.reference) {
        throw new Error(
          payload.error?.message || "The YouTube reference could not be saved.",
        );
      }
      if (payload.metadataWarning) setYoutubeWarning(payload.metadataWarning);
      router.push(`/references/${payload.reference.id}`);
      router.refresh();
    } catch (error) {
      setYoutubeError(
        error instanceof Error ? error.message : "The link could not be saved.",
      );
    } finally {
      setYoutubeBusy(false);
    }
  }

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-6 sm:p-7" aria-labelledby="local-reference">
          <p className="section-kicker">Owned or permitted file</p>
          <h2
            id="local-reference"
            className="font-display mt-2 text-3xl font-bold text-white uppercase"
          >
            Upload a local reference
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Full local transcript and measurable style analysis are available
            only for a file you may legally analyze.
          </p>

          <button
            type="button"
            className="mt-6 flex min-h-32 w-full items-center justify-center gap-4 rounded-2xl border border-dashed border-white/15 bg-black/15 px-5 text-left hover:border-[#b8ff2c]/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b8ff2c]"
            onClick={() => fileInput.current?.click()}
            disabled={localBusy}
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#b8ff2c]/10 text-[#b8ff2c]">
              {file ? <FileVideo2 size={23} /> : <UploadCloud size={23} />}
            </span>
            <span>
              <span className="block font-semibold text-white">
                {file?.name ?? "Choose one MP4"}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                {file
                  ? formatBytes(file.size)
                  : `Streamed locally · up to ${formatBytes(maxUploadBytes)}`}
              </span>
            </span>
          </button>
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept="video/mp4,.mp4"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field
              label="Title"
              value={localForm.title}
              onChange={(value) => updateLocal("title", value)}
            />
            <Field
              label="Creator or channel"
              value={localForm.creatorName}
              onChange={(value) => updateLocal("creatorName", value)}
            />
            <Field
              label="Game"
              value={localForm.game}
              onChange={(value) => updateLocal("game", value)}
            />
            <Field
              label="Platform"
              value={localForm.platform}
              onChange={(value) => updateLocal("platform", value)}
            />
            <label>
              <span className="form-label">Source type</span>
              <select
                className="field mt-2"
                value={localForm.sourceType}
                onChange={(event) =>
                  updateLocal("sourceType", event.target.value)
                }
              >
                <option value="OWN_CREATION">I created it</option>
                <option value="OWN_CHANNEL_DOWNLOAD">
                  From my own channel
                </option>
                <option value="PERMITTED">I have permission</option>
                <option value="LICENSED">Licensed for this use</option>
              </select>
            </label>
            <Field
              label="Content category"
              value={localForm.contentCategory}
              onChange={(value) => updateLocal("contentCategory", value)}
            />
            <Field
              label="Optional source URL"
              value={localForm.sourceUrl}
              onChange={(value) => updateLocal("sourceUrl", value)}
              placeholder="https://…"
            />
            <Field
              label="Optional thumbnail text"
              value={localForm.thumbnailText}
              onChange={(value) => updateLocal("thumbnailText", value)}
            />
          </div>
          <label className="mt-4 block">
            <span className="form-label">Notes</span>
            <textarea
              className="field mt-2 min-h-24 resize-y"
              value={localForm.notes}
              onChange={(event) => updateLocal("notes", event.target.value)}
            />
          </label>
          <label className="mt-5 flex items-start gap-3 rounded-xl border border-[#b8ff2c]/20 bg-[#b8ff2c]/5 p-4 text-sm leading-6 text-slate-200">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[#b8ff2c]"
              checked={localForm.permissionConfirmed}
              onChange={(event) =>
                updateLocal("permissionConfirmed", event.target.checked)
              }
            />
            <span>
              I own this file or have permission to upload and analyze it.
            </span>
          </label>
          {localBusy && (
            <div className="mt-5" aria-live="polite">
              <div className="flex justify-between text-xs font-bold text-slate-400 uppercase">
                <span>
                  {localProgress < 100 ? "Uploading locally" : "Reading media"}
                </span>
                <span>
                  {localProgress < 100 ? `${localProgress}%` : "Processing"}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-[#b8ff2c]"
                  style={{ width: `${localProgress}%` }}
                />
              </div>
            </div>
          )}
          {localError && (
            <div className="error-box mt-4" role="alert">
              {localError}
            </div>
          )}
          <button
            type="button"
            className="primary-button mt-5 w-full"
            onClick={uploadLocal}
            disabled={!file || localBusy}
          >
            {localBusy ? (
              <LoaderCircle className="animate-spin" size={18} />
            ) : (
              <ShieldCheck size={18} />
            )}
            Save permitted reference
          </button>
        </section>

        <section
          className="panel h-fit p-6 sm:p-7"
          aria-labelledby="youtube-reference"
        >
          <p className="section-kicker">Reference-only mode</p>
          <h2
            id="youtube-reference"
            className="font-display mt-2 text-3xl font-bold text-white uppercase"
          >
            Add a YouTube link
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            The app stores the normalized link and uses the official embedded
            player. It never downloads someone else’s video or captions.
          </p>
          <div className="mt-6 space-y-4">
            <Field
              label="YouTube video or Shorts URL"
              value={youtubeForm.url}
              onChange={(url) =>
                setYoutubeForm((current) => ({ ...current, url }))
              }
              placeholder="https://www.youtube.com/shorts/…"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={`Title${youtubeMetadataConfigured ? " (fallback)" : ""}`}
                value={youtubeForm.title}
                onChange={(title) =>
                  setYoutubeForm((current) => ({ ...current, title }))
                }
              />
              <Field
                label={`Creator/channel${youtubeMetadataConfigured ? " (fallback)" : ""}`}
                value={youtubeForm.creatorName}
                onChange={(creatorName) =>
                  setYoutubeForm((current) => ({ ...current, creatorName }))
                }
              />
              <Field
                label="Content category"
                value={youtubeForm.contentCategory}
                onChange={(contentCategory) =>
                  setYoutubeForm((current) => ({ ...current, contentCategory }))
                }
              />
              <Field
                label="Optional thumbnail text"
                value={youtubeForm.thumbnailText}
                onChange={(thumbnailText) =>
                  setYoutubeForm((current) => ({ ...current, thumbnailText }))
                }
              />
            </div>
            <label className="block">
              <span className="form-label">Notes</span>
              <textarea
                className="field mt-2 min-h-24 resize-y"
                value={youtubeForm.notes}
                onChange={(event) =>
                  setYoutubeForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div className="mt-5 rounded-xl border border-white/8 bg-white/3 p-4 text-xs leading-5 text-slate-400">
            {youtubeMetadataConfigured
              ? "Official YouTube public metadata is configured. Manual fields are used if permitted metadata is unavailable."
              : "No YouTube Data API key is configured. Enter the title and creator manually; the official embed still works."}
          </div>
          {youtubeWarning && (
            <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100">
              {youtubeWarning}
            </div>
          )}
          {youtubeError && (
            <div className="error-box mt-4" role="alert">
              {youtubeError}
            </div>
          )}
          <button
            type="button"
            className="secondary-button mt-5 w-full"
            onClick={() => void saveYouTubeReference()}
            disabled={youtubeBusy}
          >
            {youtubeBusy ? (
              <LoaderCircle className="animate-spin" size={17} />
            ) : (
              <Link2 size={17} />
            )}
            Save YouTube reference
          </button>
          <p className="mt-5 text-xs leading-5 text-slate-500">
            To run complete visual, audio, transcript, and editing-style
            analysis, upload a video file that you own or have permission to
            use.
          </p>
        </section>
      </div>

      <section className="mt-12" aria-labelledby="saved-references">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="section-kicker">Teaching library</p>
            <h2
              id="saved-references"
              className="font-display mt-1 text-4xl font-bold text-white uppercase"
            >
              Saved references
            </h2>
          </div>
          <span className="text-sm text-slate-500">
            {references.length} total
          </span>
        </div>
        {references.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center text-sm text-slate-500">
            Add an owned file for full analysis or a YouTube link for legal
            reference-only viewing.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {references.map((reference) => (
              <Link
                key={reference.id}
                href={`/references/${reference.id}`}
                className="project-card group"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-xl bg-[#b8ff2c]/10 text-[#b8ff2c]">
                    {reference.referenceType === "LOCAL_VIDEO" ? (
                      <FileVideo2 size={21} />
                    ) : (
                      <ExternalLink size={21} />
                    )}
                  </span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    {reference.latestAnalysisStatus.replaceAll("_", " ")}
                  </span>
                </div>
                <h3 className="font-display mt-5 truncate text-2xl font-bold text-white uppercase">
                  {reference.title}
                </h3>
                <p className="mt-1 truncate text-sm text-slate-400">
                  {reference.creatorName}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/8 pt-4 text-xs text-slate-500">
                  <span>{reference.contentCategory}</span>
                  <span className="text-right">
                    {reference.durationSeconds
                      ? formatDuration(reference.durationSeconds)
                      : "Link only"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      <span className="form-label">{label}</span>
      <input
        className="field mt-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
