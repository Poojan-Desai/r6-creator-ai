"use client";

import { useState } from "react";
import { ArrowLeft, LoaderCircle, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ProfileDetail = {
  id: string;
  name: string;
  description: string | null;
  preferredVideoLengthSeconds: number | null;
  preferredHookLengthSeconds: number | null;
  energyLevel: number;
  humorLevel: number;
  educationalLevel: number;
  storytellingLevel: number;
  setupAmount: number;
  voiceoverAmount: number;
  liveAudioAmount: number;
  captionDensity: number;
  cutFrequency: number;
  reactionEmphasis: number;
  titleStyle: string;
  thumbnailTextStyle: string;
  wordsToAvoid: string;
  preferredPhrases: string;
  profanityPreference: string;
  perspective: string;
  references: Array<{
    id: string;
    title: string;
    creatorName: string;
    contentCategory: string;
  }>;
  features: Array<{
    id: string;
    label: string;
    value: unknown;
    confidence: number;
    reason: string;
    sourceReferenceCount: number;
  }>;
};

export function StyleProfileEditor({
  initialProfile,
  availableReferences,
}: {
  initialProfile: ProfileDetail;
  availableReferences: Array<{
    id: string;
    title: string;
    creatorName: string;
    contentCategory: string;
  }>;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState(
    initialProfile.references.map((reference) => reference.id),
  );
  function change(key: keyof ProfileDetail, value: string | number | null) {
    setProfile((current) => ({ ...current, [key]: value }));
  }
  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/style-profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          description: profile.description,
          preferredVideoLengthSeconds: profile.preferredVideoLengthSeconds,
          preferredHookLengthSeconds: profile.preferredHookLengthSeconds,
          energyLevel: profile.energyLevel,
          humorLevel: profile.humorLevel,
          educationalLevel: profile.educationalLevel,
          storytellingLevel: profile.storytellingLevel,
          setupAmount: profile.setupAmount,
          voiceoverAmount: profile.voiceoverAmount,
          liveAudioAmount: profile.liveAudioAmount,
          captionDensity: profile.captionDensity,
          cutFrequency: profile.cutFrequency,
          reactionEmphasis: profile.reactionEmphasis,
          titleStyle: profile.titleStyle,
          thumbnailTextStyle: profile.thumbnailTextStyle,
          wordsToAvoid: profile.wordsToAvoid,
          preferredPhrases: profile.preferredPhrases,
          profanityPreference: profile.profanityPreference,
          perspective: profile.perspective,
          referenceIds: selectedReferenceIds,
        }),
      });
      const payload = (await response.json()) as {
        profile?: ProfileDetail;
        error?: { message?: string };
      };
      if (!response.ok || !payload.profile)
        throw new Error(
          payload.error?.message || "The profile could not be saved.",
        );
      setProfile(payload.profile);
      setMessage("Profile preferences saved locally.");
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The profile could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !window.confirm(
        "Delete this Creator Style Profile? Reference videos are kept.",
      )
    )
      return;
    setBusy(true);
    const response = await fetch(`/api/style-profiles/${profile.id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      router.push("/style-profiles");
      router.refresh();
      return;
    }
    const payload = (await response.json()) as { error?: { message?: string } };
    setError(payload.error?.message || "The profile could not be deleted.");
    setBusy(false);
  }
  function toggleReference(referenceId: string) {
    setSelectedReferenceIds((current) =>
      current.includes(referenceId)
        ? current.filter((id) => id !== referenceId)
        : [...current, referenceId],
    );
  }
  return (
    <>
      <div className="flex flex-wrap justify-between gap-3">
        <Link href="/style-profiles" className="secondary-button">
          <ArrowLeft size={15} /> Style profiles
        </Link>
        <button
          type="button"
          className="danger-button"
          onClick={() => void remove()}
          disabled={busy}
        >
          <Trash2 size={15} /> Delete profile
        </button>
      </div>
      <section className="panel mt-7 p-6 sm:p-8">
        <p className="section-kicker">Adjustable preferences</p>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <label>
            <span className="form-label">Profile name</span>
            <input
              className="field mt-2"
              value={profile.name}
              onChange={(event) => change("name", event.target.value)}
            />
          </label>
          <label>
            <span className="form-label">Description</span>
            <input
              className="field mt-2"
              value={profile.description || ""}
              onChange={(event) => change("description", event.target.value)}
            />
          </label>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <NumberField
            label="Preferred video length (seconds)"
            value={profile.preferredVideoLengthSeconds}
            onChange={(value) => change("preferredVideoLengthSeconds", value)}
          />
          <NumberField
            label="Preferred hook length (seconds)"
            value={profile.preferredHookLengthSeconds}
            onChange={(value) => change("preferredHookLengthSeconds", value)}
          />
          {(
            [
              ["energyLevel", "Energy"],
              ["humorLevel", "Humor"],
              ["educationalLevel", "Educational"],
              ["storytellingLevel", "Storytelling"],
              ["setupAmount", "Amount of setup"],
              ["voiceoverAmount", "Voiceover amount"],
              ["liveAudioAmount", "Live-audio amount"],
              ["captionDensity", "Caption density"],
              ["cutFrequency", "Cut frequency"],
              ["reactionEmphasis", "Reaction emphasis"],
            ] as const
          ).map(([key, label]) => (
            <RangeField
              key={key}
              label={label}
              value={profile[key]}
              onChange={(value) => change(key, value)}
            />
          ))}
        </div>
        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          <TextArea
            label="Title style"
            value={profile.titleStyle}
            onChange={(value) => change("titleStyle", value)}
          />
          <TextArea
            label="Thumbnail-text style"
            value={profile.thumbnailTextStyle}
            onChange={(value) => change("thumbnailTextStyle", value)}
          />
          <TextArea
            label="Words or phrases to avoid"
            value={profile.wordsToAvoid}
            onChange={(value) => change("wordsToAvoid", value)}
          />
          <TextArea
            label="My own preferred phrases"
            value={profile.preferredPhrases}
            onChange={(value) => change("preferredPhrases", value)}
          />
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label>
            <span className="form-label">Profanity preference</span>
            <select
              className="field mt-2"
              value={profile.profanityPreference}
              onChange={(event) =>
                change("profanityPreference", event.target.value)
              }
            >
              <option value="AVOID">Avoid</option>
              <option value="CENSOR">Censor</option>
              <option value="ALLOW">Allow</option>
            </select>
          </label>
          <label>
            <span className="form-label">Perspective</span>
            <select
              className="field mt-2"
              value={profile.perspective}
              onChange={(event) => change("perspective", event.target.value)}
            >
              <option value="FIRST_PERSON">First person</option>
              <option value="NARRATOR">Narrator</option>
              <option value="FLEXIBLE">Flexible</option>
            </select>
          </label>
        </div>
        {error && <div className="error-box mt-5">{error}</div>}
        {message && (
          <div className="mt-5 rounded-xl border border-[#b8ff2c]/20 bg-[#b8ff2c]/5 p-4 text-sm text-[#d8ff8a]">
            {message}
          </div>
        )}
        <button
          type="button"
          className="primary-button mt-6"
          onClick={() => void save()}
          disabled={busy}
        >
          {busy ? (
            <LoaderCircle className="animate-spin" size={17} />
          ) : (
            <Save size={17} />
          )}{" "}
          Save preferences
        </button>
      </section>
      <section className="mt-8 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="panel p-6">
          <p className="section-kicker">Contributing references</p>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Select one or more completed local analyses. Saving recomputes the
            explanations but keeps your visible preference edits.
          </p>
          <div className="mt-5 space-y-3">
            {availableReferences.map((reference) => (
              <label
                key={reference.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${selectedReferenceIds.includes(reference.id) ? "border-[#b8ff2c]/35 bg-[#b8ff2c]/5" : "border-white/8 bg-black/15"}`}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-[#b8ff2c]"
                  checked={selectedReferenceIds.includes(reference.id)}
                  onChange={() => toggleReference(reference.id)}
                />
                <span>
                  <span className="font-semibold text-white">
                    {reference.title}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {reference.creatorName} · {reference.contentCategory}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-4 space-y-2 border-t border-white/8 pt-4">
            {profile.references.map((reference) => (
              <Link
                key={reference.id}
                href={`/references/${reference.id}`}
                className="block text-xs text-slate-500 hover:text-[#d8ff8a]"
              >
                Inspect {reference.title} →
              </Link>
            ))}
          </div>
        </div>
        <div>
          <p className="section-kicker">Why these settings</p>
          <h2 className="font-display mt-1 text-4xl font-bold text-white uppercase">
            Extracted reasons
          </h2>
          <div className="mt-5 space-y-3">
            {profile.features.map((feature) => (
              <article key={feature.id} className="panel p-5">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold text-white">{feature.label}</h3>
                  <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    {Math.round(feature.confidence * 100)}% confidence ·{" "}
                    {feature.sourceReferenceCount} refs
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {feature.reason}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function RangeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span className="flex justify-between gap-2">
        <span className="form-label">{label}</span>
        <span className="text-xs font-bold text-[#b8ff2c]">{value}</span>
      </span>
      <input
        className="mt-3 w-full accent-[#b8ff2c]"
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label>
      <span className="form-label">{label}</span>
      <input
        className="field mt-2"
        type="number"
        min="0.1"
        step="0.1"
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value ? Number(event.target.value) : null)
        }
      />
    </label>
  );
}
function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="form-label">{label}</span>
      <textarea
        className="field mt-2 min-h-20 resize-y"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
