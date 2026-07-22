import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { MapKnowledgeLibrary } from "@/components/map-knowledge-library";
import { listMapKnowledge } from "@/lib/map-knowledge/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Map Knowledge",
};

export default async function MapsPage() {
  const maps = await listMapKnowledge();
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 lg:px-10 lg:py-14">
        <p className="section-kicker">Phase 3B.2-M · local knowledge</p>
        <h1 className="font-display mt-2 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
          R6 map knowledge
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">
          Browse Ubisoft-sourced map records, preserve historical layouts, and
          add your own rooms, callouts, bomb sites, connections, and tactical
          notes. This does not recognize your exact room from gameplay footage.
        </p>
        <MapKnowledgeLibrary initialMaps={maps} />
      </div>
    </main>
  );
}
