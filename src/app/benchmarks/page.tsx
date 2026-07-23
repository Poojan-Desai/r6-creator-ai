import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Clock3 } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { listBenchmarkDashboard } from "@/lib/phase3b2-benchmark";
import { formatDuration } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Benchmarks" };

export default async function BenchmarksPage() {
  const datasets = await listBenchmarkDashboard();
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 lg:px-10 lg:py-14">
        <p className="section-kicker">Phase 3B.2 · evaluation</p>
        <h1 className="font-display mt-2 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
          Benchmark dashboard
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
          Development estimates from legally usable local footage and approved
          human labels. Unsupported R6 event categories are not scored here.
        </p>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {datasets.length === 0 ? (
            <div className="panel p-6 text-sm text-slate-500">
              No benchmark datasets yet. Open a project to define review scope
              and run an evaluation.
            </div>
          ) : (
            datasets.map((dataset) => (
              <article key={dataset.id} className="panel p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-amber-200 uppercase">
                      {dataset.split === "VERIFICATION"
                        ? "Verified benchmark result"
                        : "Development estimate"}
                    </p>
                    <h2 className="mt-2 text-xl font-bold text-white">
                      {dataset.name}
                    </h2>
                  </div>
                  <BarChart3
                    aria-hidden="true"
                    className="text-[#b8ff2c]"
                    size={20}
                  />
                </div>
                <p className="mt-4 flex items-center gap-2 text-sm text-slate-400">
                  <Clock3 aria-hidden="true" size={15} /> {dataset.projectCount}{" "}
                  recording{dataset.projectCount === 1 ? "" : "s"} ·{" "}
                  {formatDuration(dataset.totalDurationSeconds)} labeled footage
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {dataset.projects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}#benchmark-results-title`}
                      className="secondary-button"
                    >
                      {project.name}
                    </Link>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-600">
                  {dataset.latestRun
                    ? `${dataset.latestRun.insufficientCategoryCount} of 5 categories currently have insufficient examples.`
                    : "No calculation yet."}
                </p>
              </article>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
