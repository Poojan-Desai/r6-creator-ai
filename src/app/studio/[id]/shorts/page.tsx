import { ArrowLeft, Clapperboard, Film } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { ShortFormCandidateWorkspace } from "@/components/short-form-candidate-workspace";
import { SourcePlayer } from "@/components/source-player";
import { getStudioCandidateState } from "@/lib/short-form-candidates";
import { findStudioProject } from "@/lib/studio-projects";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ShortFormStudioPage({ params }: Props) {
  const { id } = await params;
  const project = await findStudioProject(id);
  if (!project) notFound();
  const recording = project.inputs.find(
    (input) => input.kind === "PRIMARY_RECORDING",
  )?.videoProject;

  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-9 sm:px-7 lg:px-10 lg:py-12">
        <Link
          href={`/studio/${project.id}`}
          className="secondary-button no-underline"
        >
          <ArrowLeft size={16} /> Back to project
        </Link>
        <div className="mt-8 flex flex-col gap-5 border-b border-white/8 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="eyebrow">
              <Clapperboard size={15} /> U3 · Short-form Creator Studio
            </div>
            <h1 className="font-display mt-5 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
              Find the moment.
              <br />
              <span className="text-[#b8ff2c]">Keep the evidence.</span>
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
              Review local signal recommendations, correct the boundaries, and
              preserve why each moment was selected before writing or editing.
            </p>
          </div>
          {recording && (
            <Link
              href={`/projects/${recording.id}#analysis-foundation`}
              className="secondary-button shrink-0 no-underline"
            >
              <Film size={16} /> Open signal analysis
            </Link>
          )}
        </div>

        {!recording ? (
          <section className="panel mt-8 p-8 text-center">
            <Film className="mx-auto text-slate-700" size={34} />
            <h2 className="mt-4 text-xl font-semibold text-white">
              A screen recording is required
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              This project contains Match Replay facts but no gameplay pixels or
              audio. Add a real screen recording before creating a playable
              short.
            </p>
          </section>
        ) : (
          <>
            <section
              id="short-form-source"
              className="panel mt-8 overflow-hidden"
            >
              <div className="border-b border-white/8 px-5 py-4 sm:px-6">
                <p className="section-kicker">Primary screen recording</p>
                <h2 className="font-display mt-1 text-2xl font-bold text-white uppercase">
                  {recording.name}
                </h2>
              </div>
              <SourcePlayer projectId={recording.id} title={recording.name} />
            </section>
            <div className="mt-8">
              <ShortFormCandidateWorkspace
                studioProjectId={project.id}
                initialState={await getStudioCandidateState(project.id)}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
