import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import { StudioProjectForm } from "@/components/studio-project-form";
import { getStudioProjectOptions } from "@/lib/studio-projects";

export const dynamic = "force-dynamic";

export default async function NewStudioProjectPage() {
  const options = await getStudioProjectOptions();
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-5 py-9 sm:px-7 lg:px-10 lg:py-12">
        <Link href="/studio" className="secondary-button no-underline">
          <ArrowLeft size={16} /> Creator Studio
        </Link>
        <div className="mt-8">
          <div className="eyebrow">
            <Sparkles size={15} /> U1 · Guided project setup
          </div>
          <h1 className="font-display mt-5 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
            Build one
            <br />
            <span className="text-[#b8ff2c]">shared workspace.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
            Tell the app what you want to make, connect sources already saved
            locally, and add instructions in your own words. Nothing is analyzed
            until a later step asks you to start it.
          </p>
        </div>
        <div className="mt-10">
          <StudioProjectForm options={options} />
        </div>
      </div>
    </main>
  );
}
