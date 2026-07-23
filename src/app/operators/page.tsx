import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { OperatorLibrary } from "@/components/operator-library";
import { listOperators } from "@/lib/operator-knowledge/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Operator Knowledge" };

export default async function OperatorsPage() {
  const operators = await listOperators();
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 lg:px-10 lg:py-14">
        <p className="section-kicker">Phase 3B.2-O · local knowledge</p>
        <h1 className="font-display mt-2 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
          R6 operator knowledge
        </h1>
        <p className="mt-4 max-w-4xl text-base leading-7 text-slate-400">
          Browse a versioned official roster and structured, source-backed
          operator facts. The application does not recognize operators, weapons,
          gadgets, or ability use from footage.
        </p>
        <OperatorLibrary initialOperators={operators} />
      </div>
    </main>
  );
}
