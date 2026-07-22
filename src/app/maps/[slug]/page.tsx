import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { MapKnowledgeEditor } from "@/components/map-knowledge-editor";
import { getMapDetail } from "@/lib/map-knowledge/service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const map = await getMapDetail(slug);
  return { title: map ? `${map.name} Map Knowledge` : "Map not found" };
}

export default async function MapDetailPage({ params }: Props) {
  const { slug } = await params;
  const map = await getMapDetail(slug);
  if (!map) notFound();

  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-9 sm:px-7 lg:px-10 lg:py-12">
        <Link href="/maps" className="secondary-button">
          <ArrowLeft aria-hidden="true" size={15} /> All maps
        </Link>
        <div className="mt-7 grid gap-6 border-b border-white/8 pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="section-kicker">
              {map.knowledgeStatus.replaceAll("_", " ")} ·{" "}
              {map.sourceType.toLowerCase()} record
            </p>
            <h1 className="font-display mt-2 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
              {map.name}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
              {map.officialDescription}
            </p>
          </div>
          <a
            className="secondary-button w-fit"
            href={map.sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            Official source <ExternalLink aria-hidden="true" size={14} />
          </a>
        </div>

        <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Release" value={map.releaseLabel} />
          <Fact
            label="Rework / modernization"
            value={map.modernizationLabel ?? "No official date listed"}
          />
          <Fact
            label="Lifecycle"
            value={map.lifecycleStatus.replaceAll("_", " ")}
          />
          <Fact
            label="Last official verification"
            value={new Intl.DateTimeFormat("en", {
              dateStyle: "medium",
              timeZone: "UTC",
            }).format(new Date(map.lastVerifiedAt))}
          />
        </section>

        <div className="mt-7 rounded-xl border border-amber-300/20 bg-amber-300/6 p-4 text-sm leading-6 text-amber-100/80">
          <ShieldCheck
            className="mr-2 inline text-amber-300"
            size={17}
            aria-hidden="true"
          />
          A listed map is not automatically a fully annotated map. Room names,
          community callouts, tactics, and geometry remain labeled by source and
          confidence. Exact room detection from footage is not implemented.
        </div>

        <MapKnowledgeEditor initialMap={map} />
      </div>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-4">
      <p className="text-[10px] font-bold tracking-[0.14em] text-slate-600 uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-200">{value}</p>
    </div>
  );
}
