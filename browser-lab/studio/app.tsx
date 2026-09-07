import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  Crosshair,
  Download,
  Film,
  FolderOpen,
  LockKeyhole,
  Plus,
  Scissors,
  Search,
  Trash2,
} from "lucide-react";
import {
  clockTime,
  createBrief,
  keywordSearch,
  parseNotes,
  type RankedNote,
} from "../core";
import {
  fingerprint,
  formatTime,
  importProject,
  LIMITS,
  parseTime,
  safeDownloadName,
  validateRange,
  type Clip,
  type Project,
} from "./model";
import {
  inspectMedia,
  removeExport,
  type ExportMessage,
  type ExportRequest,
} from "./media";
import {
  deleteProject,
  keepSource,
  listProjects,
  loadSource,
  saveProject,
} from "./storage";
import "./style.css";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
function Studio() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("Opening browser storage…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [owned, setOwned] = useState(false);
  const [remember, setRemember] = useState(false);
  const [newProject, setNewProject] = useState(true);
  const [start, setStart] = useState("00:00:00.000");
  const [end, setEnd] = useState("00:00:05.000");
  const [clipName, setClipName] = useState("Highlight 1");
  const [clipId, setClipId] = useState<string | null>(null);
  const [audioTrack, setAudioTrack] = useState<number | null>(null);
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const [playhead, setPlayhead] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [exportResult, setExportResult] = useState<{
    url: string;
    blob: Blob;
    description: string;
    name: string;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RankedNote[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [searchStatus, setSearchStatus] = useState("");
  const [searchMode, setSearchMode] = useState("Keyword search");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const source = useRef<File | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const previewEnd = useRef<number | null>(null);
  const exportWorker = useRef<Worker | null>(null);
  const exportId = useRef<string | null>(null);
  const aiWorker = useRef<Worker | null>(null);
  const aiTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writes = useRef(Promise.resolve());
  const saveVersion = useRef(0);
  const busy = loading || progress !== null;

  useEffect(() => {
    try {
      const interrupted = sessionStorage.getItem("r6-studio-export");
      if (interrupted) void removeExport(interrupted);
      sessionStorage.removeItem("r6-studio-export");
    } catch {
      /* Project backups remain usable if session storage is blocked. */
    }
    listProjects()
      .then(setProjects)
      .then(() => setSaving("Edits save in this browser"))
      .catch((e) => {
        setError(errorText(e));
        setSaving("Storage unavailable");
      })
      .finally(() => setLoading(false));
    return () => {
      aiWorker.current?.terminate();
      exportWorker.current?.terminate();
      if (aiTimeout.current) clearTimeout(aiTimeout.current);
      if (exportTimeout.current) clearTimeout(exportTimeout.current);
    };
  }, []);
  useEffect(
    () => () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );
  useEffect(
    () => () => {
      if (exportResult) URL.revokeObjectURL(exportResult.url);
    },
    [exportResult],
  );
  useEffect(() => {
    if (!busy) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [busy]);

  function commit(next: Project) {
    next = { ...next, updatedAt: new Date().toISOString() };
    setProject(next);
    setProjects((previous) => [
      next,
      ...previous.filter((p) => p.id !== next.id),
    ]);
    setSaving("Saving…");
    const version = ++saveVersion.current;
    writes.current = writes.current
      .then(() => saveProject(next))
      .then(() => {
        if (version === saveVersion.current) setSaving("Saved in this browser");
      })
      .catch((e) => {
        setError(errorText(e));
        setSaving("Not saved · download a backup");
      });
  }
  function stopSearch() {
    aiWorker.current?.terminate();
    aiWorker.current = null;
    if (aiTimeout.current) clearTimeout(aiTimeout.current);
    setAiBusy(false);
  }
  function clearSearch() {
    stopSearch();
    setResults([]);
    setSearchStatus("");
  }
  function clearExport() {
    setExportResult(null);
    if (exportId.current) void removeExport(exportId.current);
    exportId.current = null;
    try {
      sessionStorage.removeItem("r6-studio-export");
    } catch {
      /* Optional restart cleanup. */
    }
  }
  function resetEditor() {
    previewEnd.current = null;
    setClipId(null);
    setClipName("Highlight 1");
    setStart("00:00:00.000");
    setAudioTrack(null);
    setPlayhead(0);
    clearSearch();
    clearExport();
    setDeleteConfirm(false);
    setQuery("");
  }
  async function openProject(next: Project) {
    if (busy) return;
    setLoading(true);
    setError("");
    resetEditor();
    setProject(next);
    setNewProject(false);
    source.current = null;
    setVideoUrl("");
    setEnd(formatTime(Math.min(30, next.media.duration)));
    try {
      const file = await loadSource(next);
      if (file && (await fingerprint(file)) === next.media.fingerprint) {
        source.current = file;
        setVideoUrl(URL.createObjectURL(file));
        setNotice("Recording reopened from this device.");
      } else
        setNotice(
          "Your edits are saved. Reselect the original recording to continue.",
        );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  async function ingest(file?: File, relink = false) {
    if (!file || busy) return;
    if (!relink && !owned) {
      setError(
        "Confirm that you own this recording or have permission to use it.",
      );
      return;
    }
    setLoading(true);
    setError("");
    setNotice("Reading the recording on your device…");
    try {
      const media = await inspectMedia(file);
      if (relink && project) {
        if (
          media.size !== project.media.size ||
          media.fingerprint !== project.media.fingerprint ||
          Math.abs(media.duration - project.media.duration) > 0.1
        )
          throw new Error(
            "This is a different recording. Select the original file so your saved clip ranges still match.",
          );
        source.current = file;
        setVideoUrl(URL.createObjectURL(file));
        setNotice("Original recording reconnected.");
      } else {
        resetEditor();
        const next: Project = {
          schema: "r6-browser-project/v1",
          id: crypto.randomUUID(),
          title:
            file.name.replace(/\.[^.]+$/, "").slice(0, 100) ||
            "Untitled project",
          updatedAt: new Date().toISOString(),
          ownershipConfirmed: true,
          media,
          notes: "",
          clips: [],
          sourceSaved: false,
        };
        source.current = file;
        setVideoUrl(URL.createObjectURL(file));
        setEnd(formatTime(Math.min(30, media.duration)));
        setNewProject(false);
        commit(next);
        if (remember) {
          try {
            await keepSource(next.id, file);
            next.sourceSaved = true;
            commit({ ...next });
            const retained = await navigator.storage
              .persist()
              .catch(() => false);
            setNotice(
              retained
                ? "Recording and edits saved on this device. Keep a downloaded backup of your edits."
                : "Recording saved in browser storage. It may be cleared by the browser; keep your original file and a project backup.",
            );
          } catch (e) {
            setNotice(`Edits are saved. ${errorText(e)}`);
          }
        } else
          setNotice(
            "Recording opened privately. Reselect it after reopening; edits save automatically.",
          );
      }
    } catch (e) {
      setError(errorText(e));
      setNotice("");
    } finally {
      setLoading(false);
    }
  }
  function currentClip(): Clip {
    if (!project) throw new Error("Open a recording first.");
    const from = parseTime(start),
      to = parseTime(end);
    validateRange(from, to, project.media.duration);
    if (!clipName.trim()) throw new Error("Give this clip a name.");
    return {
      id: clipId ?? crypto.randomUUID(),
      name: clipName.trim(),
      start: from,
      end: to,
      audioTrack,
    };
  }
  function saveClip() {
    try {
      const clip = currentClip();
      if (!project) return;
      if (!clipId && project.clips.length >= 100)
        throw new Error("Keep up to 100 clips in a project.");
      commit({
        ...project,
        clips: [...project.clips.filter((c) => c.id !== clip.id), clip],
      });
      setClipId(clip.id);
      setError("");
      setNotice("Clip range saved. Your original recording is unchanged.");
    } catch (e) {
      setError(errorText(e));
    }
  }
  function selectClip(clip: Clip) {
    setClipId(clip.id);
    setClipName(clip.name);
    setStart(formatTime(clip.start));
    setEnd(formatTime(clip.end));
    setAudioTrack(clip.audioTrack);
    if (video.current) video.current.currentTime = clip.start;
  }
  async function previewRange() {
    try {
      const clip = currentClip();
      if (!video.current) throw new Error("Reselect the recording first.");
      previewEnd.current = clip.end;
      video.current.currentTime = clip.start;
      await video.current.play();
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }
  function cancelExport() {
    exportWorker.current?.terminate();
    exportWorker.current = null;
    if (exportTimeout.current) clearTimeout(exportTimeout.current);
    setProgress(null);
    clearExport();
    setNotice("Export cancelled. No partial download was kept.");
  }
  function renderClip(preview: boolean) {
    try {
      const clip = currentClip();
      if (!source.current)
        throw new Error("Reselect the original recording before exporting.");
      if (!window.isSecureContext || !("VideoEncoder" in window))
        throw new Error(
          "Video export needs WebCodecs. Open this site in a current Chrome, Edge or Safari browser, or use the local Studio.",
        );
      clearExport();
      setError("");
      setProgress(0);
      stopSearch();
      video.current?.pause();
      const id = crypto.randomUUID();
      exportId.current = id;
      try {
        sessionStorage.setItem("r6-studio-export", id);
      } catch {
        /* Export still works without session storage. */
      }
      const worker = new Worker(
        new URL("../export-worker.js", window.location.href),
        { type: "module" },
      );
      exportWorker.current = worker;
      const finish = () => {
        worker.terminate();
        exportWorker.current = null;
        if (exportTimeout.current) clearTimeout(exportTimeout.current);
        setProgress(null);
      };
      worker.onerror = () => {
        finish();
        clearExport();
        setError(
          "The browser could not run this export. Try a shorter clip or the local Studio.",
        );
      };
      worker.onmessage = (event: MessageEvent<ExportMessage>) => {
        const data = event.data;
        if (data.type === "progress") setProgress(data.progress);
        if (data.type === "error") {
          finish();
          clearExport();
          setError(data.message);
        }
        if (data.type === "complete") {
          finish();
          setExportResult({
            url: URL.createObjectURL(data.blob),
            blob: data.blob,
            name: safeDownloadName(
              `${clip.name}${preview ? "-preview" : ""}`,
              format,
            ),
            description: `${preview ? "Preview" : "Export"} · ${data.width} × ${data.height} · ${data.duration.toFixed(2)} s · ${data.audio ? `audio track ${clip.audioTrack}` : "silent"} · ${(data.blob.size / 1024 ** 2).toFixed(1)} MB`,
          });
          setNotice(
            "Video ready. Play it below, then download it. Downloaded videos are yours to keep; this preview lasts for this session.",
          );
        }
      };
      exportTimeout.current = setTimeout(() => {
        cancelExport();
        setError(
          "Export stopped after 10 minutes. Try a shorter clip or the local Studio.",
        );
      }, 600000);
      worker.postMessage({
        file: source.current,
        id,
        start: clip.start,
        end: clip.end,
        audioTrack: clip.audioTrack,
        format,
        preview,
      } satisfies ExportRequest);
    } catch (e) {
      setError(errorText(e));
      setProgress(null);
    }
  }
  function search(ai: boolean) {
    stopSearch();
    setResults([]);
    setError("");
    try {
      if (!query.trim()) throw new Error("Enter what you want to find.");
      const notes = parseNotes(project?.notes ?? "");
      setSearchMode(ai ? "On-device AI" : "Keyword search");
      if (!ai) {
        const found = keywordSearch(notes, query);
        setResults(found);
        setSearchStatus(
          found.length
            ? "Matches from your notes. Check the recording to verify them."
            : "No matches. Try different words.",
        );
        return;
      }
      setAiBusy(true);
      setSearchStatus(
        "Downloading the free search model on first use. Your notes stay on this device.",
      );
      const worker = new Worker(new URL("../worker.js", window.location.href), {
        type: "module",
      });
      aiWorker.current = worker;
      worker.onmessage = (event) => {
        const data = event.data;
        if (data.type === "progress") setSearchStatus(data.message);
        if (data.type === "error") {
          stopSearch();
          setError(data.message);
        }
        if (data.type === "result") {
          stopSearch();
          setResults(data.results);
          setSearchStatus(
            "AI searched your notes. Results are source text, not verified gameplay events.",
          );
        }
      };
      worker.onerror = () => {
        stopSearch();
        setError("Local AI could not start. Keyword search is available.");
      };
      aiTimeout.current = setTimeout(() => {
        stopSearch();
        setError(
          "The model took too long to load. Retry or use keyword search.",
        );
      }, 180000);
      worker.postMessage({ notes, query });
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function restoreBackup(file?: File) {
    if (!file || busy) return;
    try {
      if (file.size > 200000)
        throw new Error("Choose a project JSON backup under 200 KB.");
      const next = importProject(await file.text());
      await saveProject(next);
      setProjects((p) => [next, ...p]);
      await openProject(next);
    } catch {
      setError(
        "Could not import this project. Choose a valid R6 browser project JSON backup.",
      );
    }
  }
  async function removeProject() {
    if (!project) return;
    setLoading(true);
    try {
      await writes.current;
      await deleteProject(project.id);
      setProjects((p) => p.filter((item) => item.id !== project.id));
      setProject(null);
      source.current = null;
      setVideoUrl("");
      setNewProject(true);
      resetEditor();
      setNotice(
        "Project removed from this browser. Your original recording and downloads are unchanged.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <header className="top">
        <a className="brand" href="../">
          <Crosshair size={24} /> R6 <strong>CREATOR AI</strong>
          <span>STUDIO</span>
        </a>
        <nav>
          <a href="../">
            <ArrowLeft size={16} /> Review companion
          </a>
          <a
            href="https://github.com/Poojan-Desai/r6-creator-ai#readme"
            target="_blank"
            rel="noreferrer"
          >
            Local Studio & help ↗
          </a>
        </nav>
      </header>
      <div className="app-layout">
        <aside className="library">
          <div className="section-title">
            <FolderOpen size={18} />
            <h2>My projects</h2>
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              setNewProject(true);
              setError("");
            }}
          >
            <Plus size={17} /> New project
          </button>
          <label className="file-button secondary">
            Import project backup
            <input
              aria-label="Import project backup"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                void restoreBackup(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <div className="project-list">
            {projects.length === 0 ? (
              <p>No projects yet. Open your recording to make the first cut.</p>
            ) : (
              projects.map((item) => (
                <button
                  className={`project-item ${project?.id === item.id ? "active" : ""}`}
                  key={item.id}
                  disabled={busy}
                  onClick={() => void openProject(item)}
                >
                  <Film size={17} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {clockTime(item.media.duration)} · {item.clips.length}{" "}
                      clips
                    </small>
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="privacy">
            <LockKeyhole size={18} />
            <strong>Stays on your device</strong>
            <p>
              No video uploads. No account or paid AI key. Projects are private
              to this browser.
            </p>
          </div>
        </aside>
        <main className="studio-main">
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">YOUR RECORDING. YOUR CUT.</p>
              <h1>Creator Studio</h1>
            </div>
            <span className="save-state" role="status">
              {saving}
            </span>
          </div>
          {error && (
            <div className="message error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {notice && (
            <p className="message notice" role="status">
              {notice}
            </p>
          )}
          {newProject && (
            <section className="import-panel panel">
              <div className="section-title">
                <Film size={22} />
                <h2>Open a gameplay recording</h2>
              </div>
              <p>
                Choose a video to review, trim and export. The file stays on
                your device.
              </p>
              <p className="muted">{LIMITS}</p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={owned}
                  onChange={(e) => setOwned(e.target.checked)}
                />
                I own this recording or have permission to use it.
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Keep a copy in this browser (up to 1 GB, if storage permits).
              </label>
              <div className="actions">
                <label
                  className={`file-button primary ${!owned || busy ? "disabled" : ""}`}
                >
                  Choose video
                  <input
                    aria-label="Choose video"
                    type="file"
                    accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
                    disabled={!owned || busy}
                    onChange={(e) => {
                      void ingest(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
                {project && (
                  <button disabled={busy} onClick={() => setNewProject(false)}>
                    Back to project
                  </button>
                )}
              </div>
            </section>
          )}
          {project && !newProject && (
            <>
              <div className="project-heading">
                <label>
                  Project name
                  <input
                    aria-label="Project name"
                    key={project.id}
                    defaultValue={project.title}
                    maxLength={100}
                    disabled={busy}
                    onBlur={(e) => {
                      if (e.target.value.trim())
                        commit({ ...project, title: e.target.value.trim() });
                      else e.target.value = project.title;
                    }}
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    download(
                      new Blob([JSON.stringify(project, null, 2)], {
                        type: "application/json",
                      }),
                      safeDownloadName(project.title, "json"),
                    )
                  }
                >
                  <Download size={16} /> Project backup
                </button>
              </div>
              <div className="editor-grid">
                <section className="player-panel panel">
                  <div className="player">
                    {videoUrl ? (
                      <video
                        ref={video}
                        src={videoUrl}
                        controls
                        playsInline
                        muted
                        preload="metadata"
                        aria-label="Source recording"
                        onTimeUpdate={(e) => {
                          const v = e.currentTarget;
                          setPlayhead(v.currentTime);
                          if (
                            previewEnd.current !== null &&
                            v.currentTime >= previewEnd.current
                          ) {
                            v.pause();
                            previewEnd.current = null;
                          }
                        }}
                        onError={() =>
                          setError(
                            "This browser cannot play the recording’s codec. Try an H.264 MP4 or the local Studio.",
                          )
                        }
                      />
                    ) : (
                      <div className="relink">
                        <Film size={36} />
                        <h3>Reconnect your recording</h3>
                        <p>
                          Your notes and clips are here. Select the original
                          file to play or export.
                        </p>
                        <label className="file-button primary">
                          Reselect recording
                          <input
                            aria-label="Reselect recording"
                            type="file"
                            accept=".mp4,.mov,.webm"
                            disabled={busy}
                            onChange={(e) => {
                              void ingest(e.target.files?.[0], true);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="media-meta">
                    <strong>{formatTime(playhead)}</strong>
                    <span>
                      {project.media.width} × {project.media.height} ·{" "}
                      {project.media.codec.toUpperCase()} ·{" "}
                      {(project.media.size / 1024 ** 2).toFixed(1)} MB
                    </span>
                    <span>Duration {formatTime(project.media.duration)}</span>
                  </div>
                  <p className="player-help">
                    Source playback starts muted and uses your browser’s default
                    audio track. Render a preview to hear the export’s selected
                    track.
                  </p>
                </section>
                <section className="clip-panel panel">
                  <div className="section-title">
                    <Scissors size={19} />
                    <h2>Make a clip</h2>
                  </div>
                  <fieldset disabled={busy}>
                    <label>
                      Clip name
                      <input
                        value={clipName}
                        maxLength={100}
                        onChange={(e) => setClipName(e.target.value)}
                      />
                    </label>
                    <label>
                      Start <span className="muted">hh:mm:ss or seconds</span>
                      <div className="time-field">
                        <input
                          aria-label="Clip start"
                          value={start}
                          onChange={(e) => setStart(e.target.value)}
                        />
                        <button
                          title="Use playhead for start"
                          aria-label="Use playhead for start"
                          onClick={() => setStart(formatTime(playhead))}
                        >
                          Set
                        </button>
                      </div>
                    </label>
                    <label>
                      End
                      <div className="time-field">
                        <input
                          aria-label="Clip end"
                          value={end}
                          onChange={(e) => setEnd(e.target.value)}
                        />
                        <button
                          title="Use playhead for end"
                          aria-label="Use playhead for end"
                          onClick={() => setEnd(formatTime(playhead))}
                        >
                          Set
                        </button>
                      </div>
                    </label>
                    <label>
                      Export audio
                      <select
                        value={audioTrack ?? ""}
                        onChange={(e) =>
                          setAudioTrack(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                      >
                        <option value="">Silent · no audio</option>
                        {project.media.audio.map((track) => (
                          <option key={track.number} value={track.number}>
                            {track.name} · {track.codec}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="actions">
                      <button
                        onClick={() => void previewRange()}
                        disabled={!videoUrl}
                      >
                        Play range
                      </button>
                      <button onClick={saveClip}>Save clip</button>
                    </div>
                    <label>
                      Video format
                      <select
                        value={format}
                        onChange={(e) =>
                          setFormat(e.target.value as "mp4" | "webm")
                        }
                      >
                        <option value="mp4">MP4 · H.264 / AAC</option>
                        <option value="webm">WebM · VP9 / Opus</option>
                      </select>
                    </label>
                    <div className="actions">
                      <button
                        disabled={!videoUrl}
                        onClick={() => renderClip(true)}
                      >
                        Render preview
                      </button>
                      <button
                        className="primary"
                        disabled={!videoUrl}
                        onClick={() => renderClip(false)}
                      >
                        <Download size={16} /> Export video
                      </button>
                    </div>
                  </fieldset>
                  <p className="muted">
                    Preview up to 640 px. Export up to 1920 px, 30 fps. Maximum
                    5 minutes / 256 MB. Codec support depends on your browser.
                  </p>
                  {progress !== null && (
                    <div className="export-progress" role="status">
                      <label htmlFor="render-progress">
                        Rendering locally · {Math.round(progress * 100)}%
                      </label>
                      <progress id="render-progress" max="1" value={progress} />
                      <button onClick={cancelExport}>Cancel export</button>
                      <p>Keep this tab open until the video is ready.</p>
                    </div>
                  )}
                </section>
              </div>
              {exportResult && (
                <section className="panel rendered">
                  <div>
                    <h2>Ready to download</h2>
                    <p>{exportResult.description}</p>
                    <button
                      className="primary"
                      onClick={() =>
                        download(exportResult.blob, exportResult.name)
                      }
                    >
                      <Download size={17} /> Download video
                    </button>
                  </div>
                  <video
                    aria-label="Rendered clip"
                    src={exportResult.url}
                    controls
                    playsInline
                    preload="metadata"
                  />
                </section>
              )}
              <section className="panel saved-clips">
                <div className="section-title">
                  <h2>Saved clips</h2>
                  <span>{project.clips.length}</span>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setClipId(null);
                      setClipName(`Highlight ${project.clips.length + 1}`);
                      setNotice(
                        "New clip started. Set the range, then save it.",
                      );
                    }}
                  >
                    + New clip
                  </button>
                </div>
                {!project.clips.length ? (
                  <p className="muted">
                    Save a range to return to it later. Your recording is never
                    changed.
                  </p>
                ) : (
                  <div className="clip-list">
                    {project.clips.map((clip) => (
                      <div
                        key={clip.id}
                        className={clip.id === clipId ? "selected-clip" : ""}
                      >
                        <button
                          disabled={busy}
                          onClick={() => selectClip(clip)}
                        >
                          <Scissors size={16} />
                          <strong>{clip.name}</strong>
                          <span>
                            {formatTime(clip.start)} → {formatTime(clip.end)}
                          </span>
                        </button>
                        <button
                          className="icon"
                          disabled={busy}
                          aria-label={`Remove ${clip.name}`}
                          onClick={() => {
                            commit({
                              ...project,
                              clips: project.clips.filter(
                                (c) => c.id !== clip.id,
                              ),
                            });
                            if (clipId === clip.id) setClipId(null);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section className="panel evidence">
                <div className="section-title">
                  <Search size={19} />
                  <h2>Find moments in your notes</h2>
                </div>
                <p>
                  Paste observations or a transcript with [mm:ss] or [hh:mm:ss]
                  timestamps. Search runs on-device; it does not recognize
                  gameplay in the video.
                </p>
                <div className="evidence-grid">
                  <label>
                    Notes / transcript
                    <textarea
                      rows={7}
                      maxLength={8000}
                      placeholder="[00:12] We checked the doorway with a drone before moving together."
                      value={project.notes}
                      disabled={busy}
                      onChange={(e) => {
                        clearSearch();
                        commit({ ...project, notes: e.target.value });
                      }}
                    />
                  </label>
                  <div>
                    <label>
                      What are you looking for?
                      <input
                        value={query}
                        maxLength={200}
                        placeholder="Team coordination before moving"
                        disabled={busy}
                        onChange={(e) => {
                          clearSearch();
                          setQuery(e.target.value);
                        }}
                      />
                    </label>
                    <div className="actions">
                      <button
                        disabled={busy || aiBusy}
                        onClick={() => search(false)}
                      >
                        Keyword search
                      </button>
                      <button
                        className="primary"
                        disabled={busy || aiBusy}
                        onClick={() => search(true)}
                      >
                        Search with local AI
                      </button>
                      {aiBusy && (
                        <button
                          onClick={() => {
                            stopSearch();
                            setSearchStatus("Search cancelled.");
                          }}
                        >
                          Cancel search
                        </button>
                      )}
                    </div>
                    <p className="muted" role="status">
                      {searchStatus ||
                        "First AI use downloads a free model. Keyword search needs no model."}
                    </p>
                    {results.map((note) => (
                      <article className="search-result" key={note.id}>
                        <strong>
                          Source line {note.line} · {clockTime(note.seconds)}
                        </strong>
                        <p>{note.text}</p>
                        <details>
                          <summary>Complete source line</summary>
                          <p>{note.sourceText}</p>
                        </details>
                        <div className="actions">
                          <button
                            disabled={
                              !videoUrl ||
                              note.seconds === null ||
                              note.seconds >= project.media.duration
                            }
                            onClick={() => {
                              if (video.current && note.seconds !== null) {
                                previewEnd.current = null;
                                video.current.currentTime = note.seconds;
                                setStart(formatTime(note.seconds));
                                setEnd(
                                  formatTime(
                                    Math.min(
                                      project.media.duration,
                                      note.seconds + 15,
                                    ),
                                  ),
                                );
                                setClipId(null);
                              }
                            }}
                          >
                            Review moment
                          </button>
                          <button
                            onClick={() =>
                              download(
                                new Blob(
                                  [createBrief(note, query, searchMode, false)],
                                  { type: "text/markdown" },
                                ),
                                "r6-review-brief.md",
                              )
                            }
                          >
                            Download brief
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
              <div className="project-footer">
                <p>
                  Browser data can be cleared or evicted. Keep your original
                  recording and download project backups. Backups contain notes,
                  filenames and clip ranges, but no video.
                </p>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => setDeleteConfirm(true)}
                >
                  Delete project
                </button>
                {deleteConfirm && (
                  <div role="alert">
                    <p>
                      Delete this project and its saved browser copy? Your
                      original file and downloads stay intact.
                    </p>
                    <button
                      className="danger"
                      onClick={() => void removeProject()}
                    >
                      Delete from this browser
                    </button>
                    <button onClick={() => setDeleteConfirm(false)}>
                      Keep project
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          <details className="limits panel">
            <summary>Browser support & full local Studio</summary>
            <p>
              This website supports local ingestion, metadata, playback, saved
              notes and clip ranges, on-device text search, previews and
              single-clip export. MP4 and WebM encoding depend on browser
              codecs; try current desktop Chrome or Edge first. Unsupported
              formats fail with a message instead of dropping tracks.
            </p>
            <p>
              The local Studio still handles native FFmpeg editing, large or
              long exports, Match Replay parsing, Whisper transcription,
              multitrack timelines, narration, captions and Coaching Lab. Those
              tools need a computer with local storage and native processes;
              they are not hosted in Netlify Functions.
            </p>
            <p>
              No paid cloud AI is used. Only site assets and the free search
              model are downloaded. Recordings, filenames and notes are not sent
              to a server.
            </p>
            <a
              href="https://github.com/Poojan-Desai/r6-creator-ai/blob/main/docs/WEB-STUDIO.md"
              target="_blank"
              rel="noreferrer"
            >
              Read setup, privacy and compatibility details ↗
            </a>
          </details>
        </main>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Studio />);
