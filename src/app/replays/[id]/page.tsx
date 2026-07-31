import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { ReplayDetailClient } from "@/components/replay-detail-client";
import { findReplayPackage } from "@/lib/replays/service";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ReplayDetailPage({ params }: Props) {
  const { id } = await params;
  const replay = await findReplayPackage(id);
  if (!replay) notFound();
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-10">
        <ReplayDetailClient initialReplay={replay} />
      </div>
    </main>
  );
}
