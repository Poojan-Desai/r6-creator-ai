import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import {
  referenceFeatureUpdateSchema,
  serializeReferenceFeature,
} from "@/lib/reference-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const input = referenceFeatureUpdateSchema.parse(await request.json());
    const existing = await db.referenceStyleFeature.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new AppError(
        "That style feature no longer exists.",
        404,
        "FEATURE_NOT_FOUND",
      );
    }
    const feature = await db.referenceStyleFeature.update({
      where: { id },
      data: {
        valueJson: JSON.stringify(input.value),
        confidence: 1,
        source: "MANUAL",
        evidence: input.correctionNote
          ? `Manually corrected: ${input.correctionNote}`
          : "Manually corrected by the user.",
        manuallyCorrected: true,
        correctionNote: input.correctionNote || null,
      },
    });
    return Response.json({ feature: serializeReferenceFeature(feature) });
  } catch (error) {
    return apiError(error);
  }
}
