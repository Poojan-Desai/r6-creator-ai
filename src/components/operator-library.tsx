"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  GitCompareArrows,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";

import type { OperatorDetailDto } from "@/lib/operator-knowledge/service";

export function OperatorLibrary({
  initialOperators,
}: {
  initialOperators: OperatorDetailDto[];
}) {
  const [operators, setOperators] = useState(initialOperators);
  const [search, setSearch] = useState("");
  const [side, setSide] = useState("ALL");
  const [specialty, setSpecialty] = useState("ALL");
  const [role, setRole] = useState("ALL");
  const [squad, setSquad] = useState("ALL");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const filterOptions = useMemo(() => {
    const current = operators.flatMap((operator) =>
      operator.versions.filter((version) => version.isCurrent),
    );
    return {
      specialties: [
        ...new Set(current.flatMap((item) => item.officialSpecialties)),
      ].sort(),
      roles: [
        ...new Set(
          current.flatMap((item) =>
            item.roles
              .filter((role) => role.roleSource !== "OFFICIAL_SPECIALTY")
              .map((role) => role.roleKey),
          ),
        ),
      ].sort(),
      squads: [
        ...new Set(
          operators
            .map((operator) => operator.squad)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    };
  }, [operators]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return operators.filter((operator) => {
      const current = operator.versions.find((version) => version.isCurrent);
      const text = [
        operator.displayName,
        operator.squad ?? "",
        current?.officialAbilityName ?? "",
        current?.officialAbilitySummary ?? "",
        ...(current?.officialSpecialties ?? []),
        ...(current?.roles.map((item) => item.displayName) ?? []),
        ...(current?.loadout.map((item) => item.displayName) ?? []),
        ...(current?.contentUses ?? []),
        ...(current?.interactions.flatMap((item) => [
          item.category,
          item.targetOperator ?? "",
          item.targetAbility ?? "",
          item.targetGadget ?? "",
          item.conditions,
          item.outcome,
        ]) ?? []),
        ...(current?.mapLinks.flatMap((item) => [
          item.mapName,
          item.mapVersion,
          item.floor ?? "",
          item.room ?? "",
          item.bombSite ?? "",
          item.tacticalPurpose,
        ]) ?? []),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return (
        (!term || text.includes(term)) &&
        (side === "ALL" || operator.side === side) &&
        (specialty === "ALL" ||
          current?.officialSpecialties.includes(specialty)) &&
        (role === "ALL" ||
          current?.roles.some((item) => item.roleKey === role)) &&
        (squad === "ALL" || operator.squad === squad)
      );
    });
  }, [operators, role, search, side, specialty, squad]);

  async function importFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Operator JSON must be smaller than 5 MB.");
      const response = await fetch("/api/operators/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: await file.text(),
      });
      const body = (await response.json()) as {
        operator?: OperatorDetailDto;
        operators?: OperatorDetailDto[];
        importedCount?: number;
        error?: { message?: string };
      };
      const imported = body.operators ?? (body.operator ? [body.operator] : []);
      if (!response.ok || !imported.length)
        throw new Error(body.error?.message ?? "Operator import failed.");
      setOperators((current) =>
        [
          ...current.filter(
            (item) => !imported.some((saved) => saved.id === item.id),
          ),
          ...imported,
        ].sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        ),
      );
      setMessage(
        imported.length === 1
          ? `${imported[0]!.displayName} imported without replacing historical versions.`
          : `${imported.length} operator records imported without replacing historical versions.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Operator import failed.",
      );
    }
  }

  async function runUpdateReview() {
    setMessage(null);
    try {
      const response = await fetch("/api/operators/update-check", {
        method: "POST",
      });
      const body = (await response.json()) as {
        review?: { status: string };
        error?: { message?: string };
      };
      if (!response.ok || !body.review)
        throw new Error(
          body.error?.message ?? "The update review could not be created.",
        );
      setMessage(
        body.review.status === "REVIEWED_NO_CHANGE"
          ? "Saved roster identity fields match the packaged official retrieval. No records were overwritten."
          : "A proposed operator update review was saved. No records were overwritten.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The update review could not be created.",
      );
    }
  }

  return (
    <div className="mt-8">
      <section className="panel p-5 sm:p-6" aria-label="Operator filters">
        <div className="grid gap-3 lg:grid-cols-[minmax(15rem,1fr)_repeat(4,minmax(9rem,0.4fr))]">
          <label className="relative block">
            <span className="sr-only">Search operators</span>
            <Search
              aria-hidden="true"
              size={16}
              className="absolute top-3.5 left-3 text-slate-600"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search names, abilities, gadgets…"
              className="w-full rounded-xl border border-white/10 bg-black/30 py-3 pr-3 pl-10 text-sm text-white"
            />
          </label>
          <Filter
            label="Side"
            value={side}
            onChange={setSide}
            options={["ALL", "ATTACKER", "DEFENDER"]}
          />
          <Filter
            label="Official specialty"
            value={specialty}
            onChange={setSpecialty}
            options={["ALL", ...filterOptions.specialties]}
          />
          <Filter
            label="Tactical role"
            value={role}
            onChange={setRole}
            options={["ALL", ...filterOptions.roles]}
          />
          <Filter
            label="Squad"
            value={squad}
            onChange={setSquad}
            options={["ALL", ...filterOptions.squads]}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
          <p className="text-sm text-slate-500">
            {filtered.length} operator{filtered.length === 1 ? "" : "s"} ·{" "}
            {selected.length} selected for comparison
          </p>
          <div className="flex flex-wrap gap-2">
            <Link className="secondary-button" href="/api/operators/export">
              <Download aria-hidden="true" size={15} /> Export all
            </Link>
            <button
              type="button"
              className="secondary-button"
              onClick={runUpdateReview}
            >
              <RefreshCw aria-hidden="true" size={15} /> Review packaged update
            </button>
            {selected.length >= 2 ? (
              <Link
                className="secondary-button"
                href={`/operators/compare?slugs=${selected.join(",")}`}
              >
                <GitCompareArrows aria-hidden="true" size={15} /> Compare
                selected
              </Link>
            ) : null}
            <label className="secondary-button cursor-pointer">
              <Upload aria-hidden="true" size={15} /> Import versioned JSON
              <input
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => void importFile(event.target.files?.[0])}
              />
            </label>
          </div>
        </div>
        {message ? (
          <p role="status" className="mt-3 text-sm text-slate-300">
            {message}
          </p>
        ) : null}
      </section>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((operator) => {
          const current = operator.versions.find(
            (version) => version.isCurrent,
          );
          return (
            <article key={operator.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    className={`text-xs font-bold tracking-wide uppercase ${operator.side === "ATTACKER" ? "text-sky-300" : "text-orange-300"}`}
                  >
                    {operator.side}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-white">
                    {operator.displayName}
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    {operator.squad ?? "Squad not verified"}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={selected.includes(operator.slug)}
                    onChange={(event) =>
                      setSelected((currentSelection) =>
                        event.target.checked
                          ? [...currentSelection, operator.slug].slice(-4)
                          : currentSelection.filter(
                              (item) => item !== operator.slug,
                            ),
                      )
                    }
                    className="size-4 accent-[#b8ff2c]"
                  />
                  Compare
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {current?.officialSpecialties.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-[#b8ff2c]/15 bg-[#b8ff2c]/5 px-2.5 py-1 text-[10px] font-bold text-[#d8ff8a] uppercase"
                  >
                    {item.replaceAll("-", " ")}
                  </span>
                ))}
              </div>
              <p className="mt-4 line-clamp-3 min-h-15 text-sm leading-5 text-slate-400">
                {current?.officialAbilityName ? (
                  <>
                    <strong className="text-slate-200">
                      {current.officialAbilityName}:{" "}
                    </strong>
                    {current.officialAbilitySummary}
                  </>
                ) : (
                  "Official detail has not been fully transcribed yet. The operator is listed from Ubisoft's directory."
                )}
              </p>
              <div className="mt-5 flex items-center justify-between border-t border-white/8 pt-4">
                <span className="text-xs text-slate-600">
                  {current?.knowledgeStatus === "CURRENT"
                    ? "Official data imported"
                    : "Listed · needs detail review"}
                </span>
                <Link
                  href={`/operators/${operator.slug}`}
                  className="secondary-button"
                >
                  Open <ArrowRight aria-hidden="true" size={14} />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      {!filtered.length ? (
        <section className="panel mt-5 p-6 text-center">
          <p className="font-bold text-amber-200">
            Insufficient verified operator knowledge.
          </p>
          <p className="mt-2 text-sm text-slate-500">
            No saved operator facts match this search. Clear a filter or add a
            manually sourced fact instead of assuming an answer.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block text-[10px] font-bold tracking-wide text-slate-600 uppercase">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#10151a] px-3 py-3 text-sm text-slate-200 normal-case"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === "ALL" ? "All" : option.replaceAll("-", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
