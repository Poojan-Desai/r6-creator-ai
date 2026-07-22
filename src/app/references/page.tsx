import { BookOpen, ShieldCheck } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { ReferenceLibraryClient } from "@/components/reference-library-client";
import { appConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { ensureDataDirectories } from "@/lib/data-paths";
import { serializeReferenceSummary } from "@/lib/reference-library";
import { isYouTubeMetadataConfigured } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export default async function ReferencesPage() {
  await ensureDataDirectories();
  const references = await db.referenceVideo.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      styleAnalyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 lg:px-10 lg:py-14">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="eyebrow">
              <BookOpen size={15} /> Phase 3A · Reference Library
            </div>
            <h1 className="font-display mt-5 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
              Teach structure,
              <br />
              <span className="text-[#b8ff2c]">not imitation.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
              Measure pacing, timing, speech, energy, and structure from videos
              you may analyze. Profiles never copy scripts, jokes, titles, or
              distinctive wording.
            </p>
          </div>
          <div className="flex max-w-sm items-start gap-3 rounded-2xl border border-[#b8ff2c]/18 bg-[#b8ff2c]/5 p-4 text-sm leading-6 text-slate-300">
            <ShieldCheck className="mt-0.5 shrink-0 text-[#b8ff2c]" size={19} />
            Files, transcripts, and style evidence stay on this Mac by default.
          </div>
        </div>
        <div className="mt-10">
          <ReferenceLibraryClient
            references={references.map(serializeReferenceSummary)}
            maxUploadBytes={appConfig.maxUploadBytes}
            youtubeMetadataConfigured={isYouTubeMetadataConfigured()}
          />
        </div>
      </div>
    </main>
  );
}
