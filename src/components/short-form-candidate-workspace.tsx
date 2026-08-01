"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Film,
  Gauge,
  LoaderCircle,
  MessageSquareText,
  Play,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";

import type { StudioCandidateState } from "@/lib/short-form-candidates";
import type { ShortFormProductionState } from "@/lib/short-form-productions";
import { formatDuration } from "@/lib/time";
import { ShortFormPlanningWorkspace } from "@/components/short-form-planning-workspace";

type Candidate = StudioCandidateState["candidates"][number];
type ReviewDecision = "USEFUL" | "NOT_USEFUL" | "WRONG_EVENT";

const CATEGORY_OPTIONS = [
  "KILL",
  "DEATH",
  "MULTI_KILL",
  "ROUND_WIN",
  "ROUND_LOSS",
  "MATCH_ENDING",
  "POSSIBLE_CLUTCH",
  "DEFUSER_PLANT",
  "DEFUSER_DISABLE",
  "HIGH_ACTION_GAMEPLAY",
  "LOUD_CREATOR_REACTION",
  "FUNNY_CONVERSATION",
  "RAGE_OR_FRUSTRATION",
  "FAIL_OR_MISTAKE",
  "EDUCATIONAL_EXPLANATION",
  "OTHER_INTERESTING",
] as const;

function errorMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The short-form workspace could not finish that action.";
}

