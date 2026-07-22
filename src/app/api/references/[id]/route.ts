import { rm } from "node:fs/promises";

import { db } from "@/lib/db";
import {
  referenceAnalysisDirectory,
  referenceVideoDirectory,
} from "@/lib/data-paths";
import { apiError, AppError } from "@/lib/errors";
import { reconcileInterruptedReferenceAnalyses } from "@/lib/reference-analysis";
import { findReferenceDetailDto } from "@/lib/reference-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    await reconcileInterruptedReferenceAnalyses();
    const { id } = await params;
    const reference = await findReferenceDetailDto(id);
    if (!reference) {
      throw new AppError(
        "That reference no longer exists.",
        404,
        "REFERENCE_NOT_FOUND",
      );
    }
    return Response.json({ reference });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const reference = await db.referenceVideo.findUnique({
      where: { id },
      select: {
        id: true,
        referenceType: true,
        styleAnalyses: { select: { id: true } },
      },
    });
    if (!reference) {
      throw new AppError(
        "That reference no longer exists.",
        404,
        "REFERENCE_NOT_FOUND",
      );
    }

    await db.referenceVideo.delete({ where: { id } });
    await Promise.all([
      rm(referenceVideoDirectory(id), { recursive: true, force: true }).catch(
        () => undefined,
      ),
      ...reference.styleAnalyses.map((analysis) =>
        rm(referenceAnalysisDirectory(analysis.id), {
          recursive: true,
          force: true,
        }).catch(() => undefined),
      ),
    ]);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
