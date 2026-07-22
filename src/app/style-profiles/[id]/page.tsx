import { notFound } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { StyleProfileEditor } from "@/components/style-profile-editor";
import { db } from "@/lib/db";
import { findStyleProfile, serializeStyleProfile } from "@/lib/style-profiles";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
export default async function StyleProfilePage({ params }: Props) {
  const { id } = await params;
  const [profile, availableReferences] = await Promise.all([
    findStyleProfile(id),
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
  if (!profile) notFound();
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-7 lg:px-10 lg:py-10">
        <StyleProfileEditor
          initialProfile={serializeStyleProfile(profile)}
          availableReferences={availableReferences}
        />
      </div>
    </main>
  );
}
