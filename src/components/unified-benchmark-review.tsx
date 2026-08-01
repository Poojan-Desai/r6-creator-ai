"use client";

import { CheckCircle2, Download, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { UnifiedBenchmarkState } from "@/lib/unified-benchmark";

async function reviewRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as {
    benchmark?: UnifiedBenchmarkState;
    error?: { message?: string };
  } | null;
  if (!response.ok || !body?.benchmark) {
    throw new Error(
      body?.error?.message ??
        "The local review-label action could not be completed.",
    );
  }
  return body.benchmark;
}

function availabilityLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export function UnifiedBenchmarkReview({
  initialState,
}: {
  initialState: UnifiedBenchmarkState;
}) {
  const [state, setState] = useState(initialState);
  const [area, setArea] = useState<"CONTENT" | "COACHING">("COACHING");
  const [projectId, setProjectId] = useState(
    initialState.projects[0]?.id ?? "",
  );
  const [category, setCategory] = useState<string>(
    initialState.categories.coaching[0]?.value ?? "USEFUL_RECOMMENDATION",
  );
  const [startSeconds, setStartSeconds] = useState("");
  const [endSeconds, setEndSeconds] = useState("");
  const [confidence, setConfidence] = useState("1");
  const [approved, setApproved] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const categories =
    area === "CONTENT" ? state.categories.content : state.categories.coaching;
  const projectNames = useMemo(
    () => new Map(state.projects.map((project) => [project.id, project.name])),
    [state.projects],
  );

  async function run(
    action: () => Promise<UnifiedBenchmarkState>,
    successMessage: string,
  ) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      setState(await action());
      setMessage(successMessage);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The local review-label action failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  function chooseArea(nextArea: "CONTENT" | "COACHING") {
    setArea(nextArea);
    const nextCategories =
      nextArea === "CONTENT"
        ? state.categories.content
        : state.categories.coaching;
    setCategory(nextCategories[0]?.value ?? "");
  }

  async function createLabel(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const next = await reviewRequest("/api/unified-review-labels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studioProjectId: projectId,
          area,
          category,
          startSeconds: startSeconds === "" ? null : Number(startSeconds),
          endSeconds: endSeconds === "" ? null : Number(endSeconds),
          reviewerConfidence: Number(confidence),
          approvedAsBenchmark: approved,
          note: note || null,
        }),
      });
      setStartSeconds("");
      setEndSeconds("");
      setApproved(false);
      setNote("");
      return next;
    }, "Local review label saved.");
  }

  return (
    <section className="panel mt-8 p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <p className="section-kicker">U8 · content and coaching review</p>
          <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
            Human labels stay separate from detector ground truth
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-400">
            Save explicit content or coaching judgments. Only labels you approve
            as benchmark evidence enter the rates. Recall remains unavailable
            without an exhaustively reviewed eligible set.
          </p>
        </div>
        <Link
          className="secondary-button"
          href="/api/unified-review-labels/export"
        >
          <Download size={15} /> Export review JSON
        </Link>
      </div>

      {(message || error) && (
        <div
          role="status"
          className={`mt-5 rounded-2xl border p-4 text-sm ${
            error
              ? "border-rose-300/20 bg-rose-300/7 text-rose-100"
              : "border-[#b8ff2c]/20 bg-[#b8ff2c]/7 text-[#d8ff8a]"
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {state.metrics.map((metric) => (
          <article
            key={metric.key}
            className="rounded-2xl border border-white/8 bg-black/15 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-white">
                {metric.label}
              </h3>
              <span className="text-[9px] font-bold tracking-[0.08em] text-slate-600 uppercase">
                {availabilityLabel(metric.availability)}
              </span>
            </div>
            <p className="font-display mt-3 text-2xl font-bold text-[#b8ff2c]">
              {metric.value === null
                ? "Unavailable"
                : `${(metric.value * 100).toFixed(1)}%`}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {metric.numerator} / {metric.denominator} approved examples
            </p>
            <details className="mt-3 text-xs leading-5 text-slate-400">
              <summary className="cursor-pointer font-semibold text-slate-300">
                How this is calculated
              </summary>
              <p className="mt-2">{metric.explanation}</p>
            </details>
          </article>
        ))}
      </div>

      <form
        className="mt-7 rounded-2xl border border-white/8 bg-black/15 p-5"
        onSubmit={createLabel}
      >
        <fieldset>
          <legend className="text-sm font-semibold text-slate-300">
            Review area
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={
                area === "CONTENT" ? "primary-button" : "secondary-button"
              }
              onClick={() => chooseArea("CONTENT")}
            >
              Content
            </button>
            <button
              type="button"
              className={
                area === "COACHING" ? "primary-button" : "secondary-button"
              }
              onClick={() => chooseArea("COACHING")}
            >
              Coaching
            </button>
          </div>
        </fieldset>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-300">
            <span className="mb-2 block">Creator Studio project</span>
            <select
              className="input-field"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              required
            >
              {state.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-300">
            <span className="mb-2 block">Review label</span>
            <select
              className="input-field"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-300">
            <span className="mb-2 block">Optional start in seconds</span>
            <input
              className="input-field"
              type="number"
              min="0"
              step="0.001"
              value={startSeconds}
              onChange={(event) => setStartSeconds(event.target.value)}
            />
          </label>
          <label className="text-sm font-semibold text-slate-300">
            <span className="mb-2 block">Optional end in seconds</span>
            <input
              className="input-field"
              type="number"
              min="0.001"
              step="0.001"
              value={endSeconds}
              onChange={(event) => setEndSeconds(event.target.value)}
            />
          </label>
          <label className="text-sm font-semibold text-slate-300">
            <span className="mb-2 block">Reviewer confidence</span>
            <select
              className="input-field"
              value={confidence}
              onChange={(event) => setConfidence(event.target.value)}
            >
              <option value="1">High · 100%</option>
              <option value="0.75">Moderate · 75%</option>
              <option value="0.5">Low · 50%</option>
            </select>
          </label>
          <label className="flex items-start gap-3 rounded-2xl border border-white/8 p-4 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={approved}
              onChange={(event) => setApproved(event.target.checked)}
            />
            <span>
              <span className="block font-semibold text-white">
                Approved as benchmark evidence
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                Use only after you deliberately reviewed the example.
              </span>
            </span>
          </label>
        </div>
        <label className="mt-4 block text-sm font-semibold text-slate-300">
          <span className="mb-2 block">Review note</span>
          <textarea
            className="input-field min-h-24"
            value={note}
            maxLength={2_000}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What did you review, and what evidence supports this label?"
          />
        </label>
        <button
          className="primary-button mt-4"
          type="submit"
          disabled={busy || state.projects.length === 0}
        >
          <Plus size={15} /> Save review label
        </button>
      </form>

      <div className="mt-7">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-2xl font-bold text-white uppercase">
            Saved review labels
          </h3>
          <span className="text-xs text-slate-600">
            {state.labels.filter((label) => label.approvedAsBenchmark).length}{" "}
            approved · {state.labels.length} total
          </span>
        </div>
        {state.labels.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">
            No content or coaching review labels yet. Detector ground-truth
            labels remain unchanged.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {state.labels.map((label) => (
              <article
                key={label.id}
                className="rounded-2xl border border-white/8 bg-black/15 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold tracking-[0.08em] text-[#b8ff2c] uppercase">
                      {label.area.toLowerCase()} ·{" "}
                      {availabilityLabel(label.category)}
                    </p>
                    <h4 className="mt-2 font-semibold text-white">
                      {projectNames.get(label.studioProjectId) ??
                        "Deleted project"}
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold tracking-[0.08em] text-slate-500 uppercase">
                    {label.approvedAsBenchmark ? "Approved" : "Review only"}
                  </span>
                </div>
                {label.note && (
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    {label.note}
                  </p>
                )}
                <p className="mt-3 text-xs text-slate-600">
                  Confidence {(label.reviewerConfidence * 100).toFixed(0)}% ·{" "}
                  {label.startSeconds === null
                    ? "No timestamp range"
                    : `${label.startSeconds.toFixed(3)}–${label.endSeconds?.toFixed(3)} s`}{" "}
                  · {label.labelVersion}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          reviewRequest(
                            `/api/unified-review-labels/${label.id}`,
                            {
                              method: "PATCH",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({
                                approvedAsBenchmark: !label.approvedAsBenchmark,
                              }),
                            },
                          ),
                        label.approvedAsBenchmark
                          ? "Label removed from benchmark evidence."
                          : "Label approved as benchmark evidence.",
                      )
                    }
                  >
                    <CheckCircle2 size={14} />
                    {label.approvedAsBenchmark
                      ? "Use as review only"
                      : "Approve for benchmark"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Delete this local review label? The project and detector ground truth will remain.",
                        )
                      ) {
                        return;
                      }
                      void run(
                        () =>
                          reviewRequest(
                            `/api/unified-review-labels/${label.id}`,
                            { method: "DELETE" },
                          ),
                        "Local review label deleted.",
                      );
                    }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-amber-300/15 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100/80">
        <p className="font-semibold text-amber-100">Honest limits</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {state.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
