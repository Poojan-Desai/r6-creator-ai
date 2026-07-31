"use client";

import {
  Archive,
  FileUp,
  FolderOpen,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { formatBytes } from "@/lib/format";
import type { ReplayPackageDto } from "@/lib/replays/service";

type ProviderHealth = {
  ready: boolean;
  message: string;
  version: string;
  sourceCommit: string;
  binarySha256: string | null;
};

export function ReplayLibraryClient({
  initialReplays,
  provider,
}: {
  initialReplays: ReplayPackageDto[];
  provider: ProviderHealth;
}) {
  const router = useRouter();
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [privacyMode, setPrivacyMode] = useState("ALIASES");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, []);

  function chooseFiles(nextFiles: File[]) {
    setError(null);
    const usable = nextFiles.filter(
      (file) =>
        file.name.toLowerCase().endsWith(".rec") ||
        file.name.toLowerCase().endsWith(".zip"),
    );
    if (usable.length === 0) {
      setError("Choose completed .rec round files or one replay ZIP.");
      return;
    }
    if (
      usable.some((file) => file.name.toLowerCase().endsWith(".zip")) &&
      usable.length !== 1
    ) {
      setError("Choose one ZIP by itself, or choose only .rec files.");
      return;
    }
    setFiles(usable);
    if (!displayName) {
      const folderName = usable[0]?.webkitRelativePath.split("/")[0];
      setDisplayName(
        folderName ||
          usable[0]?.name.replace(/\.(?:rec|zip)$/i, "") ||
          "My Match Replay",
      );
    }
  }

  function importReplay() {
    if (busy) return;
    if (files.length === 0) {
      setError("Choose completed .rec round files or one replay ZIP.");
      return;
    }
    if (!displayName.trim()) {
      setError("Give this Match Replay a name.");
      return;
    }
    if (!permissionConfirmed) {
      setError(
        "Confirm that you created or lawfully possess this completed Match Replay.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(0);
    const form = new FormData();
    form.set("displayName", displayName.trim());
    form.set("permissionConfirmed", "true");
    form.set("privacyMode", privacyMode);
    form.set("retentionPreference", "KEEP_EVERYTHING");
    form.set("notes", notes);
    for (const file of files) form.append("replay", file, file.name);
    const request = new XMLHttpRequest();
    request.open("POST", "/api/replays");
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        setProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      const payload = request.response as {
        replay?: { id: string };
        error?: { message?: string };
      } | null;
      if (request.status >= 200 && request.status < 300 && payload?.replay) {
        router.push(`/replays/${payload.replay.id}`);
        router.refresh();
        return;
      }
      setBusy(false);
      setError(
        payload?.error?.message ||
          "The Match Replay could not be imported. Existing files are safe.",
      );
    });
    request.addEventListener("error", () => {
      setBusy(false);
      setError("The local import connection was interrupted.");
    });
    request.send(form);
  }

  return (
    <div className="grid gap-7 xl:grid-cols-[minmax(22rem,0.8fr)_minmax(0,1.2fr)]">
      <section className="panel h-fit p-6 sm:p-7">
        <p className="section-kicker">Primary input</p>
        <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
          Import Match Replay
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Choose a completed Rainbow Six replay folder, its .rec round files, or
          one ZIP you created. Files stay inside this app’s local data folder.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="secondary-button justify-center"
            onClick={() => folderInput.current?.click()}
            disabled={busy}
          >
            <FolderOpen size={17} /> Choose replay folder
          </button>
          <button
            type="button"
            className="secondary-button justify-center"
            onClick={() => filesInput.current?.click()}
            disabled={busy}
          >
            <FileUp size={17} /> Choose files or ZIP
          </button>
        </div>
        <input
          ref={folderInput}
          type="file"
          multiple
          accept=".rec"
          className="sr-only"
          onChange={(event) =>
            chooseFiles(Array.from(event.target.files ?? []))
          }
        />
        <input
          ref={filesInput}
          type="file"
          multiple
          accept=".rec,.zip,application/zip"
          className="sr-only"
          onChange={(event) =>
            chooseFiles(Array.from(event.target.files ?? []))
          }
        />

        <div className="mt-4 rounded-xl border border-white/8 bg-black/20 p-4">
          <p className="text-sm font-semibold text-slate-200">
            {files.length === 0
              ? "No replay selected"
              : `${files.length} file${files.length === 1 ? "" : "s"} selected`}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {files.length > 0
              ? `${formatBytes(files.reduce((sum, file) => sum + file.size, 0))} total`
              : "The app validates format bytes, duplicates, archive paths, size, and compression."}
          </p>
        </div>

        <label className="mt-5 block">
          <span className="form-label">Replay name</span>
          <input
            className="field mt-2"
            value={displayName}
            maxLength={120}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Ranked match on Chalet"
            disabled={busy}
          />
        </label>
        <label className="mt-4 block">
          <span className="form-label">Player-name privacy</span>
          <select
            className="field mt-2"
            value={privacyMode}
            onChange={(event) => setPrivacyMode(event.target.value)}
            disabled={busy}
          >
            <option value="ALIASES">Private aliases (recommended)</option>
            <option value="HASHED">Non-identifying stable hashes</option>
            <option value="REDACTED">Numbered players only</option>
            <option value="PRESERVE_LOCAL">
              Preserve names locally on this Mac
            </option>
          </select>
        </label>
        <label className="mt-4 block">
          <span className="form-label">Private notes (optional)</span>
          <textarea
            className="field mt-2 min-h-24"
            value={notes}
            maxLength={2_000}
            onChange={(event) => setNotes(event.target.value)}
            disabled={busy}
          />
        </label>
        <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-slate-300">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-[#b8ff2c]"
            checked={permissionConfirmed}
            onChange={(event) => setPermissionConfirmed(event.target.checked)}
            disabled={busy}
          />
          <span>
            I created or lawfully possess this completed Match Replay and may
            analyze it locally.
          </span>
        </label>

        {busy && (
          <div className="mt-5" aria-live="polite">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Streaming into app-managed storage</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full bg-[#b8ff2c]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        {error && (
          <div className="error-box mt-5" role="alert">
            {error}
          </div>
        )}
        <button
          type="button"
          className="primary-button mt-6 w-full justify-center"
          onClick={importReplay}
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle className="animate-spin" size={17} />
          ) : (
            <Archive size={17} />
          )}
          {busy ? "Importing locally…" : "Import Match Replay"}
        </button>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="section-kicker">Local library</p>
            <h2 className="font-display mt-1 text-4xl font-bold text-white uppercase">
              Saved Match Replays
            </h2>
          </div>
          <div
            className={`rounded-xl border px-4 py-3 text-xs leading-5 ${
              provider.ready
                ? "border-[#b8ff2c]/20 bg-[#b8ff2c]/5 text-slate-300"
                : "border-amber-300/20 bg-amber-300/5 text-amber-100"
            }`}
          >
            <span className="font-semibold">
              Parser {provider.ready ? "ready" : "setup required"}
            </span>
            <span className="block text-slate-500">{provider.message}</span>
          </div>
        </div>

        {initialReplays.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center">
            <Archive className="mx-auto text-slate-600" size={36} />
            <h3 className="font-display mt-4 text-2xl font-bold text-slate-200 uppercase">
              No Match Replays yet
            </h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
              Importing does not parse automatically. You review the saved
              package first, then deliberately run the local parser.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {initialReplays.map((replay) => (
              <Link
                key={replay.id}
                href={`/replays/${replay.id}`}
                className="project-card group"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-xl bg-[#b8ff2c]/10 text-[#b8ff2c]">
                    <Archive size={21} />
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    {replay.status}
                  </span>
                </div>
                <h3 className="font-display mt-5 truncate text-2xl font-bold text-white uppercase">
                  {replay.displayName}
                </h3>
                <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/8 pt-4 text-xs">
                  <Meta label="Rounds" value={String(replay.roundFileCount)} />
                  <Meta
                    label="Version"
                    value={replay.detectedReplayVersion ?? "Not parsed"}
                  />
                  <Meta
                    label="Size"
                    value={formatBytes(Number(replay.totalSizeBytes))}
                  />
                </div>
                <p className="mt-5 flex items-center gap-2 text-xs text-slate-600">
                  <ShieldCheck size={14} />
                  {replay.privacyMode.replaceAll("_", " ").toLowerCase()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="block text-[10px] font-bold tracking-wider text-slate-600 uppercase">
        {label}
      </span>
      <span className="mt-1 block truncate text-slate-300">{value}</span>
    </span>
  );
}
