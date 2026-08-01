import { BarChart3 } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { ProgressWorkspace } from "@/components/progress-workspace";
import { getProgressState } from "@/lib/progress";

export const dynamic = "force-dynamic";

export default async function ProgressPage() {
  const progress = await getProgressState();
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-9 sm:px-7 lg:px-10 lg:py-12">
        <header className="border-b border-white/8 pb-8">
          <div className="eyebrow">
            <BarChart3 size={15} /> U7 · Local Player Progress
          </div>
          <h1 className="font-display mt-5 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
            Track the evidence.
            <br />
            <span className="text-[#b8ff2c]">Do not invent improvement.</span>
          </h1>
          <p className="mt-4 max-w-4xl text-base leading-7 text-slate-400">
            Save transparent snapshots across projects, compare bounded windows,
            and track deliberate practice. Every metric shows its sample, source
            version, evidence class, and unavailable context.
          </p>
        </header>
        <div className="mt-8">
          <ProgressWorkspace initialState={progress} />
        </div>
      </div>
    </main>
  );
}
