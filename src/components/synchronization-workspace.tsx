"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Copy,
  Eye,
  Link2,
  Loader2,
  Plus,
  Radar,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SourcePlayer } from "@/components/source-player";
import type { SynchronizationWorkspaceDto } from "@/lib/replay-video-sync";
import { formatDuration } from "@/lib/time";

type Workspace = SynchronizationWorkspaceDto;
type Synchronization = NonNullable<Workspace["selectedSynchronization"]>;
type SynchronizationAnchor = Synchronization["anchors"][number];

type AnchorForm = {
  kind: string;
  label: string;
  videoTimestampSeconds: string;
  replayTimestampSeconds: string;
  replayRoundIndex: string;
  replayEventStableId: string;
  videoObservation: string;
  alignmentInference: string;
  confidence: string;
  userConfirmed: boolean;
};

const emptyAnchorForm: AnchorForm = {
  kind: "ROUND_START",
  label: "",
  videoTimestampSeconds: "0",
  replayTimestampSeconds: "0",
  replayRoundIndex: "",
  replayEventStableId: "",
  videoObservation: "",
  alignmentInference: "",
  confidence: "0.8",
  userConfirmed: false,
};

const SYNCHRONIZATION_ANCHOR_OPTIONS = [
  { value: "ROUND_START", label: "Round start" },
  { value: "ROUND_END", label: "Round ending" },
  { value: "KILL", label: "Kill" },
  { value: "DEATH", label: "Death" },
  { value: "HEADSHOT", label: "Headshot" },
  { value: "DEFUSER_PLANT", label: "Defuser plant" },
  { value: "DEFUSER_DISABLE", label: "Defuser disable" },
  { value: "SCORE_CHANGE", label: "Score change" },
  { value: "TIMER_STATE", label: "Timer state" },
  { value: "MATCH_RESULT", label: "Match result" },
  { value: "LOADING_TRANSITION", label: "Loading transition" },
  { value: "DEATH_SCREEN_TRANSITION", label: "Death-screen transition" },
  { value: "AUDIO_PEAK", label: "Audio peak" },
  { value: "TRANSCRIPT_PHRASE", label: "Transcript phrase" },
  { value: "OTHER", label: "Other matched point" },
] as const;