function formatCategory(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function seek(candidate: Candidate, play: boolean) {
  window.dispatchEvent(
    new CustomEvent("r6-seek-source", {
      detail: {
        time: candidate.effectiveStartSeconds,
        end: candidate.effectiveEndSeconds,
        play,
      },
    }),
  );
  document
    .querySelector("#short-form-source")
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function ShortFormCandidateWorkspace({
  studioProjectId,
  initialState,
  initialProductionState,
}: {
  studioProjectId: string;
  initialState: StudioCandidateState;
  initialProductionState: ShortFormProductionState;
}) {
  const [state, setState] = useState(initialState);
  const [selectedJobId, setSelectedJobId] = useState(
    initialState.analysisJobs[0]?.id ?? "",
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState(
    initialState.candidates[0]?.id ?? "",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedCandidate = useMemo(
    () =>
      state.candidates.find(
        (candidate) => candidate.id === selectedCandidateId,
      ) ??
      state.candidates[0] ??
      null,
    [selectedCandidateId, state.candidates],
  );

  async function generate() {
    if (!selectedJobId) {
      setError("Choose a completed local analysis run first.");
      return;
    }
    setBusy("generate");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/candidates`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysisJobId: selectedJobId }),
        },
      );
      const body = (await response.json()) as {
        candidateState?: StudioCandidateState;
        error?: { message?: string };
      };
      if (!response.ok || !body.candidateState) {
        throw new Error(
          body.error?.message || "Candidates could not be generated.",
        );
      }
      setState(body.candidateState);
      setSelectedCandidateId(body.candidateState.candidates[0]?.id ?? "");
      setMessage(
        `${body.candidateState.candidates.length} evidence-supported candidate${body.candidateState.candidates.length === 1 ? "" : "s"} ready for human review.`,
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  }

  async function saveReview(
    candidate: Candidate,
    values: {
      decision: ReviewDecision;
      startSeconds: number;
      endSeconds: number;
      category: (typeof CATEGORY_OPTIONS)[number];
      note: string;
    },
  ) {
    setBusy(`review-${candidate.id}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/studio-projects/${studioProjectId}/candidates/${candidate.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: values.decision,
            correctedStartSeconds: values.startSeconds,
            correctedEndSeconds: values.endSeconds,
            correctedCategory: values.category,
            note: values.note || null,
          }),
        },
      );
      const body = (await response.json()) as {
        candidateState?: StudioCandidateState;
        error?: { message?: string };
      };
      if (!response.ok || !body.candidateState) {
        throw new Error(
          body.error?.message || "The review could not be saved.",
        );
      }
      setState(body.candidateState);
      setMessage(
        "Review saved locally. U3 does not change ranking weights from this label.",
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-7">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-kicker">U3.1 · Candidate generation</p>
            <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
              Reduce the review pass
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Fuse completed local action, audio, and transcript signals into a
              short list. These are recommendations for you to inspect, not
              confirmed gameplay facts.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <label className="min-w-64">
              <span className="form-label">Completed signal analysis</span>
              <select
                className="field mt-2"
                value={selectedJobId}
                onChange={(event) => setSelectedJobId(event.target.value)}
              >
                {state.analysisJobs.length === 0 && (
                  <option value="">No completed analysis</option>
                )}
                {state.analysisJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.analysisVersion} · {job.candidateCount} saved
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="primary-button self-end"
              disabled={!state.canGenerate || busy !== null}
              onClick={() => void generate()}
            >
              {busy === "generate" ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <Sparkles size={16} />
              )}
              Generate candidates
            </button>
          </div>
        </div>
        {!state.canGenerate && (
          <div className="mt-5 flex gap-3 rounded-xl border border-amber-300/15 bg-amber-400/6 p-4 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <p>
              Complete local signal analysis in the linked video workspace
              first. Candidate generation will not run against an empty or
              unfinished detector job.
            </p>
          </div>
        )}
        <p className="mt-4 text-xs leading-5 text-slate-600">
          {state.disclaimer}
        </p>
        {(message || error) && (
          <div
            role={error ? "alert" : "status"}
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              error
                ? "border-red-400/20 bg-red-500/8 text-red-200"
                : "border-[#b8ff2c]/20 bg-[#b8ff2c]/8 text-[#d8ff8a]"
            }`}
          >
            {error ?? message}
          </div>
        )}
      </section>

      {state.candidates.length === 0 ? (
        <section className="panel grid min-h-56 place-items-center p-8 text-center">
          <div>
            <Target className="mx-auto text-slate-700" size={32} />
            <h2 className="mt-4 font-semibold text-white">
              No unified candidates yet
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
              Choose a completed signal analysis above. If it contains no
              positive action or reaction evidence, the app will explain that
              instead of inventing a highlight.
            </p>
          </div>
        </section>
      ) : (
        <div className="grid gap-7 xl:grid-cols-[minmax(17rem,0.55fr)_minmax(0,1.45fr)]">
          <section className="panel h-fit p-4">
            <div className="flex items-center justify-between px-2 pb-3">
              <div>
                <p className="section-kicker">Ranked review queue</p>
                <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
                  {state.candidateCount} candidates
                </h2>
              </div>
              <RefreshCw className="text-slate-700" size={18} />
            </div>
            <div className="max-h-[66rem] space-y-2 overflow-auto pr-1">
              {state.candidates.map((candidate, index) => (
                <button
                  key={candidate.id}
                  type="button"
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    selectedCandidate?.id === candidate.id
                      ? "border-[#b8ff2c]/35 bg-[#b8ff2c]/7"
                      : "border-white/7 bg-black/20 hover:border-white/15"
                  }`}
                  onClick={() => {
                    setSelectedCandidateId(candidate.id);
                    seek(candidate, false);
                  }}
                >
                  <span className="text-[10px] font-bold tracking-[0.12em] text-slate-600 uppercase">
                    Rank {index + 1} · {formatCategory(candidate.category)}
                  </span>
                  <span className="mt-2 block text-sm font-bold text-white">
                    {candidate.mainEvent}
                  </span>
                  <span className="mt-2 block text-xs text-slate-500">
                    {formatDuration(candidate.effectiveStartSeconds)}–
                    {formatDuration(candidate.effectiveEndSeconds)}
                  </span>
                  <span className="mt-3 grid grid-cols-3 gap-1 text-center text-[9px] font-bold uppercase">
                    <span className="rounded-md bg-white/5 px-1 py-1.5 text-sky-200">
                      Event {Math.round(candidate.eventConfidence * 100)}%
                    </span>
                    <span className="rounded-md bg-white/5 px-1 py-1.5 text-[#d8ff8a]">
                      Potential {Math.round(candidate.contentPotentialScore)}
                    </span>
                    <span className="rounded-md bg-white/5 px-1 py-1.5 text-violet-200">
                      Style{" "}
                      {candidate.styleSimilarity === null
                        ? "N/A"
                        : Math.round(candidate.styleSimilarity)}
                    </span>
                  </span>
                  {candidate.latestReview && (
                    <span className="mt-3 inline-flex rounded-full border border-white/8 px-2 py-1 text-[9px] font-bold tracking-wide text-slate-400 uppercase">
                      {formatCategory(candidate.latestReview.decision)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {selectedCandidate && (
            <CandidateDetail
              key={`${selectedCandidate.id}-${selectedCandidate.latestReview?.updatedAt ?? "new"}`}
              candidate={selectedCandidate}
              sourceDuration={state.recording.durationSeconds}
              busy={busy === `review-${selectedCandidate.id}`}
              onSave={(values) => void saveReview(selectedCandidate, values)}
            />
          )}
        </div>
      )}
      <ShortFormPlanningWorkspace
        studioProjectId={studioProjectId}
        candidates={state.candidates}
        initialState={initialProductionState}
      />
    </div>
  );
}

function CandidateDetail({
  candidate,
  sourceDuration,
  busy,
  onSave,
}: {
  candidate: Candidate;
  sourceDuration: number;
  busy: boolean;
  onSave: (values: {
    decision: ReviewDecision;
    startSeconds: number;
    endSeconds: number;
    category: (typeof CATEGORY_OPTIONS)[number];
    note: string;
  }) => void;
}) {
  const [startSeconds, setStartSeconds] = useState(
    candidate.effectiveStartSeconds,
  );
  const [endSeconds, setEndSeconds] = useState(candidate.effectiveEndSeconds);
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>(
    CATEGORY_OPTIONS.includes(
      candidate.effectiveCategory as (typeof CATEGORY_OPTIONS)[number],
    )
      ? (candidate.effectiveCategory as (typeof CATEGORY_OPTIONS)[number])
      : "OTHER_INTERESTING",
  );
  const [note, setNote] = useState(candidate.latestReview?.note ?? "");
  const [decision, setDecision] = useState<ReviewDecision>(
    candidate.latestReview?.decision ?? "USEFUL",
  );

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-white/8 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="section-kicker">Candidate evidence</p>
            <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
              {candidate.mainEvent}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {candidate.explanation}
            </p>
          </div>
          <button
            type="button"
            className="primary-button shrink-0"
            onClick={() => seek(candidate, true)}
          >
            <Play size={15} /> Play range
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ScoreCard
            icon={Gauge}
            label="Event confidence"
            value={`${Math.round(candidate.eventConfidence * 100)}%`}
            description="How strongly local signals support an event or reaction."
          />
          <ScoreCard
            icon={Sparkles}
            label="Content Potential"
            value={`${Math.round(candidate.contentPotentialScore)}/100`}
            description="Transparent review priority—not a view prediction."
          />
          <ScoreCard
            icon={Eye}
            label="Style similarity"
            value={
              candidate.styleSimilarity === null
                ? "Not selected"
                : `${Math.round(candidate.styleSimilarity)}/100`
            }
            description="Measured fit to the selected high-level profile."
          />
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-white">
            <Film size={16} className="text-[#b8ff2c]" /> Evidence timeline
          </h3>
          <EvidenceList
            title="Video and audio"
            items={candidate.videoEvidence}
            empty="No bounded video or audio evidence was saved."
          />
          <EvidenceList
            title="Transcript"
            items={candidate.transcriptEvidence}
            empty="No timestamped transcript evidence supports this candidate."
          />
          <EvidenceList
            title="Synchronized replay"
            items={candidate.replayEvidence}
            empty="No verified synchronized replay fact supports this candidate."
          />
          {candidate.missingEvidence.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-300/15 bg-amber-400/5 p-4">
              <p className="text-xs font-bold tracking-wide text-amber-100 uppercase">
                Missing evidence
              </p>
              <ul className="mt-2 space-y-2 text-xs leading-5 text-amber-100/70">
                {candidate.missingEvidence.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          )}
          <details className="mt-4 rounded-xl border border-white/8 bg-black/15 p-4">
            <summary className="cursor-pointer text-xs font-semibold text-slate-300">
              Score formulas and versions
            </summary>
            <pre className="mt-3 overflow-auto text-[10px] leading-5 whitespace-pre-wrap text-slate-500">
              {JSON.stringify(candidate.scoreBreakdown, null, 2)}
            </pre>
            <p className="mt-3 text-[10px] text-slate-600">
              {candidate.fusionVersion} · {candidate.analysisVersion} ·{" "}
              {candidate.detectorSetVersion}
            </p>
          </details>
        </div>

        <form
          className="rounded-xl border border-white/8 bg-black/15 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSave({
              decision,
              startSeconds,
              endSeconds,
              category,
              note,
            });
          }}
        >
          <h3 className="flex items-center gap-2 font-semibold text-white">
            <MessageSquareText size={16} className="text-[#b8ff2c]" /> Human
            review
          </h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Corrections are saved as review history. They do not rewrite the
            original recommendation or automatically train a ranking model.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="form-label">Start seconds</span>
              <input
                className="field mt-2"
                type="number"
                min={0}
                max={sourceDuration}
                step="0.01"
                value={startSeconds}
                onChange={(event) =>
                  setStartSeconds(Number(event.target.value))
                }
              />
            </label>
            <label>
              <span className="form-label">End seconds</span>
              <input
                className="field mt-2"
                type="number"
                min={0}
                max={sourceDuration}
                step="0.01"
                value={endSeconds}
                onChange={(event) => setEndSeconds(Number(event.target.value))}
              />
            </label>
          </div>
          <p className="mt-2 text-[10px] text-slate-600">
            Evidence peak: {candidate.peakSeconds.toFixed(2)}s · recording:{" "}
            {sourceDuration.toFixed(2)}s
          </p>
          <label className="mt-4 block">
            <span className="form-label">Category</span>
            <select
              className="field mt-2"
              value={category}
              onChange={(event) =>
                setCategory(
                  event.target.value as (typeof CATEGORY_OPTIONS)[number],
                )
              }
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatCategory(option)}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="mt-4">
            <legend className="form-label">Decision</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["USEFUL", CheckCircle2, "Useful"],
                  ["NOT_USEFUL", XCircle, "Not useful"],
                  ["WRONG_EVENT", AlertTriangle, "Wrong event"],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`secondary-button justify-center ${
                    decision === value
                      ? "border-[#b8ff2c]/35 bg-[#b8ff2c]/8 text-white"
                      : ""
                  }`}
                  onClick={() => setDecision(value)}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="mt-4 block">
            <span className="form-label">Review note</span>
            <textarea
              className="field mt-2 min-h-24 resize-y"
              value={note}
              maxLength={2_000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What is useful, wrong, or worth changing?"
            />
          </label>
          <button type="submit" className="primary-button mt-4" disabled={busy}>
            {busy ? (
              <LoaderCircle className="animate-spin" size={15} />
            ) : (
              <Save size={15} />
            )}
            Save review
          </button>
        </form>
      </div>
    </section>
  );
}

function ScoreCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/15 p-4">
      <Icon className="text-slate-600" size={16} />
      <p className="mt-3 text-[10px] font-bold tracking-wide text-slate-600 uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-white">{value}</p>
      <p className="mt-1 text-[10px] leading-4 text-slate-600">{description}</p>
    </div>
  );
}

function EvidenceList({
  title,
  items,
  empty,
}: {
  title: string;
  items: Candidate["videoEvidence"];
  empty: string;
}) {
  return (
    <div className="mt-4 rounded-xl border border-white/8 bg-black/15 p-4">
      <p className="text-xs font-bold tracking-wide text-slate-300 uppercase">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs leading-5 text-slate-600">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item, index) => (
            <li
              key={`${item.source}-${item.timestampSeconds}-${index}`}
              className="text-xs leading-5 text-slate-500"
            >
              <button
                type="button"
                className="font-bold text-sky-200 hover:text-white"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("r6-seek-source", {
                      detail: { time: item.timestampSeconds, play: false },
                    }),
                  )
                }
              >
                {formatDuration(item.timestampSeconds)}
              </button>{" "}
              · {item.summary}
              <span className="mt-1 block text-[9px] text-slate-700">
                {item.source} · {Math.round(item.confidence * 100)}%
                {item.detectorId
                  ? ` · ${item.detectorId}@${item.detectorVersion}`
                  : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
