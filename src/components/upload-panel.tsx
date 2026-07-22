"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  FileVideo2,
  LoaderCircle,
  UploadCloud,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { formatBytes } from "@/lib/format";

type UploadState = "idle" | "uploading" | "processing" | "error";

export function UploadPanel({ maxUploadBytes }: { maxUploadBytes: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState("");
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const busy = state === "uploading" || state === "processing";

  function chooseFile(nextFile: File | undefined) {
    setError(null);
    if (!nextFile) return;
    if (
      !nextFile.name.toLowerCase().endsWith(".mp4") ||
      !["video/mp4", "application/mp4"].includes(nextFile.type)
    ) {
      setFile(null);
      setError(
        "Choose an MP4 video. Other video formats are not supported yet.",
      );
      return;
    }
    if (nextFile.size <= 0) {
      setFile(null);
      setError("That file is empty. Choose a recorded MP4 with video in it.");
      return;
    }
    if (nextFile.size > maxUploadBytes) {
      setFile(null);
      setError(
        `That file is over the local ${formatBytes(maxUploadBytes)} upload limit.`,
      );
      return;
    }
    setFile(nextFile);
    setProjectName(nextFile.name.replace(/\.mp4$/i, ""));
  }

  function clearFile() {
    if (busy) return;
    setFile(null);
    setProjectName("");
    setProgress(0);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function upload() {
    if (!file || busy) return;
    setError(null);
    setState("uploading");
    setProgress(0);

    const body = new FormData();
    body.append("name", projectName.trim() || file.name.replace(/\.mp4$/i, ""));
    body.append("video", file);

    const request = new XMLHttpRequest();
    request.open("POST", "/api/projects");
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable)
        setProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.upload.addEventListener("load", () => setState("processing"));
    request.addEventListener("load", () => {
      const response = request.response as {
        project?: { id: string };
        error?: { message?: string };
      } | null;
      if (
        request.status >= 200 &&
        request.status < 300 &&
        response?.project?.id
      ) {
        router.push(`/projects/${response.project.id}`);
        router.refresh();
        return;
      }
      setState("error");
      setError(
        response?.error?.message ||
          "The upload could not be completed. Please try again.",
      );
    });
    request.addEventListener("error", () => {
      setState("error");
      setError(
        "The local app lost the upload connection. Your original file was not changed.",
      );
    });
    request.send(body);
  }

  return (
    <section className="panel overflow-hidden" aria-labelledby="upload-title">
      <div className="border-b border-white/8 px-6 py-5 sm:px-7">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="section-kicker">New project</p>
            <h2
              id="upload-title"
              className="font-display mt-1 text-3xl font-bold text-white uppercase"
            >
              Bring in a recording
            </h2>
          </div>
          <span className="hidden rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-400 sm:block">
            MP4 · up to {formatBytes(maxUploadBytes)}
          </span>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        {!file ? (
          <button
            type="button"
            className="group flex min-h-64 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/15 px-6 text-center transition hover:border-[#b8ff2c]/45 hover:bg-[#b8ff2c]/3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b8ff2c]"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              chooseFile(event.dataTransfer.files[0]);
            }}
          >
            <span className="grid size-16 place-items-center rounded-2xl border border-[#b8ff2c]/20 bg-[#b8ff2c]/8 text-[#b8ff2c] transition group-hover:scale-105">
              <UploadCloud aria-hidden="true" size={30} />
            </span>
            <span className="font-display mt-5 text-2xl font-bold text-white uppercase">
              Drop your gameplay here
            </span>
            <span className="mt-2 max-w-md text-sm leading-6 text-slate-400">
              Or click to choose one MP4. The recording stays on this computer
              and uploads to the local app in a stream.
            </span>
          </button>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#b8ff2c]/10 text-[#b8ff2c]">
                <FileVideo2 aria-hidden="true" size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{file.name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatBytes(file.size)}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={clearFile}
                disabled={busy}
                aria-label="Remove selected file"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            <label className="mt-6 block" htmlFor="project-name">
              <span className="form-label">Project name</span>
              <input
                id="project-name"
                className="field mt-2"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                maxLength={100}
                disabled={busy}
                placeholder="Ranked match — Club House"
              />
            </label>

            {busy && (
              <div className="mt-6" aria-live="polite">
                <div className="mb-2 flex items-center justify-between text-xs font-bold tracking-[0.12em] uppercase">
                  <span className="text-slate-300">
                    {state === "uploading"
                      ? "Uploading locally"
                      : "Reading video information"}
                  </span>
                  <span className="text-[#b8ff2c]">
                    {state === "uploading" ? `${progress}%` : "Analyzing"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className={`h-full rounded-full bg-[#b8ff2c] transition-[width] ${state === "processing" ? "animate-pulse" : ""}`}
                    style={{
                      width: state === "processing" ? "100%" : `${progress}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              className="primary-button mt-6 w-full"
              onClick={upload}
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle
                  className="animate-spin"
                  aria-hidden="true"
                  size={18}
                />
              ) : (
                <CheckCircle2 aria-hidden="true" size={18} />
              )}
              {state === "uploading"
                ? "Uploading…"
                : state === "processing"
                  ? "Reading recording…"
                  : "Create local project"}
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept="video/mp4,.mp4"
          onChange={(event) => chooseFile(event.target.files?.[0])}
          tabIndex={-1}
        />

        {error && (
          <div className="error-box mt-4" role="alert">
            <span className="font-semibold">Couldn’t use that recording.</span>{" "}
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
