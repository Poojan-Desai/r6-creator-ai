import type { Metadata } from "next";
import { ArrowLeft, Cable, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { SynchronizationWorkspace } from "@/components/synchronization-workspace";
import { getSynchronizationWorkspace } from "@/lib/replay-video-sync";
import { findStudioProject } from "@/lib/studio-projects";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const project = await findStudioProject(id);
  return {
    title: project ? `Synchronize · ${project.name}` : "Project not found",
  };
}

export default async function SynchronizationPage({
  params,
  searchParams,
}: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const project = await findStudioProject(id);
  if (!project) notFound();
  const versionValue = query.version ? Number(query.version) : null;
  const workspace = await getSynchronizationWorkspace(
    id,
    Number.isInteger(versionValue) && (versionValue ?? 0) > 0
      ? versionValue
      : null,
  );

  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-9 sm:px-7 lg:px-10 lg:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/studio/${project.id}`}
            className="secondary-button no-underline"
          >
            <ArrowLeft size={16} /> Back to unified project
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-300/15 bg-sky-300/5 px-3 py-2 text-xs font-bold tracking-[0.1em] text-sky-100/80 uppercase">
            <ShieldCheck size={15} /> Local evidence only
          </span>
        </div>

        <header className="mt-8 border-b border-white/8 pb-8">
          <div className="eyebrow">
            <Cable size={15} /> U2 · Replay/video synchronization
          </div>
          <h1 className="font-display mt-5 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
            Align the timelines
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
            Match direct observations in the screen recording to facts from the
            selected Match Replay. The original files are never modified. A
            verified mapping requires at least two confirmed points at different
            replay times.
          </p>
        </header>

        <SynchronizationWorkspace initialWorkspace={workspace} />
      </div>
    </main>
  );
}
