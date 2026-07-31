"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleStop,
  Database,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatBytes } from "@/lib/format";
import type { ReplayPackageDto } from "@/lib/replays/service";

const activeStatuses = new Set(["QUEUED", "RUNNING"]);

export function ReplayDetailClient({
  initialReplay,
}: {
  initialReplay: ReplayPackageDto;
}) {
  const router = useRouter();
  const [replay, setReplay] = useState(initialReplay);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRun = replay.providerRuns[0] ?? null;
  const active = latestRun ? activeStatuses.has(latestRun.status) : false;
  const retryable = latestRun
    ? ["ERROR", "CANCELLED", "PARTIAL"].includes(latestRun.status)
    : false;

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/replays/${replay.id}`, { cache: "no-store" })
        .then((response) => response.json())
        .then((payload: { replay?: ReplayPackageDto }) => {
          if (payload.replay) setReplay(payload.replay);
        })
        .catch(() => undefined);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [active, replay.id]);

  async function runAction(
    action: string,
    url: string,
    method: "POST" | "DELETE" = "POST",
  ) {
    setBusyAction(action);
    setError(null);
    try {
      const response = await fetch(url, { method });
      const payload =
        response.status === 204
          ? null
          : ((await response.json()) as {
              error?: { message?: string };
            });
      if (!response.ok) {
        throw new Error(
          payload?.error?.message || "The action could not finish.",
        );
      }
      if (action === "delete") {
        router.push("/replays");
        router.refresh();
        return;
      }
      const refresh = await fetch(`/api/replays/${replay.id}`, {
        cache: "no-store",
      });
      const next = (await refresh.json()) as { replay?: ReplayPackageDto };
      if (next.replay) setReplay(next.replay);
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "The action could not finish.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <Link
        href="/replays"
        className="secondary-button inline-flex normal-case no-underline"
      >
        <ArrowLeft size={16} /> Match Replay library
      </Link>

      <div className="mt-6 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="section-kicker">Local Match Replay</p>
          <h1 className="font-display mt-2 text-4xl font-extrabold text-white uppercase sm:text-5xl">
            {replay.displayName}
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            {replay.roundFileCount} round file
            {replay.roundFileCount === 1 ? "" : "s"} ·{" "}
            {formatBytes(Number(replay.totalSizeBytes))} · fingerprint{" "}
            {replay.packageFingerprint}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {!active && (
            <button
              type="button"
              className="primary-button"
              disabled={Boolean(busyAction)}
              onClick={() =>
                retryable && latestRun
                  ? runAction(
                      "retry",
                      `/api/replay-provider-runs/${latestRun.id}/retry`,
                    )
                  : runAction("parse", `/api/replays/${replay.id}/parse`)
              }
            >
              {busyAction === "parse" || busyAction === "retry" ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : retryable ? (
                <RefreshCw size={17} />
              ) : (
                <Play size={17} />
              )}
              {retryable
                ? "Retry local parse"
                : replay.canonicalMatch
                  ? "Parse again"
                  : "Run local parser"}
            </button>
          )}
          {active && latestRun && (
            <button
              type="button"
              className="secondary-button"
              disabled={busyAction === "cancel"}
              onClick={() =>
                runAction(
                  "cancel",
                  `/api/replay-provider-runs/${latestRun.id}/cancel`,
                )
              }
            >
              <CircleStop size={17} /> Cancel
            </button>
          )}
          <button
            type="button"
            className="secondary-button text-red-200"
            disabled={active || Boolean(busyAction)}
            onClick={() => {
              if (
                window.confirm(
                  "Delete this replay package, its parsed evidence, and app-managed files? This cannot be undone.",
                )
              ) {
                void runAction("delete", `/api/replays/${replay.id}`, "DELETE");
              }
            }}
          >
            <Trash2 size={17} /> Delete
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box mt-6" role="alert">
          {error}
        </div>
      )}
      {replay.errorMessage && !error && (
        <div className="error-box mt-6" role="alert">
          {replay.errorMessage}
        </div>
      )}

      <section className="panel mt-7 p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Parser job</p>
            <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
              {latestRun?.stage ?? "Not started"}
            </h2>
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold tracking-wider text-slate-300 uppercase">
            {latestRun?.status ?? replay.status}
          </span>
        </div>
        {latestRun ? (
          <>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full bg-[#b8ff2c] transition-[width]"
                style={{ width: `${latestRun.progress}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
              <span>{latestRun.progress}% complete</span>
              <span>
                {latestRun.providerVersion} · commit{" "}
                {latestRun.providerCommit.slice(0, 10)}
              </span>
            </div>
            {latestRun.errorMessage && (
              <p className="mt-4 text-sm text-red-200">
                {latestRun.errorMessage}
              </p>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Provider" value={latestRun.providerId} />
              <Fact
                label="Rounds recovered"
                value={`${latestRun.successfulRoundCount}/${replay.roundFileCount}`}
              />
              <Fact
                label="Read replay content"
                value={latestRun.replayReadStarted ? "Yes" : "No"}
              />
              <Fact
                label="Runtime"
                value={
                  latestRun.processingDurationMs === null
                    ? "Not recorded"
                    : formatRuntime(latestRun.processingDurationMs)
                }
              />
            </div>
            {(latestRun.failureKind ||
              latestRun.internalErrorCode ||
              latestRun.stderrPreview ||
              latestRun.roundResults.length > 0) && (
              <div className="mt-5 space-y-3">
                {(latestRun.failureKind || latestRun.internalErrorCode) && (
                  <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-4">
                    <p className="text-sm font-semibold text-amber-100">
                      {latestRun.failureKind
                        ? latestRun.failureKind.replaceAll("_", " ")
                        : "Provider diagnostic"}
                    </p>
                    <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <Fact
                        label="Safe error code"
                        value={latestRun.internalErrorCode ?? "Not classified"}
                      />
                      <Fact
                        label="Exit"
                        value={
                          latestRun.terminationSignal
                            ? `Signal ${latestRun.terminationSignal}`
                            : latestRun.exitCode === null
                              ? "Not recorded"
                              : `Code ${latestRun.exitCode}`
                        }
                      />
                      <Fact
                        label="Timed out"
                        value={latestRun.timedOut ? "Yes" : "No"}
                      />
                      <Fact
                        label="Version unsupported"
                        value={latestRun.unsupportedVersion ? "Possible" : "No"}
                      />
                    </dl>
                  </div>
                )}

                {latestRun.roundResults.length > 0 && (
                  <details className="rounded-xl border border-white/8 bg-black/15 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-200">
                      Round-by-round parser results
                    </summary>
                    <div className="mt-4 space-y-3">
                      {latestRun.roundResults.map((result) => (
                        <div
                          key={result.id}
                          className="rounded-xl border border-white/8 p-4 text-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="font-semibold text-slate-200">
                              {result.safeDisplayName}
                            </span>
                            <span className="rounded-full bg-white/5 px-2 py-1 font-bold tracking-wider text-slate-400 uppercase">
                              {result.status}
                            </span>
                          </div>
                          {result.safeSummary && (
                            <p className="mt-3 leading-5 text-slate-400">
                              {result.safeSummary}
                            </p>
                          )}
                          {result.suggestedAction && (
                            <p className="mt-2 leading-5 text-amber-100/80">
                              Next action: {result.suggestedAction}
                            </p>
                          )}
                          {result.stderrPreview && (
                            <details className="mt-3">
                              <summary className="cursor-pointer text-slate-400">
                                Sanitized parser stderr
                              </summary>
                              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-black/30 p-3 leading-5 whitespace-pre-wrap text-slate-500">
                                {result.stderrPreview}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                <details className="rounded-xl border border-white/8 bg-black/15 p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-200">
                    Safe invocation details
                  </summary>
                  <pre className="mt-3 overflow-x-auto text-xs leading-5 whitespace-pre-wrap text-slate-500">
                    {JSON.stringify(
                      {
                        executable: latestRun.executableLabel,
                        invocation: latestRun.invocation,
                        inputFileCount: latestRun.inputFiles.length,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>

                {latestRun.stderrPreview && (
                  <details className="rounded-xl border border-white/8 bg-black/15 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-200">
                      Combined sanitized stderr
                    </summary>
                    <pre className="mt-3 max-h-80 overflow-auto text-xs leading-5 whitespace-pre-wrap text-slate-500">
                      {latestRun.stderrPreview}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm leading-6 text-slate-400">
            Parsing starts only when you press the button. The first local
            provider recovers stable header, player, operator, score, and
            match-feedback fields. It does not reconstruct video, audio, or
            positions.
          </p>
        )}
      </section>

      <div className="mt-7 grid gap-7 xl:grid-cols-2">
        <section className="panel p-6 sm:p-7">
          <p className="section-kicker">Privacy and files</p>
          <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
            Import receipt
          </h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <Fact label="Storage status" value={replay.status} />
            <Fact
              label="Player names"
              value={replay.privacyMode.replaceAll("_", " ")}
            />
            <Fact
              label="Source"
              value={replay.sourceKind.replaceAll("_", " ")}
            />
            <Fact
              label="Replay version"
              value={replay.detectedReplayVersion ?? "Not detected yet"}
            />
          </dl>
          <div className="mt-6 space-y-2">
            {replay.files.map((file) => (
              <div
                key={file.id}
                className="flex flex-wrap justify-between gap-3 rounded-xl border border-white/8 bg-black/15 px-4 py-3 text-sm"
              >
                <span className="text-slate-200">{file.safeDisplayName}</span>
                <span className="text-slate-500">
                  {formatBytes(Number(file.fileSizeBytes))} ·{" "}
                  {file.detectedVersion ?? "unparsed"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-slate-500">
            <ShieldCheck className="mt-0.5 shrink-0" size={15} />
            Parser JSON is sanitized before it is retained. Raw profile IDs are
            replaced with local hashes unless name preservation was explicitly
            selected.
          </p>
        </section>

        <section className="panel p-6 sm:p-7">
          <p className="section-kicker">Honest capability matrix</p>
          <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
            Recovered evidence
          </h2>
          {replay.capabilities.length === 0 ? (
            <p className="mt-5 text-sm leading-6 text-slate-500">
              Run the parser to see populated, empty, partial, and unsupported
              fields for this exact replay.
            </p>
          ) : (
            <div className="mt-5 max-h-[34rem] space-y-2 overflow-y-auto pr-1">
              {replay.capabilities.map((capability) => (
                <details
                  key={capability.key}
                  className="rounded-xl border border-white/8 bg-black/15 px-4 py-3"
                >
                  <summary className="cursor-pointer list-none text-sm text-slate-200">
                    <span className="flex items-center justify-between gap-3">
                      <span>{capability.label}</span>
                      <CapabilityBadge state={capability.state} />
                    </span>
                  </summary>
                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    {capability.evidenceSummary}
                  </p>
                  {capability.missingReason && (
                    <p className="mt-2 text-xs leading-5 text-amber-100/80">
                      Missing: {capability.missingReason}
                    </p>
                  )}
                </details>
              ))}
            </div>
          )}
        </section>
      </div>

      {replay.canonicalMatch && (
        <>
          <section className="panel mt-7 p-6 sm:p-7">
            <p className="section-kicker">Application-owned canonical model</p>
            <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
              {replay.canonicalMatch.mapName ?? "Unknown map"} ·{" "}
              {replay.canonicalMatch.gameMode ?? "Unknown mode"}
            </h2>
            <p className="mt-3 text-sm text-slate-400">
              Replay version {replay.canonicalMatch.gameVersion ?? "unknown"} ·{" "}
              {replay.canonicalMatch.validationStatus.toLowerCase()} evidence
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact
                label="Rounds"
                value={String(replay.canonicalMatch.rounds.length)}
              />
              <Fact
                label="Players"
                value={String(replay.canonicalMatch.players.length)}
              />
              <Fact
                label="Events"
                value={String(replay.canonicalMatch.events.length)}
              />
              <Fact
                label="Confidence"
                value={replay.canonicalMatch.confidenceStatus}
              />
            </div>
            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {replay.canonicalMatch.rounds.map((round) => (
                <div
                  key={round.id}
                  className="rounded-xl border border-white/8 bg-black/15 p-4"
                >
                  <p className="font-semibold text-slate-100">
                    Round {round.roundIndex}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {round.side ?? "Side unknown"} ·{" "}
                    {round.site ?? "Site unknown"}
                    <br />
                    {round.winner
                      ? `${round.winner}${round.winCondition ? ` · ${round.winCondition}` : ""}`
                      : "Result not populated"}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-7 grid gap-7 xl:grid-cols-[0.7fr_1.3fr]">
            <section className="panel p-6 sm:p-7">
              <p className="section-kicker">Privacy-safe roster</p>
              <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
                Players
              </h2>
              <div className="mt-5 space-y-2">
                {replay.canonicalMatch.players.map((player) => (
                  <div
                    key={player.id}
                    className="flex justify-between gap-3 rounded-xl border border-white/8 px-4 py-3 text-sm"
                  >
                    <span className="text-slate-200">
                      {player.localDisplayName ?? player.privacyAlias}
                      {player.isRecordingPlayer ? " · recording player" : ""}
                    </span>
                    <span className="text-slate-500">
                      {player.operatorName ?? "Operator unknown"}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel p-6 sm:p-7">
              <p className="section-kicker">Direct evidence and inference</p>
              <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
                Match feedback
              </h2>
              <div className="mt-5 max-h-[36rem] space-y-3 overflow-y-auto pr-1">
                {replay.canonicalMatch.events.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No match-feedback events were populated in this replay.
                  </p>
                ) : (
                  replay.canonicalMatch.events.map((event) => (
                    <details
                      key={event.id}
                      className="rounded-xl border border-white/8 bg-black/15 p-4"
                    >
                      <summary className="cursor-pointer list-none">
                        <span className="flex flex-wrap items-center justify-between gap-3">
                          <span className="font-semibold text-slate-100">
                            Round {event.roundIndex ?? "?"} ·{" "}
                            {event.category.replaceAll("_", " ")}
                          </span>
                          <span className="text-xs text-slate-500">
                            {event.actorAlias ?? "Unknown actor"}
                            {event.targetAlias ? ` → ${event.targetAlias}` : ""}
                          </span>
                        </span>
                      </summary>
                      <pre className="mt-4 overflow-x-auto text-xs leading-5 whitespace-pre-wrap text-slate-400">
                        {JSON.stringify(event.directObservation, null, 2)}
                      </pre>
                      <p className="mt-3 text-xs text-amber-100/80">
                        Any interpretation is stored separately:{" "}
                        {JSON.stringify(event.inference)}
                      </p>
                    </details>
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      )}

      <section className="mt-7 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-5 text-sm leading-6 text-slate-400">
        <p className="flex items-center gap-2 font-semibold text-amber-100">
          <AlertTriangle size={17} /> Current reconstruction boundary
        </p>
        <p className="mt-2">
          This checkpoint does not reconstruct playable video or prove exact
          player movement. Match Replay files do not contain the original pixels
          or audio, and this integrated provider does not expose position, view,
          weapon, health, shot, gadget, or destruction streams.
        </p>
      </section>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/15 p-4">
      <dt className="text-[10px] font-bold tracking-wider text-slate-600 uppercase">
        {label}
      </dt>
      <dd className="mt-2 truncate text-sm text-slate-200">{value}</dd>
    </div>
  );
}

function formatRuntime(milliseconds: number) {
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  return `${(milliseconds / 1_000).toFixed(2)} s`;
}

function CapabilityBadge({ state }: { state: string }) {
  const positive = state === "AVAILABLE_VERIFIED";
  const partial =
    state === "PARTIALLY_AVAILABLE" || state === "AVAILABLE_UNVERIFIED";
  const Icon = positive ? CheckCircle2 : partial ? Database : AlertTriangle;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-bold tracking-wider uppercase ${
        positive
          ? "bg-[#b8ff2c]/10 text-[#b8ff2c]"
          : partial
            ? "bg-cyan-300/10 text-cyan-200"
            : "bg-white/5 text-slate-500"
      }`}
    >
      <Icon size={11} /> {state.replaceAll("_", " ")}
    </span>
  );
}
