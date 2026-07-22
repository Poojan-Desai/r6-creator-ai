"use client";

import { useState } from "react";
import { Check, LoaderCircle, SlidersHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type StyleProfileSummary = {
  id: string;
  name: string;
  description: string | null;
  preferredVideoLengthSeconds: number | null;
  preferredHookLengthSeconds: number | null;
  energyLevel: number;
  humorLevel: number;
  educationalLevel: number;
  storytellingLevel: number;
  references: Array<{ id: string; title: string; creatorName: string }>;
  features: Array<{
    id: string;
    key: string;
    label: string;
    value: unknown;
    confidence: number;
    reason: string;
  }>;
};

export type AnalyzedReferenceOption = {
  id: string;
  title: string;
  creatorName: string;
  contentCategory: string;
};

export function StyleProfileLibrary({
  profiles,
  references,
}: {
  profiles: StyleProfileSummary[];
  references: AnalyzedReferenceOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/style-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, referenceIds: selected }),
      });
      const payload = (await response.json()) as {
        profile?: { id: string };
        error?: { message?: string };
      };
      if (!response.ok || !payload.profile)
        throw new Error(
          payload.error?.message || "The style profile could not be created.",
        );
      router.push(`/style-profiles/${payload.profile.id}`);
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The style profile could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel p-6 sm:p-7">
        <div className="grid gap-8 lg:grid-cols-[minmax(18rem,0.7fr)_minmax(0,1.3fr)]">
          <div>
            <p className="section-kicker">New structured profile</p>
            <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
              Combine references
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              The app averages high-level timing, pacing, energy, and structure.
              It never copies reference wording.
            </p>
            <label className="mt-5 block">
              <span className="form-label">Profile name</span>
              <input
                className="field mt-2"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="High-Energy R6 Shorts"
              />
            </label>
            <label className="mt-4 block">
              <span className="form-label">Optional description</span>
              <textarea
                className="field mt-2 min-h-24 resize-y"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>
          <div>
            <p className="form-label">Analyzed local references</p>
            {references.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-white/12 p-6 text-sm leading-6 text-slate-500">
                Complete local style analysis for at least one permitted
                reference first.
              </div>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {references.map((reference) => {
                  const checked = selected.includes(reference.id);
                  return (
                    <button
                      key={reference.id}
                      type="button"
                      className={`rounded-xl border p-4 text-left transition ${checked ? "border-[#b8ff2c]/45 bg-[#b8ff2c]/8" : "border-white/8 bg-black/15 hover:border-white/16"}`}
                      onClick={() => toggle(reference.id)}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span>
                          <span className="block font-semibold text-white">
                            {reference.title}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {reference.creatorName} ·{" "}
                            {reference.contentCategory}
                          </span>
                        </span>
                        <span
                          className={`grid size-6 place-items-center rounded-md border ${checked ? "border-[#b8ff2c] bg-[#b8ff2c] text-black" : "border-white/15 text-transparent"}`}
                        >
                          <Check size={14} />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {error && <div className="error-box mt-4">{error}</div>}
            <button
              type="button"
              className="primary-button mt-5"
              onClick={() => void create()}
              disabled={busy || !name.trim() || selected.length === 0}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}{" "}
              Create style profile
            </button>
          </div>
        </div>
      </section>

      <section className="mt-12">
        <div>
          <p className="section-kicker">Saved preferences</p>
          <h2 className="font-display mt-1 text-4xl font-bold text-white uppercase">
            Creator Style Profiles
          </h2>
        </div>
        {profiles.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/12 px-6 py-12 text-center text-sm text-slate-500">
            No profiles yet. Analyze permitted references, then combine them
            above.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {profiles.map((profile) => (
              <Link
                key={profile.id}
                href={`/style-profiles/${profile.id}`}
                className="project-card"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-[#b8ff2c]/10 text-[#b8ff2c]">
                  <SlidersHorizontal size={21} />
                </span>
                <h3 className="font-display mt-5 text-2xl font-bold text-white uppercase">
                  {profile.name}
                </h3>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                  {profile.description ||
                    `${profile.references.length} structured reference${profile.references.length === 1 ? "" : "s"}`}
                </p>
                <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/8 pt-4 text-center text-xs">
                  <Level label="Energy" value={profile.energyLevel} />
                  <Level label="Humor" value={profile.humorLevel} />
                  <Level label="Story" value={profile.storytellingLevel} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Level({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="block text-slate-500">{label}</span>
      <span className="mt-1 block font-bold text-[#d8ff8a]">{value}</span>
    </span>
  );
}
