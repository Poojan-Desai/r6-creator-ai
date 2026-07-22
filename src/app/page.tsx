import Link from "next/link";
import {
  ArrowUpRight,
  Clock3,
  Film,
  FolderOpen,
  HardDrive,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { UploadPanel } from "@/components/upload-panel";
import { appConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { ensureDataDirectories } from "@/lib/data-paths";
import { formatBytes } from "@/lib/format";
import { serializeProjectSummary } from "@/lib/projects";
import { formatDuration } from "@/lib/time";
import { getVideoToolHealth } from "@/lib/video";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await ensureDataDirectories();
  const [toolHealth, projectsResult] = await Promise.all([
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
  ]);
  const projects = projectsResult.projects;
  const totalClips = projects.reduce(
    (sum, project) => sum + project.clipCount,
    0,
  );
  const totalFootage = projects.reduce(
    (sum, project) => sum + project.durationSeconds,
    0,
  );

  return (
    <main className="min-h-screen">
      <header className="border-b border-white/8 bg-[#080b0e]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-7 lg:px-10">
          <BrandMark />
          <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/3 px-3 py-2 text-xs font-semibold text-slate-400">
            <ShieldCheck
              className="text-[#b8ff2c]"
              aria-hidden="true"
              size={15}
            />
            Files stay on this Mac
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 lg:px-10 lg:py-14">
        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <div className="eyebrow">
              <Sparkles aria-hidden="true" size={15} />
              Your local content operations desk
            </div>
            <h1 className="font-display mt-6 max-w-4xl text-5xl leading-[0.9] font-extrabold tracking-[-0.035em] text-white uppercase sm:text-6xl lg:text-7xl">
              Find the moment.
              <span className="block text-[#b8ff2c]">Build the story.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
              Turn long Rainbow Six recordings into organized clip
              packages—without sending your footage to a cloud service.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <DashboardStat
              icon={FolderOpen}
              value={String(projects.length).padStart(2, "0")}
              label="Projects"
            />
            <DashboardStat
              icon={Film}
              value={String(totalClips).padStart(2, "0")}
              label="Clips"
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
          projectsResult.error) && (
          <div className="error-box mt-8" role="alert">
            <span className="font-semibold">Local setup needs attention.</span>{" "}
            {projectsResult.error
              ? "Project storage is not ready. Run the database setup command in README.md, then reload this page."
              : "The video tools are unavailable. Reinstall the project dependencies using the README steps."}
          </div>
        )}

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <UploadPanel maxUploadBytes={appConfig.maxUploadBytes} />

          <aside className="panel h-fit p-6 sm:p-7">
            <p className="section-kicker">First-pass workflow</p>
            <h2 className="font-display mt-2 text-3xl font-bold text-white uppercase">
              From VOD to package
            </h2>
            <ol className="mt-7 space-y-5">
              {[
                [
                  "01",
                  "Upload privately",
                  "Your MP4 is copied into this app’s local data folder.",
                ],
                [
                  "02",
                  "Mark the moment",
                  "Choose exact start and end times while watching the recording.",
                ],
                [
                  "03",
                  "Shape the post",
                  "Save the hook, script, title, caption, thumbnail text, and edit notes.",
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
            <div className="mt-7 flex items-center gap-2 border-t border-white/8 pt-5 text-xs text-slate-500">
              <HardDrive aria-hidden="true" size={15} />
              No login, AI key, or paid account required.
            </div>
          </aside>
        </div>

        <section className="mt-14" aria-labelledby="projects-title">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="section-kicker">Library</p>
              <h2
                id="projects-title"
                className="font-display mt-1 text-4xl font-bold text-white uppercase"
              >
                Saved projects
              </h2>
            </div>
            <p className="hidden text-sm text-slate-500 sm:block">
              Newest recording first
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
                No saved projects yet
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                Choose your first MP4 above. The project and every clip you
                create will reappear here after you close and reopen the app.
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
