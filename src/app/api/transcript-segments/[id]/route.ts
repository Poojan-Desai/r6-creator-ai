import { z } from "zod";

import { db } from "@/lib/db";
import { apiError } from "@/lib/errors";
import { serializeTranscriptSegment } from "@/lib/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const editSchema = z.object({
  text: z.string().max(5_000),
});

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const body = editSchema.parse(await request.json());
    const existing = await db.transcriptSegment.findUnique({
      where: { id },
      include: { job: { select: { status: true } } },
    });
    if (!existing || existing.job.status !== "COMPLETED") {
      return Response.json(
        {
          error: {
            code: "TRANSCRIPT_NOT_EDITABLE",
            message: "That completed transcript line could not be found.",
          },
        },
        { status: 404 },
      );
    }
    const segment = await db.transcriptSegment.update({
      where: { id },
      data: { text: body.text.trim() },
    });
    return Response.json({ segment: serializeTranscriptSegment(segment) });
  } catch (error) {
    return apiError(error);
  }
}
