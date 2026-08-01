import { ArrowLeft, Mic2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { VoiceoverStudio } from "@/components/voiceover-studio";
import { findStudioProject } from "@/lib/studio-projects";
import { getVoiceoverState } from "@/lib/voiceover";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function VoiceoverStudioPage({ params }: Props) {
  const { id } = await params;
  const project = await findStudioProject(id);
  if (!project) notFound();
  const voiceover = await getVoiceoverState(project.id);
  const suggestedTarget =
    project.outputGoal === "LONG_FORM_YOUTUBE" ||
    project.outputGoal === "MATCH_RECAP"
      ? "LONG_FORM"
      : "SHORT_FORM";

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
            <Mic2 size={15} /> U5 · Voiceover Studio
          </div>
          <h1 className="font-display mt-5 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
            Write from evidence.
            <br />
            <span className="text-[#b8ff2c]">Record in your own voice.</span>
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
            Review facts, generate original local scripts, and manage narration
            takes without cloud upload, speaker identification, voiceprints, or
            voice cloning.
          </p>
        </header>
        <div className="mt-8">
          <VoiceoverStudio
            studioProjectId={project.id}
            initialState={voiceover}
            suggestedTarget={suggestedTarget}
          />
        </div>
      </div>
    </main>
  );
}
