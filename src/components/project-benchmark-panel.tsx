"use client";

import { useState } from "react";
import { BarChart3, Download, ShieldCheck } from "lucide-react";

import type { ProjectBenchmarkStateDto } from "@/lib/phase3b2-benchmark";

export function ProjectBenchmarkPanel({
  projectId,
  initialState,
}: {
  projectId: string;
  initialState: ProjectBenchmarkStateDto;
}) {
  const [state, setState] = useState(initialState);
  const [reviewed, setReviewed] = useState(
    initialState.reviewScope.fullyReviewedCategories,
  );
  const [minutes, setMinutes] = useState(
    initialState.reviewScope.humanReviewMinutes?.toString() ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveScope() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/benchmark`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullyReviewedCategories: reviewed,
          humanReviewMinutes: minutes.trim() === "" ? null : Number(minutes),
        }),
      });
      const body = (await response.json()) as {
        benchmark?: ProjectBenchmarkStateDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.benchmark) {
        throw new Error(
          body.error?.message ?? "Review scope could not be saved.",
        );
      }
      setState(body.benchmark);
      setMessage("Benchmark review scope saved locally.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Review scope could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runBenchmark() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/benchmark`, {
        method: "POST",
      });
      const body = (await response.json()) as {
        benchmark?: ProjectBenchmarkStateDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.benchmark) {
        throw new Error(
          body.error?.message ?? "Benchmark could not be calculated.",
        );
      }
      setState(body.benchmark);
      setMessage(
        "Development benchmark calculated from approved labels and the latest detector results.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Benchmark could not be calculated.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="panel mt-8 overflow-hidden"
      aria-labelledby="benchmark-results-title"
    >
      <div className="border-b border-white/8 px-5 py-5 sm:px-6">
        <p className="section-kicker">Phase 3B.2 · honest evaluation</p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="benchmark-results-title"
              className="font-display text-2xl font-bold text-white uppercase"
            >
              Broad-signal benchmark
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Compares approved human labels with broad local signal candidates.
              This is a development estimate, not verified R6 event accuracy.
            </p>
          </div>
          <span className="rounded-full border border-amber-300/20 bg-amber-300/8 px-3 py-2 text-xs font-bold text-amber-200 uppercase">
            Development estimate
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <h3 className="text-sm font-bold text-white">
            False-positive review scope
          </h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Check a category only after reviewing the complete recording for
            detector candidates in that category. Until then, precision is shown
            as “Not measured.”
          </p>
          <div className="mt-4 space-y-2">
            {state.categories.map((category) => (
              <label
                key={category.value}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3 text-sm text-slate-300"
              >
                <input
                  type="checkbox"
                  checked={reviewed.includes(category.value)}
                  onChange={(event) =>
                    setReviewed((current) =>
                      event.target.checked
                        ? [...new Set([...current, category.value])]
                        : current.filter((value) => value !== category.value),
                    )
                  }
                  className="mt-0.5 size-4 accent-[#b8ff2c]"
                />
                <span>
                  <span className="font-semibold text-slate-200">
                    {category.label}
                  </span>
                  <span className="mt-1 block text-xs text-slate-600">
                    I reviewed the full recording for false positives.
                  </span>
                </span>
              </label>
            ))}
          </div>
          <label className="mt-4 block text-xs font-bold tracking-wide text-slate-400 uppercase">
            Human review minutes (optional)
            <input
              type="number"
              min="0"
              step="0.1"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={saveScope}
            >
              <ShieldCheck aria-hidden="true" size={16} /> Save review scope
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={runBenchmark}
            >
              <BarChart3 aria-hidden="true" size={16} /> Calculate benchmark
            </button>
          </div>
          {message ? (
            <p role="status" className="mt-3 text-sm text-slate-300">
              {message}
            </p>
          ) : null}
        </div>

        <div>
          {!state.latestRun ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm leading-6 text-slate-500">
              No benchmark calculation yet. Approve manual labels, run local
              detectors, then calculate.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold tracking-wide text-slate-600 uppercase">
                    Latest calculation
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {state.latestRun.completedAt
                      ? new Date(state.latestRun.completedAt).toLocaleString()
                      : "Completed"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a
                    className="secondary-button"
                    href={`/api/benchmark-runs/${state.latestRun.id}/export?format=json`}
                  >
                    <Download aria-hidden="true" size={14} /> JSON
                  </a>
                  <a
                    className="secondary-button"
                    href={`/api/benchmark-runs/${state.latestRun.id}/export?format=markdown`}
                  >
                    <Download aria-hidden="true" size={14} /> Markdown
                  </a>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {state.latestRun.metrics.map((metric) => {
                  const category = state.categories.find(
                    (item) => item.value === metric.category,
                  );
                  const scopeComplete =
                    metric.extra.falsePositiveScopeComplete === true;
                  return (
                    <article
                      key={metric.category ?? "overall"}
                      className="rounded-xl border border-white/8 bg-black/20 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="font-semibold text-white">
                          {category?.label ?? metric.category ?? "Overall"}
                        </h3>
                        <span className="text-xs font-bold text-amber-200">
                          {metric.insufficientExamples
                            ? "Insufficient benchmark examples"
                            : "Measured sample"}
                        </span>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <Metric
                          label="Approved examples"
                          value={metric.sampleCount.toString()}
                        />
                        <Metric
                          label="TP / FN"
                          value={`${metric.truePositives} / ${metric.falseNegatives}`}
                        />
                        <Metric
                          label="Precision"
                          value={
                            scopeComplete
                              ? formatRate(metric.precision)
                              : "Not measured"
                          }
                        />
                        <Metric
                          label="Recall"
                          value={formatRate(metric.recall)}
                        />
                      </dl>
                      {!scopeComplete ? (
                        <p className="mt-3 text-xs leading-5 text-slate-500">
                          {String(metric.extra.unmatchedCandidateCount ?? 0)}{" "}
                          unmatched candidates are not counted as false
                          positives because full-category review is not
                          confirmed.
                        </p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/6 p-2.5">
      <dt className="text-slate-600">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-200">{value}</dd>
    </div>
  );
}

function formatRate(value: number | null) {
  return value === null ? "Not measured" : `${(value * 100).toFixed(1)}%`;
}
