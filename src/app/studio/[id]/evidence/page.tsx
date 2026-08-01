import { ArrowLeft, ListTree } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { EvidenceInspectorWorkspace } from "@/components/evidence-inspector-workspace";
import { getProjectEvidenceInspector } from "@/lib/evidence-inspector";
import { findStudioProject } from "@/lib/studio-projects";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EvidenceInspectorPage({ params }: Props) {
  const { id } = await params;
  const project = await findStudioProject(id);
  if (!project) notFound();
  const evidence = await getProjectEvidenceInspector(project.id);

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
            <ListTree size={15} /> U7 · Evidence Inspector
          </div>
          <h1 className="font-display mt-5 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
            Inspect every claim.
            <br />
            <span className="text-[#b8ff2c]">Keep the boundary attached.</span>
          </h1>
          <p className="mt-4 max-w-4xl text-base leading-7 text-slate-400">
            {project.name} combines creator and coaching evidence without hiding
            provenance, corrections, confidence, conflicts, or unknown
            information.
          </p>
        </header>
        <div className="mt-8">
          <EvidenceInspectorWorkspace initialState={evidence} />
        </div>
      </div>
    </main>
  );
}
