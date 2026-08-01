import { ArrowLeft, ScanSearch } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { CoachingLabWorkspace } from "@/components/coaching-lab-workspace";
import {
  COACHING_DECISIONS,
  COACHING_FINDING_CATEGORIES,
  COACHING_SEVERITIES,
  getCoachingState,
} from "@/lib/coaching";
import { findStudioProject } from "@/lib/studio-projects";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function CoachingLabPage({ params }: Props) {
  const { id } = await params;
  const project = await findStudioProject(id);
  if (!project) notFound();
  const coaching = await getCoachingState(project.id);

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
            <ScanSearch size={15} /> U6 · Coaching Lab
          </div>
          <h1 className="font-display mt-5 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
            Review what happened.
            <br />
            <span className="text-[#b8ff2c]">Keep uncertainty visible.</span>
          </h1>
          <p className="mt-4 max-w-4xl text-base leading-7 text-slate-400">
            Use the owned screen recording for visible observations, Match
            Replay for supported structured facts, and transcript statements
            only as supporting evidence. Unknown position, intent, line of
            sight, and mechanical cause stay unknown.
          </p>
        </header>
        <div className="mt-8">
          <CoachingLabWorkspace
            studioProjectId={project.id}
            initialState={coaching}
            categories={COACHING_FINDING_CATEGORIES}
            severities={COACHING_SEVERITIES}
            decisions={COACHING_DECISIONS}
          />
        </div>
      </div>
    </main>
  );
}
