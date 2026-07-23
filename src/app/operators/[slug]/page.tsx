import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { OperatorDetailClient } from "@/components/operator-detail-client";
import { AppError } from "@/lib/errors";
import {
  getOperatorDetail,
  getOperatorEditorOptions,
} from "@/lib/operator-knowledge/service";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const operator = await getOperatorDetail(slug);
    return { title: `${operator.displayName} Operator Knowledge` };
  } catch {
    return { title: "Operator not found" };
  }
}

export default async function OperatorPage({ params }: Props) {
  const { slug } = await params;
  let pageData;
  try {
    pageData = await Promise.all([
      getOperatorDetail(slug),
      getOperatorEditorOptions(),
    ]);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }

  const [operator, options] = pageData;
  return (
    <main className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-7 lg:px-10 lg:py-14">
        <Link href="/operators" className="secondary-button">
          <ArrowLeft aria-hidden="true" size={15} /> Operator library
        </Link>
        <p className="section-kicker mt-8">Versioned operator record</p>
        <h1 className="font-display mt-2 text-5xl font-extrabold tracking-tight text-white uppercase sm:text-6xl">
          {operator.displayName}
        </h1>
        <OperatorDetailClient initialOperator={operator} options={options} />
      </div>
    </main>
  );
}
