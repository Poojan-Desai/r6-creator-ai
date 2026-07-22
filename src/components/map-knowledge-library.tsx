"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookMarked,
  Database,
  MapPinned,
  Search,
} from "lucide-react";

type MapSummary = {
  id: string;
  stableId: string;
  slug: string;
  name: string;
  location: string | null;
  releaseLabel: string;
  modernizationLabel: string | null;
  lifecycleStatus: string;
  knowledgeStatus: string;
  blueprintAvailable: boolean;
  sourceUrl: string;
  lastVerifiedAt: string;
  aliases: string[];
  playlists: Array<{
    playlist: string;
    availability: string;
    sourceUrl: string;
  }>;
  versionCount: number;
  currentVersion: {
    id: string;
    stableId: string;
    name: string;
    status: string;
    counts: {
      floors: number;
      elements: number;
      bombSites: number;
      connections: number;
      blueprintAssets: number;
    };
  } | null;
};

const PLAYLISTS = [
  ["ALL", "All maps"],
  ["RANKED", "Ranked"],
  ["UNRANKED", "Unranked"],
  ["QUICK_MATCH", "Quick Match"],
  ["TEAM_DEATHMATCH", "Team Deathmatch"],
  ["DUAL_FRONT", "Dual Front"],
] as const;

export function MapKnowledgeLibrary({
  initialMaps,
}: {
  initialMaps: MapSummary[];
}) {
  const [search, setSearch] = useState("");
  const [playlist, setPlaylist] = useState("ALL");
  const [deepResults, setDeepResults] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const maps = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return initialMaps.filter((map) => {
      const matchesText =
        !needle ||
        map.name.toLowerCase().includes(needle) ||
        map.aliases.some((alias) => alias.toLowerCase().includes(needle));
      const matchesPlaylist =
        playlist === "ALL" ||
        map.playlists.some(
          (status) =>
            status.playlist === playlist && status.availability === "ACTIVE",
        );
      return matchesText && matchesPlaylist;
    });
  }, [initialMaps, playlist, search]);

  async function searchInsideMaps() {
    if (!search.trim()) {
      setMessage(
        "Enter a room, callout, site, hatch, or tactical phrase first.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/maps/search?q=${encodeURIComponent(search.trim())}`,
      );
      const body = (await response.json()) as {
        results?: Array<Record<string, unknown>>;
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(body.error?.message ?? "Map search failed.");
      setDeepResults(body.results ?? []);
      setMessage(
        body.results?.length
          ? `Found ${body.results.length} local knowledge result${body.results.length === 1 ? "" : "s"}.`
          : "No annotated map elements matched. Map names may still appear below.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Map search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function prepareUpdateCheck() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/maps/update-check", {
        method: "POST",
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok)
        throw new Error(body.error?.message ?? "Update check could not start.");
      setMessage(
        "Review record created. No web data was fetched and no saved knowledge was overwritten.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Update check could not start.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 space-y-8">
      <section className="panel p-5 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_14rem_auto_auto] lg:items-end">
          <label>
            <span className="form-label">Map or local knowledge search</span>
            <span className="relative mt-2 block">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-600"
                size={16}
                aria-hidden="true"
              />
              <input
                className="field pl-10"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchInsideMaps();
                }}
                placeholder="Oregon basement hatches"
              />
            </span>
          </label>
          <label>
            <span className="form-label">Current playlist</span>
            <select
              className="field mt-2"
              value={playlist}
              onChange={(event) => setPlaylist(event.target.value)}
            >
              {PLAYLISTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => void searchInsideMaps()}
          >
            Search annotations
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => void prepareUpdateCheck()}
          >
            Prepare update review
          </button>
        </div>
        {message && (
          <p className="mt-4 text-sm text-slate-400" role="status">
            {message}
          </p>
        )}
      </section>

      {deepResults.length > 0 && (
        <section
          className="panel p-5 sm:p-6"
          aria-labelledby="map-search-title"
        >
          <p className="section-kicker">Local annotation index</p>
          <h2
            id="map-search-title"
            className="font-display mt-1 text-2xl font-bold text-white uppercase"
          >
            Knowledge matches
          </h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {deepResults.map((result, index) => (
              <Link
                key={`${String(result.mapSlug)}-${String(result.kind)}-${String(result.name)}-${index}`}
                href={`/maps/${String(result.mapSlug)}`}
                className="rounded-xl border border-white/8 bg-black/20 p-4 hover:border-[#b8ff2c]/30"
              >
                <span className="text-[10px] font-bold tracking-[0.12em] text-[#b8ff2c] uppercase">
                  {String(result.kind).replaceAll("_", " ")}
                </span>
                <span className="mt-1 block font-semibold text-white">
                  {String(result.map)} · {String(result.name)}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  {String(result.mapVersion)}
                  {result.floor ? ` · ${String(result.floor)}` : ""} ·
                  confidence {Math.round(Number(result.confidence) * 100)}%
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="map-list-title">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="section-kicker">
              Official catalog and local versions
            </p>
            <h2
              id="map-list-title"
              className="font-display mt-1 text-4xl font-bold text-white uppercase"
            >
              {maps.length} listed maps
            </h2>
          </div>
          <p className="hidden max-w-md text-right text-xs leading-5 text-slate-500 md:block">
            “Listed” means the catalog record is sourced. It does not mean the
            rooms, sites, connectivity, or tactics are fully annotated.
          </p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {maps.map((map) => {
            const counts = map.currentVersion?.counts;
            const active = map.playlists.filter(
              (status) => status.availability === "ACTIVE",
            );
            return (
              <Link
                className="project-card group"
                href={`/maps/${map.slug}`}
                key={map.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-xl border border-white/8 bg-white/4 text-[#b8ff2c]">
                    <MapPinned aria-hidden="true" size={21} />
                  </span>
                  <ArrowUpRight
                    className="text-slate-600 transition group-hover:text-[#b8ff2c]"
                    aria-hidden="true"
                    size={20}
                  />
                </div>
                <h3 className="font-display mt-5 text-2xl font-bold text-white uppercase">
                  {map.name}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {map.releaseLabel}
                  {map.modernizationLabel ? ` · ${map.modernizationLabel}` : ""}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {active.length > 0 ? (
                    active.map((status) => (
                      <span
                        key={status.playlist}
                        className="rounded-full border border-white/8 px-2 py-1 text-[9px] font-bold tracking-wide text-slate-400 uppercase"
                      >
                        {status.playlist.replaceAll("_", " ")}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-slate-600">
                      No current playlist confirmed
                    </span>
                  )}
                </div>
                <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-white/8 pt-4 text-xs">
                  <MiniStat
                    icon={Database}
                    label="Versions"
                    value={map.versionCount}
                  />
                  <MiniStat
                    icon={BookMarked}
                    label="Rooms/items"
                    value={counts?.elements ?? 0}
                  />
                  <MiniStat
                    icon={MapPinned}
                    label="Blueprints"
                    value={counts?.blueprintAssets ?? 0}
                  />
                </dl>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Database;
  label: string;
  value: number;
}) {
  return (
    <div>
      <Icon className="text-slate-600" size={13} aria-hidden="true" />
      <dt className="mt-2 text-[9px] font-bold tracking-wide text-slate-600 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold text-slate-200">{value}</dd>
    </div>
  );
}
