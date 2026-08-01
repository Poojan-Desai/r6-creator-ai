"use client";

import { ExternalLink, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type {
  ProjectEvidenceInspectorState,
  SharedEvidenceClass,
} from "@/lib/evidence-inspector";
import { formatDuration } from "@/lib/time";

const evidenceLabels: Record<SharedEvidenceClass, string> = {
  VERIFIED_REPLAY_FACT: "Verified replay fact",
  DIRECT_VIDEO_OBSERVATION: "Direct video observation",
  TRANSCRIPT_STATEMENT: "Transcript statement",
  USER_CONFIRMED_CONTEXT: "User-confirmed context",
  INFERENCE: "Inference",
  CONFLICT: "Conflict",
  UNKNOWN: "Unknown",
};

const evidenceClasses = Object.keys(evidenceLabels) as SharedEvidenceClass[];

export function EvidenceInspectorWorkspace({
  initialState,
}: {
  initialState: ProjectEvidenceInspectorState;
}) {
  const [selectedClass, setSelectedClass] = useState<
    SharedEvidenceClass | "ALL"
  >("ALL");
  const [sourceArea, setSourceArea] = useState("ALL");
  const [query, setQuery] = useState("");
  const sourceAreas = useMemo(
    () => [...new Set(initialState.statements.map((item) => item.sourceArea))],
    [initialState.statements],
  );
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return initialState.statements.filter((item) => {
      if (selectedClass !== "ALL" && item.evidenceClass !== selectedClass) {
        return false;
      }
      if (sourceArea !== "ALL" && item.sourceArea !== sourceArea) return false;
      return (
        !search ||
        `${item.summary} ${item.detail ?? ""} ${item.sourceLabel} ${item.version ?? ""}`
          .toLowerCase()
          .includes(search)
      );
    });
  }, [initialState.statements, query, selectedClass, sourceArea]);

  return (
    <div className="space-y-8">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <p className="section-kicker">U7.1 · Shared evidence contract</p>
            <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
              One claim. One visible class.
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Creator and coaching surfaces use the same seven evidence classes.
              A script, timeline, report, or score cannot promote an inference
              into a fact.
            </p>
          </div>
          <span className="rounded-full border border-[#b8ff2c]/20 bg-[#b8ff2c]/7 px-3 py-2 text-xs font-bold tracking-[0.08em] text-[#d8ff8a]">
            {initialState.contractVersion}
          </span>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {initialState.workflow.map((step) => (
            <Link
              key={step.key}
              href={step.link}
              className="rounded-2xl border border-white/8 bg-black/15 p-4 no-underline transition hover:border-white/15"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-white">{step.label}</h3>
                <span className="text-[10px] font-bold tracking-[0.08em] text-[#b8ff2c] uppercase">
                  {step.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {step.explanation}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel p-5 sm:p-6">
        <p className="section-kicker">Filter without changing evidence</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={
              selectedClass === "ALL" ? "primary-button" : "secondary-button"
            }
            onClick={() => setSelectedClass("ALL")}
          >
            All ({initialState.statements.length})
          </button>
          {evidenceClasses.map((item) => (
            <button
              key={item}
              type="button"
              className={
                selectedClass === item ? "primary-button" : "secondary-button"
              }
              onClick={() => setSelectedClass(item)}
            >
              {evidenceLabels[item]} ({initialState.statementCounts[item] ?? 0})
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
          <label className="block text-sm font-semibold text-slate-300">
            <span className="mb-2 block">Search statements</span>
            <span className="relative block">
              <Search
                className="pointer-events-none absolute top-3.5 left-3 text-slate-600"
                size={16}
              />
              <input
                className="input-field pl-10"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search evidence, versions, or boundaries"
              />
            </span>
          </label>
          <label className="block text-sm font-semibold text-slate-300">
            <span className="mb-2 block">Source area</span>
            <select
              className="input-field"
              value={sourceArea}
              onChange={(event) => setSourceArea(event.target.value)}
            >
              <option value="ALL">All source areas</option>
              {sourceAreas.map((item) => (
                <option key={item} value={item}>
                  {item.toLowerCase().replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section aria-live="polite" className="space-y-3">
        {filtered.length === 0 ? (
          <div className="panel p-8 text-center text-sm text-slate-500">
            No saved evidence statement matches these filters.
          </div>
        ) : (
          filtered.map((item) => (
            <article key={item.id} className="panel p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-slate-300 uppercase">
                      {evidenceLabels[item.evidenceClass]}
                    </span>
                    <span className="text-xs text-slate-600">
                      {item.sourceArea.toLowerCase()} · {item.sourceLabel}
                    </span>
                    {item.corrected && (
                      <span className="text-xs font-semibold text-amber-200">
                        corrected
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-white">
                    {item.summary}
                  </h3>
                  {item.detail && (
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {item.detail}
                    </p>
                  )}
                </div>
                {item.link && (
                  <Link
                    href={item.link}
                    className="secondary-button shrink-0 no-underline"
                  >
                    Open source <ExternalLink size={14} />
                  </Link>
                )}
              </div>
              <dl className="mt-5 grid gap-3 border-t border-white/8 pt-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <EvidenceDetail
                  label="Confidence"
                  value={
                    item.confidence === null
                      ? "Unavailable"
                      : `${Math.round(item.confidence * 100)}%`
                  }
                />
                <EvidenceDetail
                  label="Video time"
                  value={
                    item.videoTimestampSeconds === null
                      ? "Unavailable"
                      : formatDuration(item.videoTimestampSeconds)
                  }
                />
                <EvidenceDetail
                  label="Replay time"
                  value={
                    item.replayTimestampSeconds === null
                      ? "Unavailable"
                      : formatDuration(item.replayTimestampSeconds)
                  }
                />
                <EvidenceDetail
                  label="Version"
                  value={item.version ?? "Unavailable"}
                />
              </dl>
            </article>
          ))
        )}
      </section>

      <p className="flex items-start gap-2 rounded-2xl border border-amber-300/15 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100/80">
        <ShieldCheck className="mt-0.5 shrink-0" size={16} />
        Unknown and conflicting evidence are first-class records. They remain
        visible in the inspector even when a creator output or coaching report
        chooses a shorter presentation.
      </p>
    </div>
  );
}

function EvidenceDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-600">{label}</dt>
      <dd className="mt-1 font-semibold break-words text-slate-300">{value}</dd>
    </div>
  );
}
