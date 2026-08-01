import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PrintReportButton } from "@/components/print-report-button";
import { getCoachingReport } from "@/lib/coaching-reports";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; reportId: string }>;
};

function FindingSection({
  title,
  findings,
}: {
  title: string;
  findings: Array<{
    id: string;
    category: string;
    confidence: number;
    explanation: string;
    missingContext: string[];
  }>;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl font-bold text-slate-950 uppercase">
        {title}
      </h2>
      {findings.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No supported findings were available for this section.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {findings.map((finding) => (
            <article
              key={finding.id}
              className="rounded-xl border border-slate-200 p-4"
            >
              <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">
                {finding.category.replaceAll("_", " ")} ·{" "}
                {Math.round(finding.confidence * 100)}% confidence
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                {finding.explanation}
              </p>
              {finding.missingContext.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-950">
                    Missing context
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-amber-900">
                    {finding.missingContext.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function CoachingReportPage({ params }: Props) {
  const { id, reportId } = await params;
  let report;
  try {
    report = await getCoachingReport(id, reportId);
  } catch {
    notFound();
  }
  const document = report.document;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 print:bg-white print:p-0">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex flex-wrap gap-3 print:hidden">
          <Link
            href={`/studio/${id}/coaching`}
            className="secondary-button no-underline"
          >
            <ArrowLeft size={15} /> Back to Coaching Lab
          </Link>
          <PrintReportButton />
          {report.exports.map((item) => (
            <a
              key={item.id}
              className="secondary-button no-underline"
              href={`/api/studio-projects/${id}/coaching/reports/${report.id}/exports/${item.id}`}
            >
              <Download size={15} /> {item.format}
            </a>
          ))}
        </div>
        <article className="rounded-2xl bg-white p-7 shadow-sm sm:p-10 print:rounded-none print:p-0 print:shadow-none">
          <header className="border-b border-slate-200 pb-7">
            <div className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-emerald-800 uppercase">
              <ShieldCheck size={16} /> AI-assisted replay and POV review
            </div>
            <h1 className="font-display mt-4 text-4xl font-extrabold tracking-tight text-slate-950 uppercase">
              Coaching report
            </h1>
            <p className="mt-2 text-lg font-semibold text-slate-700">
              {document.project.name}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Version {report.version} · {document.generatedAt} ·{" "}
              {document.project.inputMode.replaceAll("_", " ")}
            </p>
            <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              {document.disclaimer}
            </p>
          </header>

          <section className="mt-8">
            <h2 className="font-display text-2xl font-bold text-slate-950 uppercase">
              Match summary
            </h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Map", document.matchSummary.map ?? "Unknown"],
                ["Mode", document.matchSummary.mode ?? "Unknown"],
                ["Rounds represented", document.matchSummary.roundCount],
                [
                  "Supported selected-player kills",
                  document.matchSummary.selectedPlayerKills,
                ],
                [
                  "Likely deaths from kill-target feedback",
                  document.matchSummary.selectedPlayerLikelyDeaths,
                ],
                [
                  "Replay validation",
                  document.matchSummary.validationStatus ?? "Unavailable",
                ],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-slate-50 p-4">
                  <dt className="text-xs font-semibold text-slate-500">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm font-bold text-slate-900">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <FindingSection
            title="Top three review priorities"
            findings={document.topReviewPriorities}
          />
          <FindingSection
            title="Strong decisions"
            findings={document.strongDecisions}
          />

          <section className="mt-8">
            <h2 className="font-display text-2xl font-bold text-slate-950 uppercase">
              Practice drills
            </h2>
            {document.practiceDrills.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No practice drill was saved when this report version was
                generated.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {document.practiceDrills.map((drill) => (
                  <article
                    key={drill.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <h3 className="font-semibold text-slate-950">
                      {drill.name}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {drill.instructions}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-emerald-900">
                      Measurable goal: {drill.measurableGoal}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="mt-8">
            <h2 className="font-display text-2xl font-bold text-slate-950 uppercase">
              Evidence boundaries
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
              {document.evidenceBoundary.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <footer className="mt-10 border-t border-slate-200 pt-5 text-xs text-slate-500">
            Immutable local report snapshot · {report.reportVersion} · Reason:{" "}
            {report.reason}
          </footer>
        </article>
      </div>
    </main>
  );
}
