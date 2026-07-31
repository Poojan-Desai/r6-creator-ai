"use client";

import {
  ArrowRight,
  Check,
  CircleAlert,
  Film,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

import type {
  StudioProjectDto,
  StudioProjectOptions,
} from "@/lib/studio-projects";
import { formatDuration } from "@/lib/time";

const outputGoals = [
  ["SHORT_CLIP", "Short clip", "One focused gameplay moment."],
  ["YOUTUBE_SHORT", "YouTube Short", "A vertical YouTube story."],
  ["TIKTOK", "TikTok", "A compact vertical post."],
  [
    "LONG_FORM_YOUTUBE",
    "Long-form YouTube video",
    "A complete story from one or more recordings.",
  ],
  ["MATCH_RECAP", "Match recap", "Important rounds and supported events."],
  ["COACHING_REPORT", "Coaching report", "Evidence-backed personal review."],
  [
    "CONTENT_AND_COACHING",
    "Both content and coaching",
    "Publishing and review from one evidence set.",
  ],
] as const;

const inputModes = [
  [
    "SCREEN_RECORDING_ONLY",
    "Screen recording only",
    "Real gameplay pixels, audio, transcript, and clips.",
  ],
  [
    "MATCH_REPLAY_ONLY",
    "Match Replay only",
    "Structured facts only. Replay files contain no gameplay video or audio.",
  ],
  [
    "SCREEN_RECORDING_AND_REPLAY",
    "Both — recommended",
    "Recording visuals plus replay facts after synchronization.",
  ],
] as const;

const referenceModes = [
  ["NONE", "No reference", "Use your instructions and source evidence."],
  [
    "STYLE_PROFILE",
    "Creator Style Profile",
    "Use saved high-level pacing and structure.",
  ],
  [
    "YOUTUBE_REFERENCE",
    "YouTube reference",
    "Use permitted metadata and structural notes only.",
  ],
  [
    "LOCAL_REFERENCE",
    "Permitted local reference",
    "Use measured characteristics from a file you may analyze.",
  ],
] as const;

const focusChoices = [
  "Final-round clutch",
  "Funny moments",
  "Best kills",
  "Educational breakdown",
  "Full ranked-match story",
  "Mistakes",
  "Crosshair placement",
  "Positioning",
  "Re-peeks",
  "Team play",
  "Objective play",
] as const;

type Props = {
  options: StudioProjectOptions;
  project?: StudioProjectDto;
};

function inputId(project: StudioProjectDto | undefined, kind: string) {
  const input = project?.inputs.find((item) => item.kind === kind);
  return (
    input?.videoProject?.id ??
    input?.replayPackage?.id ??
    input?.referenceVideo?.id ??
    ""
  );
}

export function StudioProjectForm({ options, project }: Props) {
  const router = useRouter();
  const initialPrimary = inputId(project, "PRIMARY_RECORDING");
  const initialReplay = inputId(project, "MATCH_REPLAY");
  const initialReference =
    inputId(project, "LOCAL_REFERENCE") ||
    inputId(project, "YOUTUBE_REFERENCE");
  const [inputMode, setInputMode] = useState(
    project?.inputMode ??
      (options.recordings.length
        ? "SCREEN_RECORDING_ONLY"
        : "MATCH_REPLAY_ONLY"),
  );
  const [referenceMode, setReferenceMode] = useState(
    project?.referenceMode ?? "NONE",
  );
  const [primaryRecordingId, setPrimaryRecordingId] = useState(initialPrimary);
  const [additionalRecordingIds, setAdditionalRecordingIds] = useState(
    project?.inputs
      .filter((item) => item.kind === "ADDITIONAL_RECORDING")
      .flatMap((item) => (item.videoProject ? [item.videoProject.id] : [])) ??
      [],
  );
  const [replayPackageId, setReplayPackageId] = useState(initialReplay);
  const [referenceVideoId, setReferenceVideoId] = useState(initialReference);
  const [styleProfileId, setStyleProfileId] = useState(
    project?.styleProfile?.id ?? "",
  );
  const [mapId, setMapId] = useState(project?.map?.id ?? "");
  const [mapVersionId, setMapVersionId] = useState(
    project?.mapVersion?.id ?? "",
  );
  const [operatorId, setOperatorId] = useState(project?.operator?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordingIds = useMemo(
    () =>
      [primaryRecordingId, ...additionalRecordingIds].filter(
        (value): value is string => Boolean(value),
      ),
    [additionalRecordingIds, primaryRecordingId],
  );
  const audioTracks = options.recordings
    .filter((recording) => recordingIds.includes(recording.id))
    .flatMap((recording) =>
      recording.audioTracks.map((track) => ({
        ...track,
        recordingName: recording.name,
      })),
    );
  const replay = options.replays.find((item) => item.id === replayPackageId);
  const selectedMap = options.maps.find((item) => item.id === mapId);
  const selectedMapVersion = selectedMap?.versions.find(
    (item) => item.id === mapVersionId,
  );
  const selectedOperator = options.operators.find(
    (item) => item.id === operatorId,
  );
  const showRecording = inputMode !== "MATCH_REPLAY_ONLY";
  const showReplay = inputMode !== "SCREEN_RECORDING_ONLY";

  function toggleAdditional(id: string) {
    setAdditionalRecordingIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      outputGoal: String(form.get("outputGoal") ?? ""),
      inputMode,
      referenceMode,
      focusAreas: form.getAll("focusAreas").map(String),
      contentInstructions: String(form.get("contentInstructions") ?? ""),
      coachingGoals: String(form.get("coachingGoals") ?? ""),
      primaryRecordingId: showRecording ? primaryRecordingId || null : null,
      additionalRecordingIds: showRecording ? additionalRecordingIds : [],
      replayPackageId: showReplay ? replayPackageId || null : null,
      referenceVideoId:
        referenceMode === "LOCAL_REFERENCE" ||
        referenceMode === "YOUTUBE_REFERENCE"
          ? referenceVideoId || null
          : null,
      styleProfileId:
        referenceMode === "STYLE_PROFILE" ? styleProfileId || null : null,
      selectedPlayerStableId: showReplay
        ? String(form.get("selectedPlayerStableId") ?? "") || null
        : null,
      selectedAudioTrackId: showRecording
        ? String(form.get("selectedAudioTrackId") ?? "") || null
        : null,
      mapId: mapId || null,
      mapVersionId: mapVersionId || null,
      bombSiteId: String(form.get("bombSiteId") ?? "") || null,
      side: String(form.get("side") ?? "UNKNOWN"),
      operatorId: operatorId || null,
      operatorVersionId: String(form.get("operatorVersionId") ?? "") || null,
      roundResult: String(form.get("roundResult") ?? "") || null,
      contextUserConfirmed: form.get("contextUserConfirmed") === "on",
    };
    try {
      const response = await fetch(
        project ? `/api/studio-projects/${project.id}` : "/api/studio-projects",
        {
          method: project ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as {
        project?: { id: string };
        error?: { message?: string };
      };
      if (!response.ok || !result.project?.id) {
        throw new Error(
          result.error?.message ??
            "The unified project could not be saved. Your source files were not changed.",
        );
      }
      router.push(`/studio/${result.project.id}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The unified project could not be saved.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-7" onSubmit={submit}>
      <FormSection
        number="01"
        title="What are you creating?"
        description="Choose the main result. You can keep content and coaching in one project."
      >
        <label className="block">
          <span className="form-label">Project name</span>
          <input
            className="field mt-2"
            name="name"
            maxLength={120}
            required
            defaultValue={project?.name ?? ""}
            placeholder="Friday ranked session"
          />
        </label>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {outputGoals.map(([value, label, description], index) => (
            <ChoiceCard
              key={value}
              name="outputGoal"
              value={value}
              label={label}
              description={description}
              defaultChecked={
                project ? project.outputGoal === value : index === 1
              }
            />
          ))}
        </div>
      </FormSection>

      <FormSection
        number="02"
        title="What are you uploading?"
        description="Select sources already saved in this app. Add new source files through their existing safe import screens."
      >
        <div className="grid gap-3 md:grid-cols-3">
          {inputModes.map(([value, label, description]) => (
            <ChoiceCard
              key={value}
              name="inputModeChoice"
              value={value}
              label={label}
              description={description}
              checked={inputMode === value}
              onChange={() => setInputMode(value)}
            />
          ))}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {showRecording && (
            <div className="rounded-2xl border border-white/8 bg-black/15 p-5">
              <label className="block">
                <span className="form-label">Primary screen recording</span>
                <select
                  className="field mt-2"
                  value={primaryRecordingId}
                  onChange={(event) => {
                    setPrimaryRecordingId(event.target.value);
                    setAdditionalRecordingIds((current) =>
                      current.filter((id) => id !== event.target.value),
                    );
                  }}
                  required
                >
                  <option value="">Choose a saved MP4</option>
                  {options.recordings.map((recording) => (
                    <option key={recording.id} value={recording.id}>
                      {recording.name} ·{" "}
                      {formatDuration(recording.durationSeconds)}
                    </option>
                  ))}
                </select>
              </label>
              <Link
                className="mt-3 inline-flex text-xs font-semibold text-[#b8ff2c]"
                href="/#recording-upload"
              >
                Upload another recording
              </Link>
              {options.recordings.length > 1 && (
                <fieldset className="mt-5">
                  <legend className="form-label">
                    Optional additional recordings
                  </legend>
                  <div className="mt-3 space-y-2">
                    {options.recordings
                      .filter(
                        (recording) => recording.id !== primaryRecordingId,
                      )
                      .map((recording) => (
                        <label
                          key={recording.id}
                          className="flex items-start gap-3 rounded-xl border border-white/8 p-3 text-sm text-slate-300"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-[#b8ff2c]"
                            checked={additionalRecordingIds.includes(
                              recording.id,
                            )}
                            onChange={() => toggleAdditional(recording.id)}
                          />
                          <span>{recording.name}</span>
                        </label>
                      ))}
                  </div>
                </fieldset>
              )}
            </div>
          )}

          {showReplay && (
            <div className="rounded-2xl border border-white/8 bg-black/15 p-5">
              <label className="block">
                <span className="form-label">Match Replay package</span>
                <select
                  className="field mt-2"
                  value={replayPackageId}
                  onChange={(event) => setReplayPackageId(event.target.value)}
                  required
                >
                  <option value="">Choose a saved replay</option>
                  {options.replays
                    .filter((item) => item.permissionConfirmed)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.displayName} · {item.roundFileCount} rounds ·{" "}
                        {item.status.toLowerCase().replaceAll("_", " ")}
                      </option>
                    ))}
                </select>
              </label>
              <Link
                className="mt-3 inline-flex text-xs font-semibold text-[#b8ff2c]"
                href="/replays"
              >
                Import another Match Replay
              </Link>
              <p className="mt-4 text-xs leading-5 text-slate-500">
                A replay contributes supported structured facts only. It never
                replaces gameplay footage or audio.
              </p>
            </div>
          )}
        </div>
      </FormSection>

      <FormSection
        number="03"
        title="What reference should be used?"
        description="References guide high-level structure only. Generated work must remain original."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {referenceModes.map(([value, label, description]) => (
            <ChoiceCard
              key={value}
              name="referenceModeChoice"
              value={value}
              label={label}
              description={description}
              checked={referenceMode === value}
              onChange={() => {
                setReferenceMode(value);
                setReferenceVideoId("");
                setStyleProfileId("");
              }}
            />
          ))}
        </div>
        {referenceMode === "STYLE_PROFILE" && (
          <label className="mt-5 block">
            <span className="form-label">Creator Style Profile</span>
            <select
              className="field mt-2"
              value={styleProfileId}
              onChange={(event) => setStyleProfileId(event.target.value)}
              required
            >
              <option value="">Choose a profile</option>
              {options.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {(referenceMode === "LOCAL_REFERENCE" ||
          referenceMode === "YOUTUBE_REFERENCE") && (
          <label className="mt-5 block">
            <span className="form-label">Saved reference</span>
            <select
              className="field mt-2"
              value={referenceVideoId}
              onChange={(event) => setReferenceVideoId(event.target.value)}
              required
            >
              <option value="">Choose a reference</option>
              {options.references
                .filter(
                  (reference) =>
                    reference.referenceType ===
                      (referenceMode === "LOCAL_REFERENCE"
                        ? "LOCAL_VIDEO"
                        : "YOUTUBE_LINK") &&
                    (reference.referenceType === "YOUTUBE_LINK" ||
                      reference.permissionConfirmed),
                )
                .map((reference) => (
                  <option key={reference.id} value={reference.id}>
                    {reference.title} · {reference.creatorName}
                  </option>
                ))}
            </select>
          </label>
        )}
      </FormSection>

      <FormSection
        number="04"
        title="What should the app focus on?"
        description="Choose any useful themes. These are instructions, not claims about what detection has confirmed."
      >
        <fieldset>
          <legend className="sr-only">Focus areas</legend>
          <div className="flex flex-wrap gap-2">
            {focusChoices.map((focus) => (
              <label
                key={focus}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-3 py-2 text-sm text-slate-300 has-checked:border-[#b8ff2c]/40 has-checked:bg-[#b8ff2c]/8 has-checked:text-white"
              >
                <input
                  type="checkbox"
                  className="accent-[#b8ff2c]"
                  name="focusAreas"
                  value={focus}
                  defaultChecked={project?.focusAreas.includes(focus)}
                />
                {focus}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-6 block">
          <span className="form-label">Content instructions</span>
          <textarea
            className="field mt-2 min-h-32 resize-y"
            name="contentInstructions"
            maxLength={5_000}
            defaultValue={project?.contentInstructions ?? ""}
            placeholder="Turn this recording into a 45-second high-energy Short. Show the result briefly at the beginning, explain the setup, remove dead time, and write a natural voiceover."
          />
        </label>
        <label className="mt-5 block">
          <span className="form-label">Coaching goals</span>
          <textarea
            className="field mt-2 min-h-24 resize-y"
            name="coachingGoals"
            maxLength={5_000}
            defaultValue={project?.coachingGoals ?? ""}
            placeholder="Review visible re-peeks, positioning, and objective decisions. Keep uncertainty explicit."
          />
        </label>
      </FormSection>

      <FormSection
        number="05"
        title="Identity, audio, and match context"
        description="These optional user-confirmed facts improve later scripts and coaching without guessing."
      >
        <div className="grid gap-5 md:grid-cols-2">
          {showReplay && (
            <label className="block">
              <span className="form-label">Your replay player</span>
              <select
                className="field mt-2"
                name="selectedPlayerStableId"
                defaultValue={project?.selectedPlayerStableId ?? ""}
              >
                <option value="">Not selected</option>
                {replay?.players.map((player) => (
                  <option key={player.stableId} value={player.stableId}>
                    {player.privacyAlias}
                    {player.operatorName ? ` · ${player.operatorName}` : ""}
                    {player.isRecordingPlayer ? " · recording player" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {showRecording && (
            <label className="block">
              <span className="form-label">Creator audio track</span>
              <select
                className="field mt-2"
                name="selectedAudioTrackId"
                defaultValue={project?.selectedAudioTrack?.id ?? ""}
              >
                <option value="">Not selected</option>
                {audioTracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.recordingName} · track {track.streamIndex}
                    {track.title ? ` · ${track.title}` : ""}
                    {track.role
                      ? ` · ${track.role.toLowerCase().replaceAll("_", " ")}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="form-label">Map</span>
            <select
              className="field mt-2"
              value={mapId}
              onChange={(event) => {
                setMapId(event.target.value);
                setMapVersionId("");
              }}
            >
              <option value="">Unknown or not selected</option>
              {options.maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="form-label">Map version</span>
            <select
              className="field mt-2"
              value={mapVersionId}
              onChange={(event) => setMapVersionId(event.target.value)}
              disabled={!selectedMap}
            >
              <option value="">Not selected</option>
              {selectedMap?.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.name} ·{" "}
                  {version.status.toLowerCase().replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="form-label">Bomb site</span>
            <select
              className="field mt-2"
              name="bombSiteId"
              defaultValue={project?.bombSite?.id ?? ""}
              disabled={!selectedMapVersion}
            >
              <option value="">Unknown or not selected</option>
              {selectedMapVersion?.bombSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="form-label">Attack or defense</span>
            <select
              className="field mt-2"
              name="side"
              defaultValue={project?.side ?? "UNKNOWN"}
            >
              <option value="UNKNOWN">Unknown</option>
              <option value="ATTACK">Attack</option>
              <option value="DEFENSE">Defense</option>
            </select>
          </label>
          <label className="block">
            <span className="form-label">Operator</span>
            <select
              className="field mt-2"
              value={operatorId}
              onChange={(event) => setOperatorId(event.target.value)}
            >
              <option value="">Unknown or not selected</option>
              {options.operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.name} · {operator.side.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="form-label">Operator version</span>
            <select
              className="field mt-2"
              name="operatorVersionId"
              defaultValue={project?.operatorVersion?.id ?? ""}
              disabled={!selectedOperator}
            >
              <option value="">Not selected</option>
              {selectedOperator?.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.name}
                  {version.isCurrent ? " · current" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="form-label">Round result</span>
            <input
              className="field mt-2"
              name="roundResult"
              maxLength={120}
              defaultValue={project?.roundResult ?? ""}
              placeholder="Unknown, won, lost, or your own note"
            />
          </label>
        </div>
        <label className="mt-5 flex items-start gap-3 rounded-2xl border border-[#b8ff2c]/18 bg-[#b8ff2c]/5 p-4 text-sm leading-6 text-slate-300">
          <input
            className="mt-1 accent-[#b8ff2c]"
            type="checkbox"
            name="contextUserConfirmed"
            defaultChecked={project?.contextUserConfirmed}
          />
          <ShieldCheck className="mt-0.5 shrink-0 text-[#b8ff2c]" size={18} />
          <span>
            I confirm the map, operator, side, site, and result fields I entered
            are user-supplied context. The app must not present them as
            automatically detected facts.
          </span>
        </label>
      </FormSection>

      {error && (
        <div className="error-box flex items-start gap-3" role="alert">
          <CircleAlert className="mt-0.5 shrink-0" size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="font-semibold text-white">
            Source files remain unchanged.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            This saves links and instructions locally. It does not start
            analysis or upload data.
          </p>
        </div>
        <button
          className="primary-button shrink-0"
          type="submit"
          disabled={submitting}
        >
          {submitting ? (
            <LoaderCircle className="animate-spin" size={18} />
          ) : project ? (
            <Check size={18} />
          ) : (
            <Film size={18} />
          )}
          {submitting
            ? "Saving…"
            : project
              ? "Save project settings"
              : "Create unified project"}
          {!submitting && <ArrowRight size={17} />}
        </button>
      </div>
    </form>
  );
}

function FormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex gap-4 border-b border-white/8 px-5 py-5 sm:px-7">
        <span className="font-display text-xl font-bold text-[#b8ff2c]">
          {number}
        </span>
        <div>
          <h2 className="font-display text-2xl font-bold text-white uppercase">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="p-5 sm:p-7">{children}</div>
    </section>
  );
}

function ChoiceCard({
  name,
  value,
  label,
  description,
  checked,
  defaultChecked,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  description: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: () => void;
}) {
  return (
    <label className="group relative cursor-pointer rounded-2xl border border-white/9 bg-black/15 p-4 has-checked:border-[#b8ff2c]/45 has-checked:bg-[#b8ff2c]/6">
      <input
        type="radio"
        className="peer sr-only"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={checked === undefined ? defaultChecked : undefined}
        onChange={onChange}
      />
      <span className="absolute top-4 right-4 grid size-5 place-items-center rounded-full border border-white/20 text-transparent peer-checked:border-[#b8ff2c] peer-checked:bg-[#b8ff2c] peer-checked:text-black">
        <Check size={13} strokeWidth={3} />
      </span>
      <span className="block pr-7 font-semibold text-white">{label}</span>
      <span className="mt-2 block text-xs leading-5 text-slate-500">
        {description}
      </span>
    </label>
  );
}
