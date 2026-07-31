import { Archive, ShieldCheck } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { ReplayLibraryClient } from "@/components/replay-library-client";
import { ensureDataDirectories } from "@/lib/data-paths";
import { r6DissectReplayProvider } from "@/lib/replays/providers/r6-dissect";
import { listReplayPackages } from "@/lib/replays/service";

export const dynamic = "force-dynamic";

export default async function ReplayLibraryPage() {
  await ensureDataDirectories();
  const [replays, readiness] = await Promise.all([
    listReplayPackages(),
    r6DissectReplayProvider.inspectReadiness(),
  ]);
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 lg:px-10 lg:py-14">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="eyebrow">
              <Archive size={15} /> Replay-first foundation
            </div>
            <h1 className="font-display mt-5 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
              Match evidence,
              <br />
              <span className="text-[#b8ff2c]">kept inspectable.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
              Import completed Rainbow Six Match Replay files, inspect exactly
              what the reviewed local parser can and cannot recover, and keep
              every inference separate from direct evidence.
            </p>
          </div>
          <div className="flex max-w-sm items-start gap-3 rounded-2xl border border-[#b8ff2c]/18 bg-[#b8ff2c]/5 p-4 text-sm leading-6 text-slate-300">
            <ShieldCheck className="mt-0.5 shrink-0 text-[#b8ff2c]" size={19} />
            Replay parsing is local. It does not upload footage, audio, player
            names, or parsed evidence.
          </div>
        </div>
        <div className="mt-10">
          <ReplayLibraryClient
            initialReplays={replays}
            provider={{
              ...readiness,
              version: r6DissectReplayProvider.version,
              sourceCommit: r6DissectReplayProvider.sourceCommit,
            }}
          />
        </div>
      </div>
    </main>
  );
}
