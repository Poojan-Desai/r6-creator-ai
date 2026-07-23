import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Clock3,
  Film,
  Gauge,
  HardDrive,
  MonitorPlay,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { AnalysisFoundationPanel } from "@/components/analysis-foundation-panel";
import { BenchmarkLabeler } from "@/components/benchmark-labeler";
import { ClipStation } from "@/components/clip-station";
import { ContentWorkbench } from "@/components/content-workbench";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { ProjectMapContext } from "@/components/project-map-context";
import { SourcePlayer } from "@/components/source-player";
import { TranscriptionStudio } from "@/components/transcription-studio";
import { formatBytes } from "@/lib/format";
import { getDetectorFrameworkState } from "@/lib/detector-framework";
import { getGroundTruthState } from "@/lib/ground-truth";
import { getProjectMapContextState } from "@/lib/map-knowledge/service";
import { findProjectDetail } from "@/lib/projects";
import { formatDuration } from "@/lib/time";
import { getTranscriptionState } from "@/lib/transcription";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const project = await findProjectDetail(id);
  return { title: project?.name ?? "Project not found" };
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const project = await findProjectDetail(id);
  if (!project) notFound();
  const [transcription, groundTruth, analysis, mapContext] = await Promise.all([
    getTranscriptionState(id),
    getGroundTruthState(id),
    getDetectorFrameworkState(id),
    getProjectMapContextState(id),
  ]);

  return (
    <main className="min-h-screen">
      <header className="border-b border-white/8 bg-[#080b0e]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-7 lg:px-10">
          <Link
            href="/"
            aria-label="Back to all projects"
            className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b8ff2c]"
          >
            <BrandMark />
          </Link>
          <Link href="/" className="secondary-button">
            <ArrowLeft aria-hidden="true" size={16} /> All projects
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-9 sm:px-7 lg:px-10 lg:py-12">
        <div className="flex flex-col gap-6 border-b border-white/8 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="section-kicker">Project workspace</p>
            <h1 className="font-display mt-2 truncate text-4xl font-extrabold tracking-tight text-white uppercase sm:text-5xl">
              {project.name}
            </h1>
            <p className="mt-2 truncate text-sm text-slate-500">
              {project.originalFilename}
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#b8ff2c]/20 bg-[#b8ff2c]/7 px-3 py-2 text-xs font-bold tracking-[0.1em] text-[#d8ff8a] uppercase">
            <span className="size-1.5 rounded-full bg-[#b8ff2c]" /> Ready to
            clip
          </span>
        </div>

        <div className="mt-8 grid gap-7 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.55fr)]">
          <section
            className="panel overflow-hidden"
            aria-labelledby="source-title"
          >
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6">
              <div>
                <p className="section-kicker">Source footage</p>
                <h2
                  id="source-title"
                  className="font-display mt-1 text-2xl font-bold text-white uppercase"
                >
                  Recording preview
                </h2>
              </div>
              <Film className="text-slate-600" aria-hidden="true" size={21} />
            </div>
            <SourcePlayer projectId={project.id} title={project.name} />
          </section>

          <aside className="space-y-5">
            <section className="panel p-5 sm:p-6" aria-labelledby="intel-title">
              <p className="section-kicker">Video intel</p>
              <h2
                id="intel-title"
                className="font-display mt-1 text-2xl font-bold text-white uppercase"
              >
                Recording details
              </h2>
              <dl className="mt-6 grid grid-cols-2 gap-3">
                <MetadataCard
                  icon={Clock3}
                  label="Duration"
                  value={formatDuration(project.durationSeconds)}
                />
                <MetadataCard
                  icon={MonitorPlay}
                  label="Resolution"
                  value={`${project.width}×${project.height}`}
                />
                <MetadataCard
                  icon={Gauge}
                  label="Frame rate"
                  value={`${project.frameRate.toFixed(2)} fps`}
                />
                <MetadataCard
                  icon={HardDrive}
                  label="File size"
                  value={formatBytes(project.fileSizeBytes)}
                />
              </dl>
              <p className="mt-5 border-t border-white/8 pt-4 text-xs leading-5 text-slate-600">
                Added{" "}
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(project.createdAt))}
              </p>
            </section>

            <DeleteProjectButton
              projectId={project.id}
              projectName={project.name}
            />
          </aside>
        </div>

        <BenchmarkLabeler
          projectId={project.id}
          projectName={project.name}
          durationSeconds={project.durationSeconds}
          initialState={groundTruth}
        />

        <AnalysisFoundationPanel
          projectId={project.id}
          initialState={analysis}
          initialAudioTracks={transcription.audioTracks}
        />

        <ProjectMapContext projectId={project.id} initialState={mapContext} />

        <TranscriptionStudio
          projectId={project.id}
          initialState={transcription}
        />

        <ClipStation
          projectId={project.id}
          sourceDuration={project.durationSeconds}
          initialClips={project.clips}
        />

        <ContentWorkbench
          projectId={project.id}
          initialContent={project.contentDraft}
        />
      </div>
    </main>
  );
}

function MetadataCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-3.5">
      <Icon className="text-[#b8ff2c]" aria-hidden="true" size={16} />
      <dt className="mt-4 text-[10px] font-bold tracking-[0.12em] text-slate-600 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-slate-200">{value}</dd>
    </div>
  );
}
