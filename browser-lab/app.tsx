import { registerBriefTool, type ModelContext } from "./webmcp";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  Crosshair,
  FileDown,
  Film,
  Code2,
  LockKeyhole,
  Play,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  clockTime,
  createBrief,
  DEMO_NOTES,
  keywordSearch,
  MODEL_ID,
  parseNotes,
  type RankedNote,
} from "./core";
import "./style.css";

function App() {
  const [notes, setNotes] = useState(DEMO_NOTES);
  const [sample, setSample] = useState(true);
  const [query, setQuery] = useState(
    "team coordination before moving together",
  );
  const [results, setResults] = useState<RankedNote[]>([]);
  const [selected, setSelected] = useState<RankedNote | null>(null);
  const [mode, setMode] = useState("On-device AI");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "Ready when you are. Try the example, or add your own notes.",
  );
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [backend, setBackend] = useState("Checking demo service…");
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const version = useRef(0);
  const briefReader = useRef<() => unknown>(() => ({ available: false }));
  useEffect(() => {
    briefReader.current = () =>
      selected
        ? {
            available: true,
            markdown: createBrief(selected, query, mode, sample),
            sourceLine: selected.line,
          }
        : {
            available: false,
            message: "Run a search and select a source match first.",
          };
  }, [selected, query, mode, sample]);
  useEffect(
    () =>
      registerBriefTool(
        (document as Document & { modelContext?: ModelContext }).modelContext,
        () => briefReader.current(),
      ),
    [],
  );

  function stop() {
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    setBusy(false);
  }
  function invalidate() {
    version.current++;
    stop();
    setResults([]);
    setSelected(null);
    setError("");
  }
  useEffect(() => {
    fetch("/api/health")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) =>
        setBackend(
          data.status === "ok"
            ? "Demo service online"
            : "Using built-in sample",
        ),
      )
      .catch(() => setBackend("Using built-in sample"));
    return () => {
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(
    () => () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );

  async function loadExample() {
    invalidate();
    setVideoUrl("");
    setDuration(0);
    setSample(true);
    const expectedVersion = version.current;
    setNotes(DEMO_NOTES);
    setQuery("team coordination before moving together");
    try {
      const response = await fetch("/api/demo");
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { notes?: string };
      if (typeof data.notes !== "string") throw new Error();
      if (expectedVersion !== version.current) return;
      setNotes(data.notes);
      setBackend("Demo service online");
    } catch {
      if (expectedVersion !== version.current) return;
      setNotes(DEMO_NOTES);
      setBackend("Using built-in sample");
    }
    setStatus("Illustrative example loaded. These notes are not a real match.");
  }
  function search(ai: boolean) {
    stop();
    setError("");
    setResults([]);
    setSelected(null);
    try {
      if (!query.trim()) throw new Error("Enter what you want to find.");
      const parsed = parseNotes(notes);
      setMode(ai ? `On-device AI · ${MODEL_ID}` : "Keyword search · no AI");
      if (!ai) {
        const found = keywordSearch(parsed, query);
        setResults(found);
        setSelected(found[0] ?? null);
        setStatus(
          found.length
            ? "Keyword matches found. This mode does not use AI."
            : "No keyword matches. Try different words.",
        );
        return;
      }
      setBusy(true);
      setStatus(
        "Loading on-device AI. First use downloads model and runtime files; this can take a minute.",
      );
      worker.current = new Worker(
        new URL("./worker.js", window.location.href),
        { type: "module" },
      );
      timer.current = setTimeout(() => {
        stop();
        setError(
          "The AI download took too long. Check your connection and retry, or use keyword search.",
        );
      }, 180_000);
      worker.current.onerror = () => {
        stop();
        setError(
          "This browser could not start the AI worker. Try keyword search or another browser.",
        );
      };
      worker.current.onmessage = (event) => {
        const data = event.data;
        if (data.type === "progress") setStatus(data.message);
        if (data.type === "error") {
          stop();
          setError(data.message);
          setStatus(
            "AI is unavailable for this attempt. Retry or use keyword search.",
          );
        }
        if (data.type === "result") {
          stop();
          setResults(data.results);
          setSelected(data.results[0] ?? null);
          setStatus(
            "AI search complete. Results quote your notes exactly; check them against the recording.",
          );
        }
      };
      worker.current.postMessage({ notes: parsed, query: query.trim() });
    } catch (issue) {
      stop();
      setError(
        issue instanceof Error
          ? issue.message
          : "Check your notes and try again.",
      );
    }
  }
  function seek(note: RankedNote) {
    setSelected(note);
    if (video.current && note.seconds !== null && note.seconds <= duration)
      video.current.currentTime = note.seconds;
  }
  function download() {
    if (!selected) return;
    const url = URL.createObjectURL(
      new Blob([createBrief(selected, query, mode, sample)], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "r6-review-brief.md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <header className="topbar">
        <a className="brand" href="./">
          <span className="brand-icon">
            <Crosshair size={23} />
          </span>
          R6 <b>CREATOR AI</b>
          <span className="edition">BROWSER STUDIO</span>
        </a>
        <div className="header-links">
          <a href="#how-it-works">How it works</a>
          <a
            className="repo-link"
            href="https://github.com/Poojan-Desai/r6-creator-ai"
          >
            <Code2 size={17} /> Source <ArrowUpRight size={15} />
          </a>
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <span className="eyebrow">
              <span className="live-dot" /> PRIVATE BY DESIGN
            </span>
            <h1>
              Find the moment
              <br className="mobile-break" /> worth keeping<span>.</span>
            </h1>
            <p>
              Search your gameplay notes by meaning. Review the source. Make
              your next cut.
            </p>
          </div>
          <div className="privacy-badge">
            <LockKeyhole size={19} />
            <div>
              <strong>On your device.</strong>
              <span>No account. No paid API key.</span>
            </div>
          </div>
        </div>
        <div className="workspace">
          <section className="sources panel" aria-labelledby="sources-heading">
            <div className="section-heading">
              <div>
                <span className="step">01 / SOURCE</span>
                <h2 id="sources-heading">Your review workspace</h2>
              </div>
              <button
                className="text-button"
                onClick={() => void loadExample()}
              >
                Load example <ArrowRight size={15} />
              </button>
            </div>
            <div className="source-label">
              <span className={sample ? "pill sample" : "pill"}>
                {sample ? "ILLUSTRATIVE SAMPLE" : "YOUR NOTES"}
              </span>
              <span>Text stays in this tab</span>
            </div>
            <label htmlFor="notes">Observations or transcript</label>
            <textarea
              ref={notesRef}
              id="notes"
              maxLength={8000}
              value={notes}
              spellCheck={false}
              onChange={(event) => {
                invalidate();
                setSample(false);
                setNotes(event.target.value);
              }}
            />
            <div className="field-hint">
              <span>Add one note per line. Optional timestamps: [mm:ss].</span>
              <span>{notes.length.toLocaleString()}/8,000</span>
            </div>
            <div className="video-area">
              {videoUrl ? (
                <>
                  <video
                    ref={video}
                    src={videoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(event) =>
                      setDuration(
                        Number.isFinite(event.currentTarget.duration)
                          ? event.currentTarget.duration
                          : 0,
                      )
                    }
                    onError={() =>
                      setError(
                        "This video cannot be played here. Try an MP4 with H.264 video; your notes still work.",
                      )
                    }
                  />
                  <button
                    className="text-button"
                    onClick={() => {
                      setVideoUrl("");
                      setDuration(0);
                    }}
                  >
                    Remove video <X size={14} />
                  </button>
                </>
              ) : (
                <>
                  <div className="video-icon">
                    <Film size={25} />
                  </div>
                  <div>
                    <strong>Bring the original moment into view.</strong>
                    <p>
                      Choose a recording for local playback. AI searches your
                      text only.
                    </p>
                  </div>
                </>
              )}
              <label className="file-button">
                {videoUrl ? "Change recording" : "Choose recording"}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (!file.type.startsWith("video/")) {
                      setError("Choose a video recording.");
                      return;
                    }
                    setVideoUrl(URL.createObjectURL(file));
                    setDuration(0);
                    setError("");
                  }}
                />
              </label>
            </div>
            <p className="small-note">
              Recordings are played from your device and never uploaded. They
              are not analyzed by the search model.
            </p>
          </section>
          <section className="ai-panel panel" aria-labelledby="ai-heading">
            <div className="section-heading">
              <div>
                <span className="step">02 / DISCOVER</span>
                <h2 id="ai-heading">Find related moments</h2>
              </div>
              <Sparkles className="accent" size={23} />
            </div>
            <label htmlFor="query">What are you looking for?</label>
            <div className="search-field">
              <Search size={19} />
              <input
                id="query"
                value={query}
                maxLength={200}
                onChange={(event) => {
                  invalidate();
                  setQuery(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !busy) search(true);
                }}
              />
            </div>
            <div className="suggestions">
              {[
                "team coordination",
                "checking before entering",
                "risky solo decisions",
              ].map((value) => (
                <button
                  key={value}
                  onClick={() => {
                    invalidate();
                    setQuery(value);
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
            <button
              className="primary"
              disabled={busy}
              onClick={() => search(true)}
            >
              <Sparkles size={18} />
              {busy ? "Working on your device…" : "Find moments with AI"}
              <ArrowRight size={18} />
            </button>
            <div className="secondary-actions">
              {busy ? (
                <button
                  className="text-button"
                  onClick={() => {
                    stop();
                    setStatus("Search cancelled. Your notes are unchanged.");
                  }}
                >
                  Cancel search
                </button>
              ) : (
                <button className="text-button" onClick={() => search(false)}>
                  Use keyword search
                </button>
              )}
              <span>No API charges</span>
            </div>
            <p className="model-note">
              First AI search downloads MiniLM (~23 MB) plus its runtime from
              this site and Hugging Face. Notes and search text stay here.
              English works best.
            </p>
            <div className="status" role="status" aria-live="polite">
              {busy && <span className="spinner" />}
              {status}
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <div className="results-heading">
              <h3>Source matches</h3>
              <span>
                {results.length
                  ? mode.startsWith("On-device")
                    ? "SEMANTIC SIMILARITY"
                    : "KEYWORD MATCH"
                  : "AWAITING SEARCH"}
              </span>
            </div>
            {results.length ? (
              <div className="results">
                {results.map((note, index) => (
                  <button
                    key={note.id}
                    className={`result ${selected?.id === note.id ? "selected" : ""}`}
                    onClick={() => seek(note)}
                  >
                    <div className="result-meta">
                      <span className="rank">0{index + 1}</span>
                      <span className="timestamp">
                        <Play size={11} />
                        {clockTime(note.seconds)}
                      </span>
                      <span>Line {note.line}</span>
                      <span className="score">{note.score.toFixed(2)}</span>
                    </div>
                    <p>{note.text}</p>
                    {videoUrl &&
                      note.seconds !== null &&
                      note.seconds > duration && (
                        <span className="small-note">
                          Outside this recording’s duration.
                        </span>
                      )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Crosshair size={36} />
                <p>
                  Your next cut starts with
                  <br />a moment you can point to.
                </p>
                <span>Run a search to see matching source excerpts.</span>
              </div>
            )}
            {selected && (
              <details className="source-context">
                <summary>Complete source line {selected.line}</summary>
                <p>{selected.sourceText}</p>
              </details>
            )}
            {results.length > 0 && (
              <p className="small-note">
                Similarity ranks text; it is not confidence that an event
                happened. The model always returns nearest matches, even when
                none answers your question.
              </p>
            )}
          </section>
        </div>
        {selected && (
          <section className="brief panel">
            <div>
              <span className="step">03 / TAKE IT FORWARD</span>
              <h2>A source-backed editing brief</h2>
              <p>
                Selected: line {selected.line} at {clockTime(selected.seconds)}.
                Includes the exact note, a rule-based editing outline, and
                coaching review questions.
              </p>
            </div>
            <button className="primary" onClick={download}>
              <FileDown size={18} />
              Download brief
            </button>
          </section>
        )}
        <section className="architecture" id="how-it-works">
          <div>
            <span className="eyebrow">BUILT TO BE INSPECTED</span>
            <h2>
              A clear line between
              <br />
              evidence and inference.
            </h2>
            <a href="https://github.com/Poojan-Desai/r6-creator-ai#readme">
              Explore the full local Creator Studio <ArrowUpRight size={17} />
            </a>
          </div>
          <div className="architecture-details">
            <article>
              <span>01</span>
              <div>
                <h3>Small model. Real inference.</h3>
                <p>
                  MiniLM embeds your question and notes in a Web Worker.
                  Similarity selects exact source excerpts. The editing outline
                  uses explicit rules.
                </p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Media stays with you.</h3>
                <p>
                  The website’s Netlify backend serves only public examples and
                  health status. Your notes, recordings, and results remain in
                  this tab until you download a brief.
                </p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>The full studio runs on your Mac.</h3>
                <p>
                  Install the GitHub app for FFmpeg clips and exports, local
                  transcription, Match Replay evidence, and optional budgeted
                  cloud writing. This browser studio supports text search and
                  review; it does not render clips or recognize gameplay.
                </p>
              </div>
            </article>
          </div>
        </section>
      </main>
      <footer>
        <span>R6 Creator AI · Built by Poojan Desai</span>
        <span>{backend}</span>
        <span>Independent fan project. Not affiliated with Ubisoft.</span>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
