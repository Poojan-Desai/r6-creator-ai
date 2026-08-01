import {
  Archive,
  ArrowUpRight,
  BrainCircuit,
  Clock3,
  Film,
  FolderOpen,
  HardDrive,
  Plus,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { UploadPanel } from "@/components/upload-panel";
import { appConfig } from "@/lib/config";
import { ensureDataDirectories } from "@/lib/data-paths";
import { db } from "@/lib/db";
import { formatBytes } from "@/lib/format";
import { serializeProjectSummary } from "@/lib/projects";
import { listStudioProjects, STUDIO_OUTPUT_GOALS } from "@/lib/studio-projects";
import { formatDuration } from "@/lib/time";
import { getVideoToolHealth } from "@/lib/video";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureDataDirectories();
  const [toolHealth, projectsResult, replayCount, studioResult] =
    await Promise.all([
      getVideoToolHealth(),
      db.project
        .findMany({
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { clips: true } } },
        })
        .then((projects) => ({
          projects: projects.map(serializeProjectSummary),
          error: false,
        }))
        .catch(() => ({ projects: [], error: true })),
      db.replayPackage.count().catch(() => 0),
      listStudioProjects()
        .then((projects) => ({ projects, error: false }))
        .catch(() => ({ projects: [], error: true })),
    ]);
  const projects = projectsResult.projects;
  const studioProjects = studioResult.projects;
  const totalFootage = projects.reduce(
    (sum, project) => sum + project.durationSeconds,
    0,
  );

  return (
    <main className="min-h-screen">
      <AppHeader />

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 lg:px-10 lg:py-14">
        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="eyebrow">
              <Sparkles aria-hidden="true" size={15} />
              Your local Creator Studio and Coaching Lab
            </div>
            <h1 className="font-display mt-6 max-w-4xl text-5xl leading-[0.9] font-extrabold tracking-[-0.035em] text-white uppercase sm:text-6xl lg:text-7xl">
              Play the match.
              <span className="block text-[#b8ff2c]">Build what matters.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
              Start with your gameplay recording for real visuals and audio. Add
              an optional Match Replay for supported match facts, then keep
              content and evidence-backed coaching in one private project.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/studio/new"
                className="primary-button inline-flex normal-case no-underline"
              >
                <Plus size={18} /> Create unified project
                <ArrowUpRight size={17} />
              </Link>
              <Link
                href="/studio"
                className="secondary-button normal-case no-underline"
              >
                Open Creator Studio
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <DashboardStat
              icon={Sparkles}
              value={String(studioProjects.length).padStart(2, "0")}
              label="Unified"
            />
            <DashboardStat
              icon={Archive}
              value={String(replayCount).padStart(2, "0")}
              label="Replays"
            />
            <DashboardStat
              icon={Clock3}
              value={formatDuration(totalFootage)}
              label="Footage"
            />
          </div>
        </section>

        {(!toolHealth.ffmpeg ||
          !toolHealth.ffprobe ||
          projectsResult.error ||
          studioResult.error) && (
          <div className="error-box mt-8" role="alert">
            <span className="font-semibold">Local setup needs attention.</span>{" "}
            {projectsResult.error || studioResult.error
              ? "Project storage is not ready. Run the database setup command in README.md, then reload this page."
              : "The video tools are unavailable. Reinstall the project dependencies using the README steps."}
          </div>
        )}

        <section className="mt-10 grid gap-5 lg:grid-cols-2">
          <Link
            href="/studio"
            className="panel group block p-6 no-underline sm:p-7"
          >
            <div className="flex items-start justify-between gap-5">
              <span className="grid size-12 place-items-center rounded-xl bg-[#b8ff2c]/10 text-[#b8ff2c]">
                <Film size={24} />
              </span>
              <ArrowUpRight className="text-slate-600 group-hover:text-[#b8ff2c]" />
            </div>
            <p className="section-kicker mt-6">Primary workspace</p>
            <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
              Creator Studio
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Connect recordings, optional replay evidence, references, and
              style preferences. U1 saves one shared brief and U2 aligns
              combined recording/replay timelines without changing either
              source.
            </p>
          </Link>
          <Link
            href="/studio/new"
            className="panel group block p-6 no-underline sm:p-7"
          >
            <div className="flex items-start justify-between gap-5">
              <span className="grid size-12 place-items-center rounded-xl bg-sky-300/10 text-sky-200">
                <BrainCircuit size={24} />
              </span>
              <ArrowUpRight className="text-slate-600 group-hover:text-[#b8ff2c]" />
            </div>
            <p className="section-kicker mt-6">Shared project goal</p>
            <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
              Coaching Lab
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Choose “Coaching report” or “Both content and coaching” when you
              create a project. U6 will generate findings only from visible
              observations and supported replay facts.
            </p>
          </Link>
        </section>

        {studioProjects.length > 0 && (
          <section className="mt-12" aria-labelledby="recent-studio-title">
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="section-kicker">Continue working</p>
                <h2
                  id="recent-studio-title"
                  className="font-display mt-1 text-4xl font-bold text-white uppercase"
                >
                  Recent unified projects
                </h2>
              </div>
              <Link
                href="/studio"
                className="secondary-button hidden no-underline sm:inline-flex"
              >
                View all
              </Link>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {studioProjects.slice(0, 3).map((project) => (
                <Link
                  key={project.id}
                  href={`/studio/${project.id}`}
                  className="project-card group"
                >
                  <div className="flex items-start justify-between gap-5">
                    <span className="grid size-11 place-items-center rounded-xl border border-white/8 bg-[#b8ff2c]/8 text-[#b8ff2c]">
                      <Sparkles size={21} />
                    </span>
                    <ArrowUpRight
                      className="text-slate-600 transition group-hover:text-[#b8ff2c]"
                      size={20}
                    />
                  </div>
                  <p className="section-kicker mt-6">
                    {STUDIO_OUTPUT_GOALS.find(
                      (item) => item.value === project.outputGoal,
                    )?.label ?? project.outputGoal}
                  </p>
                  <h3 className="font-display mt-2 truncate text-2xl font-bold text-white uppercase">
                    {project.name}
                  </h3>
                  <p className="mt-2 text-sm text-slate-500">
                    {project.inputMode
                      .toLowerCase()
                      .replaceAll("_", " ")
                      .replace("and", "+")}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <div id="recording-upload">
            <UploadPanel maxUploadBytes={appConfig.maxUploadBytes} />
          </div>
          <aside className="panel h-fit p-6 sm:p-7">
            <p className="section-kicker">Source library</p>
            <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
              Add only what you have
            </h2>
            <ol className="mt-7 space-y-5">
              {[
                [
                  "01",
                  "Upload your recording",
                  "The MP4 supplies real gameplay pixels, audio, transcript, clips, and exports.",
                ],
                [
                  "02",
                  "Optionally import replay evidence",
                  "A .rec package can add supported match facts after synchronization.",
                ],
                [
                  "03",
                  "Optionally choose a reference",
                  "Use high-level structure and pacing without copying protected expression.",
                ],
                [
                  "04",
                  "Create one unified project",
                  "Save the goal, inputs, focus, identity, audio, context, and instructions.",
                ],
              ].map(([number, title, description]) => (
                <li key={number} className="flex gap-4">
                  <span className="font-display text-lg font-bold text-[#b8ff2c]">
                    {number}
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-100">
                      {title}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-500">
                      {description}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <Link
              href="/replays"
              className="secondary-button mt-7 w-full no-underline"
            >
              <Archive size={15} /> Match Replay Library
            </Link>
            <div className="mt-5 flex items-center gap-2 border-t border-white/8 pt-5 text-xs text-slate-500">
              <HardDrive aria-hidden="true" size={15} />
              No login, AI key, or paid account required.
            </div>
          </aside>
        </div>

        <section className="mt-14" aria-labelledby="projects-title">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="section-kicker">Source library</p>
              <h2
                id="projects-title"
                className="font-display mt-1 text-4xl font-bold text-white uppercase"
              >
                Saved video workspaces
              </h2>
            </div>
            <p className="hidden text-sm text-slate-500 sm:block">
              Existing Phase 1–3B tools remain available
            </p>
          </div>

          {projects.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center">
              <FolderOpen
                className="mx-auto text-slate-600"
                aria-hidden="true"
                size={34}
              />
              <h3 className="font-display mt-4 text-2xl font-bold text-slate-200 uppercase">
                No saved recordings yet
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                Choose your first MP4 above. The source workspace and every clip
                will reappear after you close and reopen the app.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="project-card group"
                >
                  <div className="flex items-start justify-between gap-5">
                    <span className="grid size-11 place-items-center rounded-xl border border-white/8 bg-white/4 text-[#b8ff2c]">
                      <Film aria-hidden="true" size={22} />
                    </span>
                    <ArrowUpRight
                      className="text-slate-600 transition group-hover:text-[#b8ff2c]"
                      aria-hidden="true"
                      size={20}
                    />
                  </div>
                  <h3 className="font-display mt-6 truncate text-2xl font-bold text-white uppercase">
                    {project.name}
                  </h3>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {project.originalFilename}
                  </p>
                  <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/8 pt-5 text-xs">
                    <ProjectMeta
                      label="Length"
                      value={formatDuration(project.durationSeconds)}
                    />
                    <ProjectMeta
                      label="Video"
                      value={`${project.width}×${project.height}`}
                    />
                    <ProjectMeta
                      label="Clips"
                      value={String(project.clipCount)}
                    />
                  </div>
                  <p className="mt-5 text-xs text-slate-600">
                    {formatBytes(project.fileSizeBytes)} · Saved{" "}
                    {new Intl.DateTimeFormat("en", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }).format(new Date(project.createdAt))}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function DashboardStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof FolderOpen;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
      <Icon className="text-slate-600" aria-hidden="true" size={17} />
      <p className="font-display mt-4 truncate text-2xl font-bold text-white sm:text-3xl">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-bold tracking-[0.15em] text-slate-600 uppercase">
        {label}
      </p>
    </div>
  );
}

function ProjectMeta({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="block text-slate-600">{label}</span>
      <span className="mt-1 block font-semibold text-slate-300">{value}</span>
    </span>
  );
}
