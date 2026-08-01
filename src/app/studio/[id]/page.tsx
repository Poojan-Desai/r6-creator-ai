import type { Metadata } from "next";
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Clapperboard,
  FileText,
  Film,
  Headphones,
  MessageSquareText,
  Mic2,
  Pencil,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { DeleteStudioProjectButton } from "@/components/delete-studio-project-button";
import {
  findStudioProject,
  STUDIO_INPUT_MODES,
  STUDIO_OUTPUT_GOALS,
} from "@/lib/studio-projects";
import { formatDuration } from "@/lib/time";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const project = await findStudioProject(id);
  return { title: project?.name ?? "Unified project not found" };
}

export default async function StudioProjectPage({ params }: Props) {
  const { id } = await params;
  const project = await findStudioProject(id);
  if (!project) notFound();

  const goal =
    STUDIO_OUTPUT_GOALS.find((item) => item.value === project.outputGoal)
      ?.label ?? project.outputGoal;
  const inputMode =
    STUDIO_INPUT_MODES.find((item) => item.value === project.inputMode)
      ?.label ?? project.inputMode;
  const recordings = project.inputs.filter(
    (input) =>
      input.kind === "PRIMARY_RECORDING" ||
      input.kind === "ADDITIONAL_RECORDING",
  );
  const replayInput = project.inputs.find(
    (input) => input.kind === "MATCH_REPLAY",
  );
  const referenceInput = project.inputs.find(
    (input) =>
      input.kind === "LOCAL_REFERENCE" || input.kind === "YOUTUBE_REFERENCE",
  );
  const primaryRecording = recordings.find(
    (input) => input.kind === "PRIMARY_RECORDING",
  )?.videoProject;
  const replay = replayInput?.replayPackage;
  const hasRecording = Boolean(primaryRecording);
  const hasReplay = Boolean(replay);
  const latestSynchronization = project.synchronizations[0];

  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-9 sm:px-7 lg:px-10 lg:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/studio" className="secondary-button no-underline">
            <ArrowLeft size={16} /> Creator Studio
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/studio/${project.id}/edit`}
              className="secondary-button no-underline"
            >
              <Pencil size={15} /> Edit project setup
            </Link>
            <DeleteStudioProjectButton
              projectId={project.id}
              projectName={project.name}
            />
          </div>
        </div>

        <header className="mt-8 border-b border-white/8 pb-8">
          <div className="eyebrow">
            <Sparkles size={15} /> Unified project · U1
          </div>
          <div className="mt-5 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <h1 className="font-display text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
                {project.name}
              </h1>
              <p className="mt-3 text-base text-slate-400">
                {goal} · {inputMode}
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#b8ff2c]/20 bg-[#b8ff2c]/7 px-3 py-2 text-xs font-bold tracking-[0.1em] text-[#d8ff8a] uppercase">
              <CheckCircle2 size={15} /> Setup saved locally
            </span>
          </div>
        </header>

        <div className="mt-8 grid gap-7 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
          <section className="panel overflow-hidden" aria-labelledby="inputs">
            <div className="border-b border-white/8 px-5 py-5 sm:px-6">
              <p className="section-kicker">Shared evidence foundation</p>
              <h2
                id="inputs"
                className="font-display mt-1 text-3xl font-bold text-white uppercase"
              >
                Project inputs
              </h2>
            </div>
            <div className="space-y-3 p-5 sm:p-6">
              {recordings.map((input) => {
                const recording = input.videoProject;
                if (!recording) return null;
                return (
                  <SourceCard
                    key={input.id}
                    icon={Film}
                    label={
                      input.kind === "PRIMARY_RECORDING"
                        ? "Primary recording"
                        : "Additional recording"
                    }
                    title={recording.name}
                    description={`${formatDuration(recording.durationSeconds)} · ${recording.width}×${recording.height} · ${recording.audioTracks.length} audio track${recording.audioTracks.length === 1 ? "" : "s"}`}
                    href={`/projects/${recording.id}`}
                    action="Open video workspace"
                  />
                );
              })}
              {replay && (
                <SourceCard
                  icon={Archive}
                  label="Structured replay evidence"
                  title={replay.displayName}
                  description={`${replay.roundFileCount} round files · ${replay.status.toLowerCase().replaceAll("_", " ")}${replay.canonicalMatch?.mapName ? ` · ${replay.canonicalMatch.mapName}` : ""}`}
                  href={`/replays/${replay.id}`}
                  action="Open Match Replay"
                />
              )}
              {referenceInput?.referenceVideo && (
                <SourceCard
                  icon={BookOpen}
                  label={
                    referenceInput.kind === "YOUTUBE_REFERENCE"
                      ? "YouTube structural reference"
                      : "Permitted local reference"
                  }
                  title={referenceInput.referenceVideo.title}
                  description={`${referenceInput.referenceVideo.creatorName} · high-level structure only`}
                  href={`/references/${referenceInput.referenceVideo.id}`}
                  action="Open reference"
                />
              )}
              {project.styleProfile && (
                <SourceCard
                  icon={Target}
                  label="Creator Style Profile"
                  title={project.styleProfile.name}
                  description="High-level pacing, structure, timing, and energy preferences."
                  href={`/style-profiles/${project.styleProfile.id}`}
                  action="Open style profile"
                />
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="panel p-5 sm:p-6">
              <p className="section-kicker">Selected identity</p>
              <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
                Player and audio
              </h2>
              <dl className="mt-5 space-y-4 text-sm">
                <ContextRow
                  label="Replay player"
                  value={project.selectedPlayerAlias ?? "Not selected"}
                />
                <ContextRow
                  label="Creator audio"
                  value={
                    project.selectedAudioTrack
                      ? `Track ${project.selectedAudioTrack.streamIndex}${project.selectedAudioTrack.title ? ` · ${project.selectedAudioTrack.title}` : ""}`
                      : hasRecording
                        ? "Not selected"
                        : "Not available in replay-only mode"
                  }
                />
              </dl>
              {hasReplay && !hasRecording && (
                <p className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100/80">
                  Replay-only mode has structured facts but no original gameplay
                  pixels, audio, transcript, or playable clip source.
                </p>
              )}
            </section>

            <section className="panel p-5 sm:p-6">
              <p className="section-kicker">User-supplied context</p>
              <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
                Match context
              </h2>
              <dl className="mt-5 space-y-4 text-sm">
                <ContextRow
                  label="Map"
                  value={project.map?.name ?? "Unknown"}
                />
                <ContextRow
                  label="Map version"
                  value={project.mapVersion?.name ?? "Not selected"}
                />
                <ContextRow
                  label="Bomb site"
                  value={project.bombSite?.name ?? "Not selected"}
                />
                <ContextRow label="Side" value={project.side.toLowerCase()} />
                <ContextRow
                  label="Operator"
                  value={project.operator?.name ?? "Unknown"}
                />
                <ContextRow
                  label="Round result"
                  value={project.roundResult ?? "Unknown"}
                />
              </dl>
              <p className="mt-5 flex items-start gap-2 border-t border-white/8 pt-4 text-xs leading-5 text-slate-500">
                <ShieldCheck className="mt-0.5 shrink-0" size={15} />
                {project.contextUserConfirmed
                  ? "Marked as user-confirmed context, not automatic detection."
                  : "Not marked as user-confirmed. Later writing must treat these fields as unconfirmed."}
              </p>
            </section>
          </aside>
        </div>

        <section className="panel mt-8 p-5 sm:p-6">
          <p className="section-kicker">Creative brief</p>
          <h2 className="font-display mt-1 text-3xl font-bold text-white uppercase">
            Focus and instructions
          </h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {project.focusAreas.length ? (
              project.focusAreas.map((focus) => (
                <span
                  key={focus}
                  className="rounded-full border border-[#b8ff2c]/20 bg-[#b8ff2c]/6 px-3 py-1.5 text-xs font-semibold text-[#d8ff8a]"
                >
                  {focus}
                </span>
              ))
            ) : (
              <span className="text-sm text-slate-500">
                No focus areas selected.
              </span>
            )}
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <BriefCard
              icon={MessageSquareText}
              title="Content instructions"
              text={
                project.contentInstructions ||
                "No extra content instructions were entered."
              }
            />
            <BriefCard
              icon={ScanSearch}
              title="Coaching goals"
              text={
                project.coachingGoals || "No extra coaching goals were entered."
              }
            />
          </div>
        </section>

        <section className="mt-8" aria-labelledby="workflow-title">
          <p className="section-kicker">Unified workspace</p>
          <h2
            id="workflow-title"
            className="font-display mt-1 text-4xl font-bold text-white uppercase"
          >
            Project workflow
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">
            U1 connects the project foundation. The cards below state exactly
            what is available now and which later stage must implement each
            result.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <WorkflowCard
              icon={CheckCircle2}
              title="Inputs"
              status="Ready"
              description={`${recordings.length} recording${recordings.length === 1 ? "" : "s"} · ${hasReplay ? "replay linked" : "no replay"} · ${project.referenceMode === "NONE" ? "no reference" : "reference configured"}`}
              ready
            />
            <WorkflowCard
              icon={CircleDashed}
              title="Synchronization"
              status={
                hasRecording && hasReplay
                  ? latestSynchronization
                    ? `U2 · Version ${latestSynchronization.version} · ${latestSynchronization.status.toLowerCase()}`
                    : "U2 · Ready to configure"
                  : "Not applicable yet"
              }
              description={
                hasRecording && hasReplay
                  ? latestSynchronization
                    ? `${latestSynchronization.anchorCount} matched anchor${latestSynchronization.anchorCount === 1 ? "" : "s"} · ${latestSynchronization.confidenceLabel.toLowerCase()} confidence. Open the workspace to inspect every point and mapping assumption.`
                    : "Create explicit matched points before applying replay-relative facts to footage."
                  : "Synchronization requires both a recording and a Match Replay."
              }
              href={
                hasRecording && hasReplay
                  ? `/studio/${project.id}/sync`
                  : undefined
              }
              ready={latestSynchronization?.status === "VERIFIED"}
            />
            <WorkflowCard
              icon={Headphones}
              title="Transcript"
              status={
                hasRecording
                  ? "Available in video workspace"
                  : "No audio source"
              }
              description={
                hasRecording
                  ? "Use the existing selected-track local transcription workflow on the recording."
                  : "Match Replay files do not contain the creator microphone or game audio."
              }
              href={
                primaryRecording
                  ? `/projects/${primaryRecording.id}#transcription`
                  : undefined
              }
            />
            <WorkflowCard
              icon={Target}
              title="Candidate moments"
              status={hasRecording ? "U3.1 · Ready" : "Recording required"}
              description={
                hasRecording
                  ? "Fuse completed local detector evidence, inspect three separate scores, preview each range, and save human corrections."
                  : "Match Replay facts alone cannot create a playable video candidate."
              }
              href={hasRecording ? `/studio/${project.id}/shorts` : undefined}
            />
            <WorkflowCard
              icon={FileText}
              title="Story plan and script"
              status={hasRecording ? "U3.2 · Ready" : "Recording required"}
              description={
                hasRecording
                  ? "Create an editable evidence-bounded story, three original hooks, voiceover options, captions, titles, and editing guidance."
                  : "Short-form writing requires a reviewed range from a screen recording."
              }
              href={hasRecording ? `/studio/${project.id}/shorts` : undefined}
            />
            <WorkflowCard
              icon={Clapperboard}
              title="Editor"
              status={hasRecording ? "U3.3 · Ready" : "Recording required"}
              description={
                hasRecording
                  ? "Build an immutable timeline, add cards and overlays, edit framing and audio, then render a local preview proxy."
                  : "A real screen recording is required for timeline editing."
              }
              href={hasRecording ? `/studio/${project.id}/shorts` : undefined}
            />
            <WorkflowCard
              icon={Mic2}
              title="Voiceover"
              status="U5.1 · Facts and scripts ready"
              description="Review facts, create original local narration variants, and preserve immutable script revisions before recording."
              href={`/studio/${project.id}/voiceover`}
              ready
            />
            <WorkflowCard
              icon={ScanSearch}
              title="Coaching"
              status="U6.1 · Inspectable review ready"
              description="Record human-reviewed visible observations, attach supported replay facts, keep inferences and missing context separate, and preserve every correction."
              href={`/studio/${project.id}/coaching`}
              ready
            />
            <WorkflowCard
              icon={BookOpen}
              title="Long-form studio"
              status={
                hasRecording ? "U4.1 · Planner ready" : "Recording required"
              }
              description={
                hasRecording
                  ? "Choose a 20–30 minute target, story balance, and evidence-bounded chapter structure with immutable local versions."
                  : "A real screen recording is required for a playable long-form plan."
              }
              href={
                hasRecording ? `/studio/${project.id}/long-form` : undefined
              }
              ready={hasRecording}
            />
            <WorkflowCard
              icon={Film}
              title="Exports"
              status={
                hasRecording ? "U3.4 · Short MP4 ready" : "Recording required"
              }
              description={
                hasRecording
                  ? "Render, preview, download, inspect, and delete a full-resolution short-form MP4 from an immutable saved edit."
                  : "Replay-only projects have structured evidence but no gameplay pixels to export."
              }
              href={hasRecording ? `/studio/${project.id}/shorts` : undefined}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function SourceCard({
  icon: Icon,
  label,
  title,
  description,
  href,
  action,
}: {
  icon: typeof Film;
  label: string;
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/8 bg-black/15 p-4 sm:flex-row sm:items-center">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#b8ff2c]/8 text-[#b8ff2c]">
        <Icon size={21} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold tracking-[0.14em] text-slate-600 uppercase">
          {label}
        </p>
        <h3 className="mt-1 truncate font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <Link href={href} className="secondary-button shrink-0 no-underline">
        {action} <ArrowUpRight size={14} />
      </Link>
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/7 pb-3 last:border-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-200">{value}</dd>
    </div>
  );
}

function BriefCard({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof MessageSquareText;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/15 p-5">
      <Icon className="text-[#b8ff2c]" size={19} />
      <h3 className="mt-4 font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-slate-400">
        {text}
      </p>
    </div>
  );
}

function WorkflowCard({
  icon: Icon,
  title,
  status,
  description,
  ready = false,
  href,
}: {
  icon: typeof Film;
  title: string;
  status: string;
  description: string;
  ready?: boolean;
  href?: string;
}) {
  const body = (
    <div className="h-full rounded-2xl border border-white/8 bg-white/[0.025] p-5">
      <div className="flex items-start justify-between gap-4">
        <Icon
          className={ready ? "text-[#b8ff2c]" : "text-slate-600"}
          size={20}
        />
        {href && <ArrowUpRight className="text-slate-600" size={17} />}
      </div>
      <h3 className="font-display mt-5 text-2xl font-bold text-white uppercase">
        {title}
      </h3>
      <p
        className={`mt-2 text-xs font-bold tracking-[0.08em] uppercase ${ready ? "text-[#b8ff2c]" : "text-amber-200/75"}`}
      >
        {status}
      </p>
      <p className="mt-3 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full no-underline">
      {body}
    </Link>
  ) : (
    body
  );
}
