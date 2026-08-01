"use client";

import {
  BarChart3,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { getProgressState } from "@/lib/progress";

type ProgressState = Awaited<ReturnType<typeof getProgressState>>;
type ProgressProfile = ProgressState["profiles"][number];
type ProgressMetric =
  ProgressState["profiles"][number]["snapshots"][number]["metrics"][number];

function requestError(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  return "The local progress action could not be completed.";
}

async function progressRequest(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as {
    progress?: ProgressState;
  } | null;
  if (!response.ok || !body?.progress) throw new Error(requestError(body));
  return body.progress;
}

function displayValue(metric: ProgressMetric) {
  if (metric.value === null) return "Unavailable";
  const formatted = Number.isInteger(metric.value)
    ? metric.value.toFixed(0)
    : metric.value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `${formatted} ${metric.unit}`;
}

export function ProgressWorkspace({
  initialState,
}: {
  initialState: ProgressState;
}) {
  const [state, setState] = useState(initialState);
  const [activeProfileId, setActiveProfileId] = useState(
    initialState.profiles[0]?.id ?? "",
  );
  const [profileName, setProfileName] = useState("My local R6 progress");
  const [preferredAlias, setPreferredAlias] = useState("User");
  const [selectedProjectIds, setSelectedProjectIds] = useState(
    initialState.availableProjects.map((project) => project.id),
  );
  const [snapshotReason, setSnapshotReason] = useState(
    "Evidence-backed progress checkpoint",
  );
  const [inputMode, setInputMode] = useState("");
  const [mapFilter, setMapFilter] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("");
  const [sideFilter, setSideFilter] = useState("");
  const [noteText, setNoteText] = useState("");
  const [goalName, setGoalName] = useState("");
  const [goalText, setGoalText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const activeProfile = state.profiles.find(
    (profile) => profile.id === activeProfileId,
  );
  const currentSnapshot = activeProfile?.snapshots[0] ?? null;
  const maps = useMemo(
    () =>
      [
        ...new Set(
          state.availableProjects
            .map((project) => project.map)
            .filter((item): item is string => Boolean(item)),
        ),
      ].sort(),
    [state.availableProjects],
  );
  const operators = useMemo(
    () =>
      [
        ...new Set(
          state.availableProjects
            .map((project) => project.operator)
            .filter((item): item is string => Boolean(item)),
        ),
      ].sort(),
    [state.availableProjects],
  );

  function acceptState(next: ProgressState) {
    setState(next);
    if (
      activeProfileId &&
      !next.profiles.some((profile) => profile.id === activeProfileId)
    ) {
      setActiveProfileId(next.profiles[0]?.id ?? "");
    }
  }

  async function run(
    action: () => Promise<ProgressState>,
    successMessage: string,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      acceptState(await action());
      setMessage(successMessage);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The local progress action failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createProfile(event: React.FormEvent) {
    event.preventDefault();
    await run(async () => {
      const next = await progressRequest("/api/player-profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: profileName,
          preferredAlias: preferredAlias || null,
        }),
      });
      const created = next.profiles.find(
        (profile) =>
          !state.profiles.some((current) => current.id === profile.id),
      );
      if (created) setActiveProfileId(created.id);
      return next;
    }, "Local player profile created.");
  }

  async function createSnapshot(event: React.FormEvent) {
    event.preventDefault();
    if (!activeProfile) return;
    await run(
      () =>
        progressRequest(`/api/player-profiles/${activeProfile.id}/snapshots`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectIds: selectedProjectIds,
            reason: snapshotReason,
            filters: {
              inputMode: inputMode || null,
              map: mapFilter || null,
              operator: operatorFilter || null,
              side: sideFilter || null,
            },
          }),
        }),
      "Immutable progress snapshot saved.",
    );
  }

  async function createNote(event: React.FormEvent) {
    event.preventDefault();
    if (!activeProfile) return;
    await run(async () => {
      const next = await progressRequest(
        `/api/player-profiles/${activeProfile.id}/notes`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: noteText,
            snapshotId: currentSnapshot?.id ?? null,
          }),
        },
      );
      setNoteText("");
      return next;
    }, "Progress note saved locally.");
  }

  async function createGoal(event: React.FormEvent) {
    event.preventDefault();
    if (!activeProfile) return;
    await run(async () => {
      const next = await progressRequest(
        `/api/player-profiles/${activeProfile.id}/goals`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: goalName,
            measurableGoal: goalText,
            snapshotId: currentSnapshot?.id ?? null,
          }),
        },
      );
      setGoalName("");
      setGoalText("");
      return next;
    }, "Practice goal saved locally.");
  }

  return (
    <div className="space-y-8">
      {(message || error) && (
        <div
          role="status"
          className={`rounded-2xl border p-4 text-sm ${
            error
              ? "border-rose-300/20 bg-rose-300/7 text-rose-100"
              : "border-[#b8ff2c]/20 bg-[#b8ff2c]/7 text-[#d8ff8a]"
          }`}
        >
          {error || message}
        </div>
      )}

      <section className="panel p-5 sm:p-6">
        <p className="section-kicker">Local player profile</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {state.profiles.map((profile) => (
            <button
              type="button"
              key={profile.id}
              onClick={() => setActiveProfileId(profile.id)}
              className={
                activeProfileId === profile.id
                  ? "primary-button"
                  : "secondary-button"
              }
            >
              {profile.name}
            </button>
          ))}
        </div>
        <form
          onSubmit={createProfile}
          className="mt-6 grid gap-4 border-t border-white/8 pt-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_auto]"
        >
          <label className="text-sm font-semibold text-slate-300">
            <span className="mb-2 block">New profile name</span>
            <input
              className="input-field"
              value={profileName}
              maxLength={100}
              onChange={(event) => setProfileName(event.target.value)}
              required
            />
          </label>
          <label className="text-sm font-semibold text-slate-300">
            <span className="mb-2 block">Preferred local alias</span>
            <input
              className="input-field"
              value={preferredAlias}
              maxLength={100}
              onChange={(event) => setPreferredAlias(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="primary-button self-end"
            disabled={busy}
          >
            <Plus size={16} /> Create profile
          </button>
        </form>
      </section>

      {!activeProfile ? (
        <section className="panel p-8 text-center">
          <BarChart3 className="mx-auto text-slate-700" size={34} />
          <h2 className="mt-4 text-xl font-semibold text-white">
            Create your first local player profile
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            A profile groups only the projects you deliberately select. It does
            not identify you or combine another user&apos;s private data.
          </p>
        </section>
      ) : (
        <>
          <section className="panel p-5 sm:p-6">
            <p className="section-kicker">Deliberate snapshot</p>
            <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
              Choose the evidence window
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              Snapshots never update silently. Select projects, filters, and a
              reason, then save a new immutable version.
            </p>
            <form onSubmit={createSnapshot} className="mt-6 space-y-6">
              <fieldset>
                <legend className="text-sm font-semibold text-slate-300">
                  Included projects
                </legend>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {state.availableProjects.map((project) => (
                    <label
                      key={project.id}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/8 bg-black/15 p-4"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProjectIds.includes(project.id)}
                        onChange={(event) =>
                          setSelectedProjectIds((current) =>
                            event.target.checked
                              ? [...new Set([...current, project.id])]
                              : current.filter((id) => id !== project.id),
                          )
                        }
                      />
                      <span>
                        <span className="block font-semibold text-white">
                          {project.name}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">
                          {project.inputMode.toLowerCase().replaceAll("_", " ")}
                          {" · "}
                          {project.map ?? "map unavailable"}
                          {" · "}
                          {project.operator ?? "operator unavailable"}
                          {" · "}
                          {project.replayEvidence ?? "no replay facts"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <FilterSelect
                  label="Input mode"
                  value={inputMode}
                  onChange={setInputMode}
                  options={[
                    ["SCREEN_RECORDING_ONLY", "Recording only"],
                    ["MATCH_REPLAY_ONLY", "Replay only"],
                    ["SCREEN_RECORDING_AND_REPLAY", "Combined"],
                  ]}
                />
                <FilterSelect
                  label="Map"
                  value={mapFilter}
                  onChange={setMapFilter}
                  options={maps.map((item) => [item, item])}
                />
                <FilterSelect
                  label="Operator"
                  value={operatorFilter}
                  onChange={setOperatorFilter}
                  options={operators.map((item) => [item, item])}
                />
                <FilterSelect
                  label="User-confirmed side"
                  value={sideFilter}
                  onChange={setSideFilter}
                  options={[
                    ["ATTACK", "Attack"],
                    ["DEFENSE", "Defense"],
                  ]}
                />
              </div>
              <label className="block text-sm font-semibold text-slate-300">
                <span className="mb-2 block">Why save this snapshot?</span>
                <input
                  className="input-field"
                  value={snapshotReason}
                  maxLength={500}
                  onChange={(event) => setSnapshotReason(event.target.value)}
                  required
                />
              </label>
              <button
                type="submit"
                className="primary-button"
                disabled={busy || selectedProjectIds.length === 0}
              >
                <ClipboardList size={16} /> Save progress snapshot
              </button>
            </form>
          </section>

          {currentSnapshot ? (
            <>
              <SnapshotPanel
                profile={activeProfile}
                snapshot={currentSnapshot}
                busy={busy}
                onDelete={() => {
                  if (
                    !window.confirm(
                      `Delete progress snapshot version ${currentSnapshot.version}? Source projects will not be deleted.`,
                    )
                  ) {
                    return;
                  }
                  void run(
                    () =>
                      progressRequest(
                        `/api/player-profiles/${activeProfile.id}/snapshots/${currentSnapshot.id}`,
                        { method: "DELETE" },
                      ),
                    "Progress snapshot deleted. Source projects were preserved.",
                  );
                }}
              />
              <ComparisonPanel metrics={currentSnapshot.metrics} />
            </>
          ) : (
            <section className="panel p-8 text-center text-sm text-slate-500">
              This profile has no progress snapshot yet.
            </section>
          )}

          <div className="grid gap-8 xl:grid-cols-2">
            <section className="panel p-5 sm:p-6">
              <p className="section-kicker">User context</p>
              <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
                Progress notes
              </h2>
              <form onSubmit={createNote} className="mt-5 space-y-3">
                <label className="block text-sm font-semibold text-slate-300">
                  <span className="mb-2 block">New note</span>
                  <textarea
                    className="input-field min-h-24"
                    value={noteText}
                    maxLength={2_000}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder="What did you notice? Keep facts and interpretations separate."
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="secondary-button"
                  disabled={busy}
                >
                  Save note
                </button>
              </form>
              <div className="mt-5 space-y-3">
                {activeProfile.progressNotes.map((note) => (
                  <article
                    key={note.id}
                    className="rounded-2xl border border-white/8 bg-black/15 p-4"
                  >
                    <p className="text-sm leading-6 text-slate-300">
                      {note.text}
                    </p>
                    <button
                      type="button"
                      className="secondary-button mt-3"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            progressRequest(
                              `/api/player-profiles/${activeProfile.id}/notes/${note.id}`,
                              { method: "DELETE" },
                            ),
                          "Progress note deleted.",
                        )
                      }
                    >
                      <Trash2 size={14} /> Delete note
                    </button>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel p-5 sm:p-6">
              <p className="section-kicker">Deliberate practice</p>
              <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
                Practice goals
              </h2>
              <form onSubmit={createGoal} className="mt-5 space-y-3">
                <label className="block text-sm font-semibold text-slate-300">
                  <span className="mb-2 block">Goal name</span>
                  <input
                    className="input-field"
                    value={goalName}
                    maxLength={150}
                    onChange={(event) => setGoalName(event.target.value)}
                    required
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-300">
                  <span className="mb-2 block">Measurable target</span>
                  <textarea
                    className="input-field min-h-20"
                    value={goalText}
                    maxLength={1_000}
                    onChange={(event) => setGoalText(event.target.value)}
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="secondary-button"
                  disabled={busy}
                >
                  Save goal
                </button>
              </form>
              <div className="mt-5 space-y-3">
                {activeProfile.practiceGoals.map((goal) => (
                  <article
                    key={goal.id}
                    className="rounded-2xl border border-white/8 bg-black/15 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-white">
                          {goal.name}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          {goal.measurableGoal}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold tracking-[0.08em] text-[#b8ff2c] uppercase">
                        {goal.status.toLowerCase()}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              progressRequest(
                                `/api/player-profiles/${activeProfile.id}/goals/${goal.id}`,
                                {
                                  method: "PATCH",
                                  headers: {
                                    "content-type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    status:
                                      goal.status === "COMPLETED"
                                        ? "ACTIVE"
                                        : "COMPLETED",
                                  }),
                                },
                              ),
                            goal.status === "COMPLETED"
                              ? "Practice goal reopened."
                              : "Practice goal marked completed.",
                          )
                        }
                      >
                        <CheckCircle2 size={14} />
                        {goal.status === "COMPLETED" ? "Reopen" : "Complete"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              progressRequest(
                                `/api/player-profiles/${activeProfile.id}/goals/${goal.id}`,
                                { method: "DELETE" },
                              ),
                            "Practice goal deleted.",
                          )
                        }
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-amber-300/15 bg-amber-300/5 p-5 text-sm leading-6 text-amber-100/80">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 shrink-0" size={18} />
              <p>
                Progress metrics describe saved evidence and user decisions. A
                higher, lower, or changed number does not prove that play
                improved or that one event caused another. Always review sample
                size, evidence class, source version, and unavailable context.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="text-sm font-semibold text-slate-300">
      <span className="mb-2 block">{label}</span>
      <select
        className="input-field"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">All</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function SnapshotPanel({
  profile,
  snapshot,
  busy,
  onDelete,
}: {
  profile: ProgressProfile;
  snapshot: ProgressProfile["snapshots"][number];
  busy: boolean;
  onDelete: () => void;
}) {
  const metrics = snapshot.metrics.filter(
    (item) =>
      item.metricGroup !== "FIRST_FIVE" && item.metricGroup !== "LATEST_FIVE",
  );
  return (
    <section className="panel p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="section-kicker">Immutable snapshot</p>
          <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
            Version {snapshot.version}
          </h2>
          <p className="mt-2 text-sm text-slate-400">{snapshot.reason}</p>
          <p className="mt-2 text-xs text-slate-600">
            {snapshot.metricVersion} · {snapshot.projects.length} selected
            project{snapshot.projects.length === 1 ? "" : "s"} ·{" "}
            {new Date(snapshot.createdAt).toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={onDelete}
        >
          <Trash2 size={14} /> Delete snapshot
        </button>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </div>
      {profile.snapshots.length > 1 && (
        <details className="mt-5 rounded-2xl border border-white/8 bg-black/15 p-4">
          <summary className="cursor-pointer font-semibold text-white">
            Older immutable snapshots ({profile.snapshots.length - 1})
          </summary>
          <div className="mt-3 space-y-2 text-sm text-slate-400">
            {profile.snapshots.slice(1).map((item) => (
              <p key={item.id}>
                Version {item.version} · {item.reason} · {item.projects.length}{" "}
                projects
              </p>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function MetricCard({ metric }: { metric: ProgressMetric }) {
  return (
    <article className="rounded-2xl border border-white/8 bg-black/15 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">{metric.label}</h3>
        <span className="text-[9px] font-bold tracking-[0.08em] text-slate-600 uppercase">
          {metric.availability.replaceAll("_", " ")}
        </span>
      </div>
      <p className="font-display mt-3 text-2xl font-bold text-[#b8ff2c]">
        {displayValue(metric)}
      </p>
      <p className="mt-1 text-xs text-slate-600">
        Sample {metric.sampleSize} · {metric.evidenceClass.toLowerCase()}
      </p>
      <details className="mt-3 text-xs text-slate-400">
        <summary className="cursor-pointer font-semibold text-slate-300">
          Why this number?
        </summary>
        <p className="mt-2 leading-5">{metric.explanation}</p>
        <p className="mt-2 break-words text-slate-600">
          Versions:{" "}
          {metric.sourceVersions.length
            ? metric.sourceVersions.join(" · ")
            : "Unavailable"}
        </p>
        {metric.sourceEvidence.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-500">
            {metric.sourceEvidence.slice(0, 12).map((item, index) => (
              <li key={`${metric.id}-${index}`}>{String(item)}</li>
            ))}
          </ul>
        )}
      </details>
    </article>
  );
}

function ComparisonPanel({ metrics }: { metrics: ProgressMetric[] }) {
  const first = metrics.filter((item) => item.metricGroup === "FIRST_FIVE");
  const latest = metrics.filter((item) => item.metricGroup === "LATEST_FIVE");
  const rows = first.map((firstMetric) => {
    const baseKey = firstMetric.key.replace("first_five.", "");
    return {
      key: baseKey,
      first: firstMetric,
      latest: latest.find((item) => item.key === `latest_five.${baseKey}`),
    };
  });
  if (!rows.length) return null;
  return (
    <section className="panel p-5 sm:p-6">
      <p className="section-kicker">Transparent windows</p>
      <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
        First five / latest five
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
        Windows use project creation order and may overlap when fewer than ten
        projects are selected. Insufficient samples remain visible.
      </p>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="text-xs tracking-[0.08em] text-slate-600 uppercase">
            <tr>
              <th className="border-b border-white/8 px-3 py-3">Metric</th>
              <th className="border-b border-white/8 px-3 py-3">First five</th>
              <th className="border-b border-white/8 px-3 py-3">Latest five</th>
              <th className="border-b border-white/8 px-3 py-3">
                Honest reading
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, first: firstMetric, latest: latestMetric }) => {
              const firstValue = firstMetric.value;
              const latestValue = latestMetric?.value ?? null;
              const reading =
                firstValue === null || latestValue === null
                  ? "Unavailable"
                  : firstMetric.availability !== "AVAILABLE" ||
                      latestMetric?.availability !== "AVAILABLE"
                    ? "Insufficient sample"
                    : latestValue === firstValue
                      ? "No numerical change"
                      : latestValue > firstValue
                        ? "Higher; cause unknown"
                        : "Lower; cause unknown";
              return (
                <tr key={key}>
                  <th className="border-b border-white/7 px-3 py-3 font-semibold text-white">
                    {firstMetric.label.replace("First five · ", "")}
                  </th>
                  <td className="border-b border-white/7 px-3 py-3 text-slate-300">
                    {displayValue(firstMetric)} · sample{" "}
                    {firstMetric.sampleSize}
                  </td>
                  <td className="border-b border-white/7 px-3 py-3 text-slate-300">
                    {latestMetric ? displayValue(latestMetric) : "Unavailable"}{" "}
                    · sample {latestMetric?.sampleSize ?? 0}
                  </td>
                  <td className="border-b border-white/7 px-3 py-3 text-slate-500">
                    {reading}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ProjectProgressLink({
  studioProjectId,
}: {
  studioProjectId: string;
}) {
  return (
    <Link
      href={`/progress?project=${studioProjectId}`}
      className="secondary-button no-underline"
    >
      <BarChart3 size={15} /> Progress
    </Link>
  );
}
