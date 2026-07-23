import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, GitCompareArrows } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { compareOperators } from "@/lib/operator-knowledge/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Compare Operators" };

type Props = { searchParams: Promise<{ slugs?: string }> };

export default async function OperatorComparisonPage({ searchParams }: Props) {
  const { slugs = "" } = await searchParams;
  const comparison = await compareOperators(slugs.split(",").filter(Boolean));
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 lg:px-10 lg:py-14">
        <Link href="/operators" className="secondary-button">
          <ArrowLeft aria-hidden="true" size={15} /> Operator library
        </Link>
        <p className="section-kicker mt-8">Structured comparison</p>
        <h1 className="font-display mt-2 flex items-center gap-3 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
          <GitCompareArrows aria-hidden="true" className="text-[#b8ff2c]" />{" "}
          Compare operators
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-400">
          {comparison.explanation}
        </p>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-white/8">
          <table className="w-full min-w-190 text-left text-sm">
            <thead className="bg-white/4">
              <tr>
                <th className="p-4 text-slate-500">Structured fact</th>
                {comparison.operators.map((operator) => (
                  <th key={operator.id} className="p-4 text-xl text-white">
                    {operator.displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              <ComparisonRow
                label="Side"
                values={comparison.operators.map((item) => item.side)}
              />
              <ComparisonRow
                label="Squad"
                values={comparison.operators.map(
                  (item) => item.squad ?? "Not verified",
                )}
              />
              <ComparisonRow
                label="Official specialties"
                values={comparison.operators.map(
                  (item) =>
                    item.versions
                      .find((version) => version.isCurrent)
                      ?.officialSpecialties.join(", ") || "Not verified",
                )}
              />
              <ComparisonRow
                label="Unique ability"
                values={comparison.operators.map(
                  (item) =>
                    item.versions.find((version) => version.isCurrent)
                      ?.officialAbilityName ?? "Not verified",
                )}
              />
              <ComparisonRow
                label="Tactical roles (non-official)"
                values={comparison.operators.map(
                  (item) =>
                    item.versions
                      .find((version) => version.isCurrent)
                      ?.roles.filter(
                        (role) => role.roleSource !== "OFFICIAL_SPECIALTY",
                      )
                      .map((role) => role.displayName)
                      .join(", ") || "None entered",
                )}
              />
              <ComparisonRow
                label="Conditions and relationships"
                values={comparison.operators.map(
                  (item) =>
                    item.versions
                      .find((version) => version.isCurrent)
                      ?.interactions.map(
                        (relation) =>
                          `${relation.category.replaceAll("_", " ")}: ${relation.conditions}`,
                      )
                      .join("; ") ||
                    "Insufficient verified operator knowledge.",
                )}
              />
              <ComparisonRow
                label="Map suitability"
                values={comparison.operators.map(
                  (item) =>
                    item.versions
                      .find((version) => version.isCurrent)
                      ?.mapLinks.map(
                        (link) => `${link.mapName}: ${link.tacticalPurpose}`,
                      )
                      .join("; ") ||
                    "Insufficient verified operator knowledge.",
                )}
              />
            </tbody>
          </table>
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-600">
          Comparisons cite stored structured facts and conditions. They do not
          claim one operator is universally better.
        </p>
      </div>
    </main>
  );
}

function ComparisonRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr>
      <th className="p-4 align-top text-xs font-bold tracking-wide text-slate-600 uppercase">
        {label}
      </th>
      {values.map((value, index) => (
        <td
          key={`${label}-${index}`}
          className="p-4 align-top leading-6 text-slate-300"
        >
          {value}
        </td>
      ))}
    </tr>
  );
}
