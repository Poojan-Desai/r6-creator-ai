import { SlidersHorizontal } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { StyleProfileLibrary } from "@/components/style-profile-library";
import { db } from "@/lib/db";
import { serializeStyleProfile } from "@/lib/style-profiles";

export const dynamic = "force-dynamic";

export default async function StyleProfilesPage() {
  const [profiles, references] = await Promise.all([
    db.creatorStyleProfile.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        referenceLinks: {
          include: { reference: true },
          orderBy: { createdAt: "asc" },
        },
        features: { orderBy: { label: "asc" } },
      },
    }),
    db.referenceVideo.findMany({
      where: {
        referenceType: "LOCAL_VIDEO",
        styleAnalyses: { some: { status: "COMPLETED" } },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        creatorName: true,
        contentCategory: true,
      },
    }),
  ]);
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 lg:px-10 lg:py-14">
        <div className="eyebrow">
          <SlidersHorizontal size={15} /> Phase 3A · Structured preferences
        </div>
        <h1 className="font-display mt-5 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
          Make it feel
          <br />
          <span className="text-[#b8ff2c]">like your channel.</span>
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
          Profiles describe high-level choices—length, hook timing, energy,
          humor, teaching, story, setup, captions, cuts, and reactions—while
          keeping generated wording original.
        </p>
        <div className="mt-10">
          <StyleProfileLibrary
            profiles={profiles.map(serializeStyleProfile)}
            references={references}
          />
        </div>
      </div>
    </main>
  );
}