function formatTimestamp(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "Unavailable";
  const hours = Math.floor(value / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);
  const seconds = value % 60;
  const secondText = seconds.toFixed(2).padStart(5, "0");
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${secondText}`
    : `${minutes}:${secondText}`;
}

function readText(value: Record<string, unknown>, fallback = ""): string {
  return typeof value.text === "string" ? value.text : fallback;
}

function anchorKindForReplayCategory(category: string) {
  if (category === "MATCH_END") return "MATCH_RESULT";
  if (category === "ROUND_END") return "ROUND_END";
  if (
    [
      "KILL",
      "DEATH",
      "HEADSHOT",
      "DEFUSER_PLANT",
      "DEFUSER_DISABLE",
      "ROUND_START",
    ].includes(category)
  ) {
    return category;
  }
  return "OTHER";
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      body.error?.message ?? "The synchronization request could not finish.",
    );
  }
  return body as T;
}

export function SynchronizationWorkspace({
  initialWorkspace,
}: {
  initialWorkspace: Workspace;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingAnchorId, setEditingAnchorId] = useState<string | null>(null);
  const [anchorForm, setAnchorForm] = useState<AnchorForm>(emptyAnchorForm);
  const [roundAdjustment, setRoundAdjustment] = useState({
    replayRoundIndex: "",
    adjustmentSeconds: "0",
    reason: "",
    confidence: "0.8",
    userConfirmed: false,
  });
  const [notes, setNotes] = useState(
    initialWorkspace.selectedSynchronization?.notes ?? "",
  );
  const synchronization = workspace.selectedSynchronization;
  const editable = synchronization?.status === "DRAFT";
  const projectId = workspace.studioProject.id;
  const endpoint = `/api/studio-projects/${projectId}/synchronizations`;

  useEffect(() => {
    function receiveTime(event: Event) {
      const detail = (
        event as CustomEvent<{ projectId?: string; time?: number }>
      ).detail;
      if (
        detail.projectId === workspace.primaryRecording.id &&
        Number.isFinite(detail.time)
      ) {
        setCurrentVideoTime(detail.time ?? 0);
      }
    }
    window.addEventListener("r6-source-time", receiveTime);
    return () => window.removeEventListener("r6-source-time", receiveTime);
  }, [workspace.primaryRecording.id]);

  async function refresh(version?: number) {
    const result = await jsonRequest<{ workspace: Workspace }>(
      `${endpoint}${version ? `?version=${version}` : ""}`,
    );
    setNotes(result.workspace.selectedSynchronization?.notes ?? "");
    setWorkspace(result.workspace);
    const selectedVersion =
      version ?? result.workspace.selectedSynchronization?.version;
    if (selectedVersion) {
      window.history.replaceState(
        null,
        "",
        `/studio/${projectId}/sync?version=${selectedVersion}`,
      );
    }
  }

  async function perform(
    action: string,
    work: () => Promise<void>,
    successMessage?: string,
  ) {
    setBusyAction(action);
    setError("");
    setSuccess("");
    try {
      await work();
      if (successMessage) setSuccess(successMessage);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The synchronization request could not finish.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function createDraft(basedOnVersionId?: string) {
    await perform(
      "create",
      async () => {
        const result = await jsonRequest<{
          synchronization: Synchronization;
        }>(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            basedOnVersionId: basedOnVersionId ?? null,
          }),
        });
        await refresh(result.synchronization.version);
      },
      basedOnVersionId
        ? "A new editable correction version was created."
        : "Synchronization draft created.",
    );
  }

  async function submitAnchor(event: React.FormEvent) {
    event.preventDefault();
    if (!synchronization) return;
    await perform(
      "anchor",
      async () => {
        const url = editingAnchorId
          ? `${endpoint}/${synchronization.id}/anchors/${editingAnchorId}`
          : `${endpoint}/${synchronization.id}/anchors`;
        await jsonRequest(url, {
          method: editingAnchorId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: anchorForm.kind,
            label: anchorForm.label,
            videoTimestampSeconds: Number(anchorForm.videoTimestampSeconds),
            replayTimestampSeconds: Number(anchorForm.replayTimestampSeconds),
            replayRoundIndex: anchorForm.replayRoundIndex
              ? Number(anchorForm.replayRoundIndex)
              : null,
            replayEventStableId: anchorForm.replayEventStableId || null,
            videoObservation: anchorForm.videoObservation,
            alignmentInference: anchorForm.alignmentInference || null,
            confidence: Number(anchorForm.confidence),
            userConfirmed: anchorForm.userConfirmed,
          }),
        });
        setAnchorForm({
          ...emptyAnchorForm,
          videoTimestampSeconds: currentVideoTime.toFixed(3),
        });
        setEditingAnchorId(null);
        await refresh(synchronization.version);
      },
      editingAnchorId ? "Anchor corrected." : "Matched anchor saved.",
    );
  }

  function editAnchor(anchor: SynchronizationAnchor) {
    setEditingAnchorId(anchor.id);
    setAnchorForm({
      kind: anchor.kind,
      label: anchor.label,
      videoTimestampSeconds: String(anchor.videoTimestampSeconds),
      replayTimestampSeconds: String(anchor.replayTimestampSeconds),
      replayRoundIndex: anchor.replayRoundIndex
        ? String(anchor.replayRoundIndex)
        : "",
      replayEventStableId: anchor.replayEventStableId ?? "",
      videoObservation: readText(anchor.videoObservation),
      alignmentInference: readText(anchor.alignmentInference),
      confidence: String(anchor.confidence),
      userConfirmed: anchor.userConfirmed,
    });
    document
      .getElementById("anchor-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteAnchor(anchorId: string) {
    if (!synchronization) return;
    await perform(
      `delete-anchor-${anchorId}`,
      async () => {
        await jsonRequest(
          `${endpoint}/${synchronization.id}/anchors/${anchorId}`,
          { method: "DELETE" },
        );
        await refresh(synchronization.version);
      },
      "Anchor removed and the mapping recalculated.",
    );
  }

  async function patchSynchronization(
    action: Record<string, unknown>,
    actionName: string,
    successMessage: string,
  ) {
    if (!synchronization) return;
    await perform(
      actionName,
      async () => {
        await jsonRequest(`${endpoint}/${synchronization.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        });
        await refresh(synchronization.version);
      },
      successMessage,
    );
  }

  async function deleteDraft() {
    if (!synchronization) return;
    if (
      !window.confirm(
        `Delete synchronization draft version ${synchronization.version}? The recording and Match Replay will remain unchanged.`,
      )
    )
      return;
    await perform(
      "delete-draft",
      async () => {
        await jsonRequest(`${endpoint}/${synchronization.id}`, {
          method: "DELETE",
        });
        await refresh();
      },
      "Draft synchronization deleted. Source files were preserved.",
    );
  }

  function seekVideo(time: number) {
    window.dispatchEvent(
      new CustomEvent("r6-seek-source", {
        detail: { time: Math.max(0, time), play: true },
      }),
    );
  }

  const selectedEvent = useMemo(
    () =>
      workspace.replay.events.find(
        (event) => event.stableId === anchorForm.replayEventStableId,
      ),
    [anchorForm.replayEventStableId, workspace.replay.events],
  );
  const timestampedReplayEvents = workspace.replay.events.filter(
    (event) => event.timestampSeconds !== null,
  );
  const linkedReplayEventIds = new Set(
    synchronization?.anchors
      .map((anchor) => anchor.replayEventStableId)
      .filter((id): id is string => Boolean(id)) ?? [],
  );
  const unmatchedTimestampedEvents = timestampedReplayEvents.filter(
    (event) => !linkedReplayEventIds.has(event.stableId),
  );

  return (
    <div className="mt-8 space-y-7">
      {(error || success) && (
        <div
          className={`rounded-2xl border p-4 text-sm leading-6 ${
            error
              ? "border-red-300/20 bg-red-300/7 text-red-100"
              : "border-[#b8ff2c]/20 bg-[#b8ff2c]/7 text-[#e5ffb3]"
          }`}
          role={error ? "alert" : "status"}
        >
          <div className="flex items-start gap-3">
            {error ? (
              <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            ) : (
              <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
            )}
            <span>{error || success}</span>
          </div>
        </div>
      )}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.65fr)]">
        <div className="panel overflow-hidden">
          <div className="border-b border-white/8 px-5 py-4 sm:px-6">
            <p className="section-kicker">Primary visual source</p>
            <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
              {workspace.primaryRecording.name}
            </h2>
          </div>
          <SourcePlayer
            projectId={workspace.primaryRecording.id}
            title={workspace.primaryRecording.name}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/8 px-5 py-4 text-sm">
            <span className="text-slate-500">
              Current video time{" "}
              <strong className="font-mono text-white">
                {formatTimestamp(currentVideoTime)}
              </strong>
            </span>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setAnchorForm((current) => ({
                  ...current,
                  videoTimestampSeconds: currentVideoTime.toFixed(3),
                }))
              }
              disabled={!editable}
            >
              <Clock3 size={15} /> Use current time
            </button>
          </div>
        </div>

        <aside className="panel p-5 sm:p-6">
          <p className="section-kicker">Structured replay source</p>
          <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
            {workspace.replay.displayName}
          </h2>
          <dl className="mt-5 space-y-4 text-sm">
            <MetricRow
              label="Rounds"
              value={String(workspace.replay.rounds.length)}
            />
            <MetricRow
              label="Parsed events"
              value={String(workspace.replay.timingSummary.totalEventCount)}
            />
            <MetricRow
              label="Timed events"
              value={String(
                workspace.replay.timingSummary.timestampedEventCount,
              )}
            />
            <MetricRow
              label="Timed round boundaries"
              value={String(
                workspace.replay.timingSummary.timestampedRoundBoundaryCount,
              )}
            />
            <MetricRow
              label="Provider"
              value={`${workspace.replay.providerId} · ${workspace.replay.providerVersion}`}
            />
          </dl>
          {workspace.replay.timingSummary.timestampedEventCount === 0 &&
            workspace.replay.timingSummary.timestampedRoundBoundaryCount ===
              0 && (
              <div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100/80">
                <p className="font-bold text-amber-100">
                  Replay-relative timing is unavailable
                </p>
                <p className="mt-2">
                  This parser result has event categories and round order, but
                  no event or round timestamps. Enter replay-relative times
                  manually only when you can verify them. Automatic offset
                  discovery will remain unavailable.
                </p>
              </div>
            )}
          <p className="mt-5 text-xs leading-5 text-slate-600">
            Match Replay files are structured evidence, not browser-playable
            video. Visual checking always seeks the original recording above.
          </p>
        </aside>
      </section>

      {!synchronization ? (
        <section className="panel grid place-items-center p-10 text-center">
          <Link2 className="text-[#b8ff2c]" size={34} />
          <h2 className="font-display mt-5 text-4xl font-bold text-white uppercase">
            No synchronization version yet
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
            Start an empty draft, then add one directly observed video point and
            its corresponding replay-relative point. Add a second point to
            measure drift.
          </p>
          <button
            type="button"
            className="primary-button mt-6"
            disabled={busyAction !== null}
            onClick={() => void createDraft()}
          >
            {busyAction === "create" ? (
              <Loader2 className="animate-spin" size={17} />
            ) : (
              <Plus size={17} />
            )}
            Create synchronization draft
          </button>
        </section>
      ) : (
        <>
          <section className="panel p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
              <div>
                <p className="section-kicker">Saved mapping</p>
                <h2 className="font-display mt-1 text-4xl font-bold text-white uppercase">
                  Version {synchronization.version}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  {synchronization.status.toLowerCase()} ·{" "}
                  {synchronization.mappingAlgorithmVersion}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {editable ? (
                  <>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void patchSynchronization(
                          { action: "discover_offsets" },
                          "discover",
                          "Automatic offset discovery finished.",
                        )
                      }
                    >
                      {busyAction === "discover" ? (
                        <Loader2 className="animate-spin" size={15} />
                      ) : (
                        <Radar size={15} />
                      )}
                      Discover offsets
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void patchSynchronization(
                          { action: "verify" },
                          "verify",
                          "Synchronization verified and frozen.",
                        )
                      }
                    >
                      {busyAction === "verify" ? (
                        <Loader2 className="animate-spin" size={15} />
                      ) : (
                        <ShieldCheck size={15} />
                      )}
                      Verify mapping
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={busyAction !== null}
                      onClick={() => void deleteDraft()}
                    >
                      <Trash2 size={15} /> Delete draft
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busyAction !== null}
                    onClick={() => void createDraft(synchronization.id)}
                  >
                    <Copy size={15} /> Create correction version
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <ScoreCard
                label="Offset"
                value={`${synchronization.offsetSeconds.toFixed(3)}s`}
                detail="Video time at replay time zero"
              />
              <ScoreCard
                label="Drift"
                value={`${synchronization.driftSecondsPerHour.toFixed(2)}s/h`}
                detail={`Slope ${synchronization.slope.toFixed(9)}`}
              />
              <ScoreCard
                label="Anchor error"
                value={
                  synchronization.rootMeanSquareErrorSeconds === null
                    ? "Unavailable"
                    : `${synchronization.rootMeanSquareErrorSeconds.toFixed(3)}s`
                }
                detail="RMS residual"
              />
              <ScoreCard
                label="Confidence"
                value={`${Math.round(synchronization.confidence * 100)}%`}
                detail={synchronization.confidenceLabel}
              />
              <ScoreCard
                label="Matched anchors"
                value={String(synchronization.anchors.length)}
                detail={`${unmatchedTimestampedEvents.length} timed replay events unmatched`}
              />
            </div>

            <div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-4">
              <p className="text-xs font-bold tracking-[0.12em] text-slate-500 uppercase">
                Mapping formula
              </p>
              <code className="mt-2 block overflow-x-auto text-sm text-sky-100">
                video seconds = {synchronization.offsetSeconds.toFixed(6)} +
                replay seconds × {synchronization.slope.toFixed(9)} + round
                adjustment
              </code>
            </div>

            <EvidenceSummary synchronization={synchronization} />
          </section>

          <TimelineWorkspace
            workspace={workspace}
            currentVideoTime={currentVideoTime}
            onSeek={seekVideo}
          />

          <section
            id="anchor-form"
            className="grid scroll-mt-6 gap-7 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
          >
            <form className="panel p-5 sm:p-6" onSubmit={submitAnchor}>
              <p className="section-kicker">
                {editingAnchorId ? "Correct matched point" : "Manual alignment"}
              </p>
              <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
                {editingAnchorId ? "Edit anchor" : "Add an anchor"}
              </h2>
              {!editable && (
                <p className="mt-4 rounded-xl border border-sky-300/15 bg-sky-300/5 p-3 text-sm text-sky-100/80">
                  This version is read-only. Create a correction version to
                  change its points.
                </p>
              )}
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <label className="field-label">
                  Anchor type
                  <select
                    className="field-input"
                    value={anchorForm.kind}
                    disabled={!editable}
                    onChange={(event) =>
                      setAnchorForm((current) => ({
                        ...current,
                        kind: event.target.value,
                      }))
                    }
                  >
                    {SYNCHRONIZATION_ANCHOR_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Short label
                  <input
                    className="field-input"
                    value={anchorForm.label}
                    disabled={!editable}
                    required
                    maxLength={160}
                    placeholder="Round one begins"
                    onChange={(event) =>
                      setAnchorForm((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field-label">
                  Video timestamp (seconds)
                  <input
                    className="field-input"
                    type="number"
                    min="0"
                    max={workspace.primaryRecording.durationSeconds}
                    step="0.001"
                    value={anchorForm.videoTimestampSeconds}
                    disabled={!editable}
                    required
                    onChange={(event) =>
                      setAnchorForm((current) => ({
                        ...current,
                        videoTimestampSeconds: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field-label">
                  Replay-relative time (seconds)
                  <input
                    className="field-input"
                    type="number"
                    min="0"
                    max="86400"
                    step="0.001"
                    value={anchorForm.replayTimestampSeconds}
                    disabled={!editable}
                    required
                    onChange={(event) =>
                      setAnchorForm((current) => ({
                        ...current,
                        replayTimestampSeconds: event.target.value,
                      }))
                    }
                  />
                  <span className="field-help">
                    Enter this manually only when the parser has no replay time.
                  </span>
                </label>
                <label className="field-label">
                  Replay round
                  <select
                    className="field-input"
                    value={anchorForm.replayRoundIndex}
                    disabled={!editable}
                    onChange={(event) =>
                      setAnchorForm((current) => ({
                        ...current,
                        replayRoundIndex: event.target.value,
                        replayEventStableId:
                          workspace.replay.events.find(
                            (item) =>
                              item.stableId === current.replayEventStableId,
                          )?.roundIndex === Number(event.target.value)
                            ? current.replayEventStableId
                            : "",
                      }))
                    }
                  >
                    <option value="">No round selected</option>
                    {workspace.replay.rounds.map((round) => (
                      <option key={round.stableId} value={round.roundIndex}>
                        Round {round.roundIndex}
                        {round.side ? ` · ${round.side}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Parsed replay event
                  <select
                    className="field-input"
                    value={anchorForm.replayEventStableId}
                    disabled={!editable}
                    onChange={(event) => {
                      const replayEvent = workspace.replay.events.find(
                        (item) => item.stableId === event.target.value,
                      );
                      setAnchorForm((current) => ({
                        ...current,
                        replayEventStableId: event.target.value,
                        replayRoundIndex: replayEvent?.roundIndex
                          ? String(replayEvent.roundIndex)
                          : current.replayRoundIndex,
                        replayTimestampSeconds:
                          replayEvent?.timestampSeconds !== null &&
                          replayEvent?.timestampSeconds !== undefined
                            ? String(replayEvent.timestampSeconds)
                            : current.replayTimestampSeconds,
                        kind: replayEvent
                          ? anchorKindForReplayCategory(replayEvent.category)
                          : current.kind,
                        label:
                          replayEvent && !current.label
                            ? `${replayEvent.category.toLowerCase().replaceAll("_", " ")} alignment`
                            : current.label,
                      }));
                    }}
                  >
                    <option value="">No parsed event attached</option>
                    {workspace.replay.events
                      .filter(
                        (event) =>
                          !anchorForm.replayRoundIndex ||
                          event.roundIndex ===
                            Number(anchorForm.replayRoundIndex),
                      )
                      .map((event, index) => (
                        <option key={event.stableId} value={event.stableId}>
                          {event.roundIndex ? `R${event.roundIndex} · ` : ""}
                          {event.category.replaceAll("_", " ")} ·{" "}
                          {event.timestampSeconds === null
                            ? "time unavailable"
                            : formatTimestamp(event.timestampSeconds)}{" "}
                          · event {index + 1}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {selectedEvent?.timestampSeconds === null && (
                <p className="mt-4 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100/80">
                  The selected event has no parser-provided time. The entered
                  replay time will be saved explicitly as user-entered evidence.
                </p>
              )}
              <label className="field-label mt-5">
                Direct video observation
                <textarea
                  className="field-input min-h-24"
                  value={anchorForm.videoObservation}
                  disabled={!editable}
                  required
                  maxLength={1_000}
                  placeholder="Example: The round-start banner becomes visible and the action phase begins."
                  onChange={(event) =>
                    setAnchorForm((current) => ({
                      ...current,
                      videoObservation: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field-label mt-5">
                Alignment inference
                <textarea
                  className="field-input min-h-20"
                  value={anchorForm.alignmentInference}
                  disabled={!editable}
                  maxLength={1_000}
                  placeholder="Explain why these two points likely correspond."
                  onChange={(event) =>
                    setAnchorForm((current) => ({
                      ...current,
                      alignmentInference: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field-label mt-5">
                Anchor confidence ·{" "}
                {Math.round(Number(anchorForm.confidence) * 100)}%
                <input
                  className="mt-2 w-full accent-[#b8ff2c]"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={anchorForm.confidence}
                  disabled={!editable}
                  onChange={(event) =>
                    setAnchorForm((current) => ({
                      ...current,
                      confidence: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="mt-5 flex items-start gap-3 rounded-xl border border-white/8 bg-black/15 p-4 text-sm leading-6 text-slate-300">
                <input
                  className="mt-1 size-4 accent-[#b8ff2c]"
                  type="checkbox"
                  checked={anchorForm.userConfirmed}
                  disabled={!editable}
                  onChange={(event) =>
                    setAnchorForm((current) => ({
                      ...current,
                      userConfirmed: event.target.checked,
                    }))
                  }
                />
                <span>
                  I visually checked this point in the source recording and
                  confirmed the replay-relative point.
                </span>
              </label>
              {editable && (
                <div className="mt-6 flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={busyAction !== null}
                  >
                    {busyAction === "anchor" ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    {editingAnchorId ? "Save correction" : "Save anchor"}
                  </button>
                  {editingAnchorId && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingAnchorId(null);
                        setAnchorForm(emptyAnchorForm);
                      }}
                    >
                      <RotateCcw size={15} /> Cancel edit
                    </button>
                  )}
                </div>
              )}
            </form>

            <section className="panel p-5 sm:p-6">
              <p className="section-kicker">Matched evidence</p>
              <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
                Anchor points
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                The observation, replay fact, and inference stay separate.
                Preview each point against the original recording before
                verification.
              </p>
              <div className="mt-6 space-y-4">
                {synchronization.anchors.length ? (
                  synchronization.anchors.map((anchor, index) => (
                    <AnchorCard
                      key={anchor.id}
                      anchor={anchor}
                      index={index}
                      editable={editable}
                      busy={busyAction !== null}
                      onEdit={() => editAnchor(anchor)}
                      onDelete={() => void deleteAnchor(anchor.id)}
                      onPreview={() => seekVideo(anchor.previewVideoSeconds)}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
                    <CircleDashed
                      className="mx-auto text-slate-700"
                      size={30}
                    />
                    <p className="mt-4 font-semibold text-slate-300">
                      No matched anchors yet
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Start with a clear round boundary or result screen. Add a
                      second distant point before trusting drift.
                    </p>
                  </div>
                )}
              </div>
            </section>
          </section>

          <section className="grid gap-7 lg:grid-cols-2">
            <div className="panel p-5 sm:p-6">
              <p className="section-kicker">Round-specific correction</p>
              <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
                Per-round adjustment
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Apply a small explicit correction only when one round does not
                follow the global mapping. It remains separate from drift.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="field-label">
                  Replay round
                  <select
                    className="field-input"
                    value={roundAdjustment.replayRoundIndex}
                    disabled={!editable}
                    onChange={(event) =>
                      setRoundAdjustment((current) => ({
                        ...current,
                        replayRoundIndex: event.target.value,
                      }))
                    }
                  >
                    <option value="">Choose a round</option>
                    {workspace.replay.rounds.map((round) => (
                      <option key={round.stableId} value={round.roundIndex}>
                        Round {round.roundIndex}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Adjustment (seconds)
                  <input
                    className="field-input"
                    type="number"
                    min="-600"
                    max="600"
                    step="0.001"
                    value={roundAdjustment.adjustmentSeconds}
                    disabled={!editable}
                    onChange={(event) =>
                      setRoundAdjustment((current) => ({
                        ...current,
                        adjustmentSeconds: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label className="field-label mt-4">
                Reason
                <input
                  className="field-input"
                  value={roundAdjustment.reason}
                  disabled={!editable}
                  maxLength={1_000}
                  placeholder="This round begins 0.4 seconds later after visual review."
                  onChange={(event) =>
                    setRoundAdjustment((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-slate-400">
                <input
                  className="mt-1 size-4 accent-[#b8ff2c]"
                  type="checkbox"
                  checked={roundAdjustment.userConfirmed}
                  disabled={!editable}
                  onChange={(event) =>
                    setRoundAdjustment((current) => ({
                      ...current,
                      userConfirmed: event.target.checked,
                    }))
                  }
                />
                Visually confirmed against the recording
              </label>
              {editable && (
                <button
                  type="button"
                  className="primary-button mt-5"
                  disabled={
                    busyAction !== null || !roundAdjustment.replayRoundIndex
                  }
                  onClick={() =>
                    void patchSynchronization(
                      {
                        action: "upsert_round_adjustment",
                        replayRoundIndex: Number(
                          roundAdjustment.replayRoundIndex,
                        ),
                        adjustmentSeconds: Number(
                          roundAdjustment.adjustmentSeconds,
                        ),
                        reason: roundAdjustment.reason || null,
                        confidence: Number(roundAdjustment.confidence),
                        userConfirmed: roundAdjustment.userConfirmed,
                      },
                      "round-adjustment",
                      "Round adjustment saved.",
                    )
                  }
                >
                  <Save size={15} /> Save round adjustment
                </button>
              )}
              <div className="mt-6 space-y-3">
                {synchronization.roundAdjustments.map((adjustment) => (
                  <div
                    key={adjustment.id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-white/8 bg-black/15 p-4 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        Round {adjustment.replayRoundIndex} ·{" "}
                        {adjustment.adjustmentSeconds >= 0 ? "+" : ""}
                        {adjustment.adjustmentSeconds.toFixed(3)}s
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {adjustment.reason || "No reason entered."} ·{" "}
                        {adjustment.userConfirmed
                          ? "visually confirmed"
                          : "not confirmed"}
                      </p>
                    </div>
                    {editable && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Delete round ${adjustment.replayRoundIndex} adjustment`}
                        onClick={() =>
                          void patchSynchronization(
                            {
                              action: "delete_round_adjustment",
                              replayRoundIndex: adjustment.replayRoundIndex,
                            },
                            "delete-round-adjustment",
                            "Round adjustment removed.",
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-5 sm:p-6">
              <p className="section-kicker">Automatic suggestions</p>
              <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
                Candidate offsets
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Suggestions require genuine timestamps on both timelines and at
                least two compatible evidence pairs. They are never accepted
                automatically and do not measure drift.
              </p>
              <div className="mt-6 space-y-3">
                {synchronization.offsetCandidates.length ? (
                  synchronization.offsetCandidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="rounded-xl border border-white/8 bg-black/15 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-white">
                            Candidate {candidate.rank} ·{" "}
                            {candidate.offsetSeconds.toFixed(3)}s offset
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {candidate.compatiblePairCount} pairs ·{" "}
                            {candidate.distinctEvidenceTypeCount} evidence types
                            · {Math.round(candidate.confidence * 100)}%
                            confidence
                          </p>
                        </div>
                        <span className="rounded-full border border-amber-300/15 px-2 py-1 text-[10px] font-bold text-amber-100/70 uppercase">
                          Unaccepted
                        </span>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-600">
                        {candidate.algorithmVersion}. Create and visually check
                        manual anchors rather than applying this suggestion
                        blindly.
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm leading-6 text-slate-600">
                    No automatic offset candidates are stored. For this replay,
                    the likely reason is the absence of replay-relative
                    timestamps.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.45fr)]">
              <div>
                <p className="section-kicker">Version notes</p>
                <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
                  Visual verification record
                </h2>
                <label className="field-label mt-5">
                  Notes
                  <textarea
                    className="field-input min-h-24"
                    value={notes}
                    disabled={!editable}
                    maxLength={5_000}
                    placeholder="Record what you checked, where the replay timing came from, and any remaining uncertainty."
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
                {editable && (
                  <button
                    type="button"
                    className="secondary-button mt-4"
                    onClick={() =>
                      void patchSynchronization(
                        { action: "update_notes", notes: notes || null },
                        "notes",
                        "Verification notes saved.",
                      )
                    }
                  >
                    <Save size={15} /> Save notes
                  </button>
                )}
              </div>
              <div>
                <p className="text-xs font-bold tracking-[0.12em] text-slate-500 uppercase">
                  Saved versions
                </p>
                <div className="mt-3 space-y-2">
                  {workspace.versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      className={`w-full rounded-xl border p-3 text-left ${
                        version.id === synchronization.id
                          ? "border-[#b8ff2c]/25 bg-[#b8ff2c]/6"
                          : "border-white/8 bg-black/15 hover:border-white/15"
                      }`}
                      onClick={() =>
                        void perform("switch-version", async () => {
                          await refresh(version.version);
                        })
                      }
                    >
                      <span className="flex items-center justify-between gap-3">
                        <strong className="text-sm text-white">
                          Version {version.version}
                        </strong>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          {version.status}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-slate-600">
                        {version.anchorCount} anchors ·{" "}
                        {version.confidenceLabel.toLowerCase()} confidence
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/7 pb-3 last:border-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-200">{value}</dd>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/15 p-4">
      <p className="text-[10px] font-bold tracking-[0.12em] text-slate-600 uppercase">
        {label}
      </p>
      <p className="mt-2 font-mono text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-600">{detail}</p>
    </div>
  );
}

function EvidenceSummary({
  synchronization,
}: {
  synchronization: Synchronization;
}) {
  const groups = [
    {
      title: "Supporting evidence",
      values: synchronization.supportingEvidence,
      className: "text-[#d8ff8a]",
    },
    {
      title: "Conflicting evidence",
      values: synchronization.conflictingEvidence,
      className: "text-red-200",
    },
    {
      title: "Missing evidence",
      values: synchronization.missingEvidence,
      className: "text-amber-100",
    },
  ];
  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-3">
      {groups.map((group) => (
        <div
          key={group.title}
          className="rounded-xl border border-white/8 bg-black/15 p-4"
        >
          <p
            className={`text-xs font-bold tracking-[0.08em] uppercase ${group.className}`}
          >
            {group.title}
          </p>
          {group.values.length ? (
            <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-500">
              {group.values.map((value, index) => (
                <li key={`${group.title}-${index}`}>• {String(value)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-700">None recorded.</p>
          )}
        </div>
      ))}
    </div>
  );
}

function TimelineWorkspace({
  workspace,
  currentVideoTime,
  onSeek,
}: {
  workspace: Workspace;
  currentVideoTime: number;
  onSeek: (time: number) => void;
}) {
  const synchronization = workspace.selectedSynchronization;
  if (!synchronization) return null;
  const replayTimes = [
    ...workspace.replay.events.flatMap((event) =>
      event.timestampSeconds === null ? [] : [event.timestampSeconds],
    ),
    ...workspace.replay.rounds.flatMap((round) => [
      ...(round.startSeconds === null ? [] : [round.startSeconds]),
      ...(round.endSeconds === null ? [] : [round.endSeconds]),
    ]),
    ...synchronization.anchors.map((anchor) => anchor.replayTimestampSeconds),
  ];
  const replayDuration = Math.max(1, ...replayTimes);
  const videoDuration = workspace.primaryRecording.durationSeconds;
  const videoPercent = Math.min(
    100,
    Math.max(0, (currentVideoTime / videoDuration) * 100),
  );

  return (
    <section className="panel p-5 sm:p-6">
      <p className="section-kicker">Visual mapping</p>
      <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
        Two timelines
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        Green markers are saved anchors. Blue round markers appear only when the
        replay parser provides real boundary timestamps.
      </p>
      <div className="mt-6 space-y-7">
        <div>
          <div className="flex items-center justify-between gap-4 text-xs">
            <span className="font-bold tracking-[0.1em] text-slate-400 uppercase">
              Video · {formatDuration(videoDuration)}
            </span>
            <span className="font-mono text-slate-600">
              cursor {formatTimestamp(currentVideoTime)}
            </span>
          </div>
          <div className="relative mt-3 h-12 overflow-hidden rounded-xl border border-white/8 bg-black/30">
            <span
              className="absolute inset-y-0 w-px bg-white/50"
              style={{ left: `${videoPercent}%` }}
            />
            {synchronization.anchors.map((anchor, index) => (
              <button
                key={anchor.id}
                type="button"
                className="absolute inset-y-1 w-2 -translate-x-1/2 rounded-full bg-[#b8ff2c] shadow-[0_0_12px_rgba(184,255,44,0.5)]"
                style={{
                  left: `${Math.min(
                    100,
                    Math.max(
                      0,
                      (anchor.videoTimestampSeconds / videoDuration) * 100,
                    ),
                  )}%`,
                }}
                title={`Anchor ${index + 1}: ${anchor.label} at ${formatTimestamp(anchor.videoTimestampSeconds)}`}
                aria-label={`Play video anchor ${index + 1}: ${anchor.label}`}
                onClick={() => onSeek(anchor.videoTimestampSeconds)}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-4 text-xs">
            <span className="font-bold tracking-[0.1em] text-slate-400 uppercase">
              Replay-relative timeline
            </span>
            <span className="font-mono text-slate-600">
              displayed through {formatTimestamp(replayDuration)}
            </span>
          </div>
          <div className="relative mt-3 h-12 overflow-hidden rounded-xl border border-white/8 bg-black/30">
            {workspace.replay.rounds.flatMap((round) =>
              round.startSeconds === null
                ? []
                : [
                    <span
                      key={`round-${round.stableId}`}
                      className="absolute inset-y-0 w-px bg-sky-300/60"
                      style={{
                        left: `${(round.startSeconds / replayDuration) * 100}%`,
                      }}
                      title={`Round ${round.roundIndex} start`}
                    />,
                  ],
            )}
            {synchronization.anchors.map((anchor, index) => (
              <span
                key={anchor.id}
                className="absolute inset-y-1 w-2 -translate-x-1/2 rounded-full bg-[#b8ff2c]"
                style={{
                  left: `${Math.min(
                    100,
                    Math.max(
                      0,
                      (anchor.replayTimestampSeconds / replayDuration) * 100,
                    ),
                  )}%`,
                }}
                title={`Anchor ${index + 1}: replay ${formatTimestamp(anchor.replayTimestampSeconds)}`}
              />
            ))}
          </div>
          {workspace.replay.timingSummary.timestampedEventCount === 0 &&
            workspace.replay.timingSummary.timestampedRoundBoundaryCount ===
              0 && (
              <p className="mt-3 text-xs leading-5 text-amber-100/70">
                This replay timeline is based only on user-entered anchor times;
                the parser supplied no native time markers.
              </p>
            )}
        </div>
      </div>
    </section>
  );
}

function AnchorCard({
  anchor,
  index,
  editable,
  busy,
  onEdit,
  onDelete,
  onPreview,
}: {
  anchor: SynchronizationAnchor;
  index: number;
  editable: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const replayFactCategory =
    typeof anchor.replayFact.category === "string"
      ? anchor.replayFact.category
      : anchor.kind;
  const timestampSource =
    typeof anchor.replayFact.timestampSource === "string"
      ? anchor.replayFact.timestampSource
      : "UNKNOWN";
  return (
    <article className="rounded-2xl border border-white/8 bg-black/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold tracking-[0.12em] text-[#b8ff2c] uppercase">
            Anchor {index + 1} · {anchor.kind.replaceAll("_", " ")}
          </p>
          <h3 className="mt-1 font-semibold text-white">{anchor.label}</h3>
        </div>
        <span
          className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${
            anchor.userConfirmed
              ? "border-[#b8ff2c]/20 text-[#d8ff8a]"
              : "border-amber-300/15 text-amber-100/70"
          }`}
        >
          {anchor.userConfirmed ? "Confirmed" : "Not confirmed"}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-lg border border-white/7 p-3">
          <p className="text-slate-600">Video point</p>
          <p className="mt-1 font-mono text-white">
            {formatTimestamp(anchor.videoTimestampSeconds)}
          </p>
        </div>
        <div className="rounded-lg border border-white/7 p-3">
          <p className="text-slate-600">Replay point</p>
          <p className="mt-1 font-mono text-white">
            {formatTimestamp(anchor.replayTimestampSeconds)}
          </p>
        </div>
      </div>
      <dl className="mt-4 space-y-3 text-xs leading-5">
        <div>
          <dt className="font-bold text-slate-500">Observation</dt>
          <dd className="mt-1 text-slate-300">
            {readText(anchor.videoObservation, "No observation text saved.")}
          </dd>
        </div>
        <div>
          <dt className="font-bold text-slate-500">Replay fact</dt>
          <dd className="mt-1 text-slate-300">
            {replayFactCategory.replaceAll("_", " ").toLowerCase()}
            {anchor.replayRoundIndex
              ? ` · round ${anchor.replayRoundIndex}`
              : ""}
            {" · "}
            {timestampSource.toLowerCase().replaceAll("_", " ")} time
          </dd>
        </div>
        <div>
          <dt className="font-bold text-slate-500">Inference</dt>
          <dd className="mt-1 text-slate-300">
            {readText(
              anchor.alignmentInference,
              "These points may correspond.",
            )}
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="secondary-button" onClick={onPreview}>
          <Eye size={14} /> Preview mapped point
        </button>
        {editable && (
          <>
            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={onEdit}
            >
              Correct
            </button>
            <button
              type="button"
              className="icon-button"
              disabled={busy}
              onClick={onDelete}
              aria-label={`Delete anchor ${index + 1}`}
            >
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-600">
        Mapped preview {formatTimestamp(anchor.rawMappedVideoSeconds)} ·
        residual{" "}
        {anchor.residualSeconds === null
          ? "unavailable"
          : `${anchor.residualSeconds.toFixed(3)}s`}
        {anchor.mappedOutsideVideo
          ? " · calculated point is outside the recording and preview was clamped"
          : ""}
      </p>
    </article>
  );
}
