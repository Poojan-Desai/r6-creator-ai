import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { ReferenceDetailClient } from "@/components/reference-detail-client";
import { reconcileInterruptedReferenceAnalyses } from "@/lib/reference-analysis";
import { findReferenceDetailDto } from "@/lib/reference-library";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ReferenceDetailPage({ params }: Props) {
  const { id } = await params;
  await reconcileInterruptedReferenceAnalyses();
  const reference = await findReferenceDetailDto(id);
  if (!reference) notFound();
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-10">
        <ReferenceDetailClient initialReference={reference} />
      </div>
    </main>
  );
}
