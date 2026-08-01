import { ArrowLeft, BookOpenCheck, Film } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { LongFormPlanningWorkspace } from "@/components/long-form-planning-workspace";
import { getLongFormProductionState } from "@/lib/long-form-productions";
import { findStudioProject } from "@/lib/studio-projects";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function LongFormStudioPage({ params }: Props) {
  const { id } = await params;
  const project = await findStudioProject(id);
  if (!project) notFound();
  const recordings = project.inputs.filter(
    (input) =>
      (input.kind === "PRIMARY_RECORDING" ||
        input.kind === "ADDITIONAL_RECORDING") &&
      input.videoProject,
  );
  const state =
    recordings.length > 0 ? await getLongFormProductionState(project.id) : null;

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
        <header className="mt-8 border-b border-white/8 pb-8">
          <div className="eyebrow">
            <BookOpenCheck size={15} /> U4 · Long-Form Creator Studio
          </div>
          <h1 className="font-display mt-5 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
            Shape the full story.
            <br />
            <span className="text-[#b8ff2c]">Keep every claim grounded.</span>
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
            Plan a 20–30 minute video from one or more linked recordings. The
            local planner preserves source ranges, evidence, unknowns, and
            immutable versions before any edit is rendered.
          </p>
        </header>

        {recordings.length === 0 || !state ? (
          <section className="panel mt-8 p-8 text-center">
            <Film className="mx-auto text-slate-700" size={34} />
            <h2 className="mt-4 text-xl font-semibold text-white">
              A screen recording is required
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Match Replay files contain structured facts but no gameplay pixels
              or audio. Add a real screen recording in the project setup before
              creating a long-form plan.
            </p>
            <Link
              href={`/studio/${project.id}/edit`}
              className="primary-button mt-5 no-underline"
            >
              Edit project setup
            </Link>
          </section>
        ) : (
          <div className="mt-8">
            <LongFormPlanningWorkspace
              studioProjectId={project.id}
              initialState={state}
            />
          </div>
        )}
      </div>
    </main>
  );
}
