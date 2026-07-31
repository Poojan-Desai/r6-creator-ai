import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { StudioProjectForm } from "@/components/studio-project-form";
import {
  findStudioProject,
  getStudioProjectOptions,
} from "@/lib/studio-projects";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditStudioProjectPage({ params }: Props) {
  const { id } = await params;
  const [project, options] = await Promise.all([
    findStudioProject(id),
    getStudioProjectOptions(),
  ]);
  if (!project) notFound();
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-5 py-9 sm:px-7 lg:px-10 lg:py-12">
        <Link
          href={`/studio/${project.id}`}
          className="secondary-button no-underline"
        >
          <ArrowLeft size={16} /> Back to project
        </Link>
        <div className="mt-8">
          <div className="eyebrow">
            <SlidersHorizontal size={15} /> U1 · Project settings
          </div>
          <h1 className="font-display mt-5 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
            Update the
            <br />
            <span className="text-[#b8ff2c]">shared brief.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
            Change linked inputs, focus, instructions, or confirmed context.
            Source files and their existing projects are not modified.
          </p>
        </div>
        <div className="mt-10">
          <StudioProjectForm options={options} project={project} />
        </div>
      </div>
    </main>
  );
}
