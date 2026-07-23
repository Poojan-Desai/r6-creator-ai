import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { TranscriptRuleSettings } from "@/components/transcript-rule-settings";
import { listTranscriptRules } from "@/lib/transcript-rules";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Transcript Rules" };

export default async function TranscriptRulesPage() {
  const rules = await listTranscriptRules();
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 lg:px-10 lg:py-14">
        <p className="section-kicker">Phase 3B.2 · Advanced local settings</p>
        <h1 className="font-display mt-2 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
          Transcript evidence rules
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
          Inspect the exact local phrases and expressions used as supporting
          evidence. These rules never confirm gameplay events, locations,
          intent, or emotion.
        </p>
        <TranscriptRuleSettings initialRules={rules} />
      </div>
    </main>
  );
}
