import {
  ArrowUpRight,
  Film,
  FolderOpen,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import {
  listStudioProjects,
  STUDIO_INPUT_MODES,
  STUDIO_OUTPUT_GOALS,
} from "@/lib/studio-projects";

export const dynamic = "force-dynamic";

export default async function StudioLibraryPage() {
  const projects = await listStudioProjects();
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 lg:px-10 lg:py-14">
        <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div>
            <div className="eyebrow">
              <Sparkles size={15} /> Unified personal workspace
            </div>
            <h1 className="font-display mt-5 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
              Creator Studio
              <br />
              <span className="text-[#b8ff2c]">meets Coaching Lab.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
              Connect recordings, optional Match Replay evidence, and permitted
              structural references in one local project. Your original source
              records remain unchanged.
            </p>
          </div>
          <Link href="/studio/new" className="primary-button no-underline">
            <Plus size={18} /> Create unified project
          </Link>
        </div>

        <div className="mt-8 flex max-w-3xl items-start gap-3 rounded-2xl border border-[#b8ff2c]/18 bg-[#b8ff2c]/5 p-4 text-sm leading-6 text-slate-300">
          <ShieldCheck className="mt-0.5 shrink-0 text-[#b8ff2c]" size={19} />
          U1 saves project inputs, instructions, identity choices, and confirmed
          context. It does not start synchronization or analysis, and it never
          treats replay data as gameplay footage.
        </div>

        <section className="mt-12" aria-labelledby="studio-projects-title">
          <div>
            <p className="section-kicker">Local library</p>
            <h2
              id="studio-projects-title"
              className="font-display mt-1 text-4xl font-bold text-white uppercase"
            >
              Unified projects
            </h2>
          </div>
          {projects.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center">
              <FolderOpen
                className="mx-auto text-slate-600"
                size={36}
                aria-hidden="true"
              />
              <h3 className="font-display mt-4 text-2xl font-bold text-white uppercase">
                No unified projects yet
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                Your existing video projects, Match Replays, references, and
                profiles are still present. Create a unified project to connect
                any of them without copying the source data.
              </p>
              <Link
                href="/studio/new"
                className="primary-button mt-6 no-underline"
              >
                <Plus size={18} /> Create your first project
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => {
                const goal =
                  STUDIO_OUTPUT_GOALS.find(
                    (item) => item.value === project.outputGoal,
                  )?.label ?? project.outputGoal;
                const mode =
                  STUDIO_INPUT_MODES.find(
                    (item) => item.value === project.inputMode,
                  )?.label ?? project.inputMode;
                const recordingCount = project.inputs.filter(
                  (input) =>
                    input.kind === "PRIMARY_RECORDING" ||
                    input.kind === "ADDITIONAL_RECORDING",
                ).length;
                const hasReplay = project.inputs.some(
                  (input) => input.kind === "MATCH_REPLAY",
                );
                return (
                  <Link
                    href={`/studio/${project.id}`}
                    key={project.id}
                    className="project-card group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <span className="grid size-11 place-items-center rounded-xl border border-white/8 bg-[#b8ff2c]/8 text-[#b8ff2c]">
                        <Film size={21} />
                      </span>
                      <ArrowUpRight
                        className="text-slate-600 transition group-hover:text-[#b8ff2c]"
                        size={20}
                      />
                    </div>
                    <p className="section-kicker mt-6">{goal}</p>
                    <h3 className="font-display mt-2 truncate text-2xl font-bold text-white uppercase">
                      {project.name}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {mode}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-2 border-t border-white/8 pt-5 text-xs text-slate-400">
                      <span className="rounded-full border border-white/9 px-2.5 py-1">
                        {recordingCount} recording
                        {recordingCount === 1 ? "" : "s"}
                      </span>
                      <span className="rounded-full border border-white/9 px-2.5 py-1">
                        {hasReplay ? "Replay linked" : "No replay"}
                      </span>
                      <span className="rounded-full border border-white/9 px-2.5 py-1">
                        {project.referenceMode === "NONE"
                          ? "No reference"
                          : "Reference linked"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
