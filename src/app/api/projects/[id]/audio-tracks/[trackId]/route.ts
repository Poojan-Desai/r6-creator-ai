import { z } from "zod";

import { apiError } from "@/lib/errors";
import { updateAudioTrackRole } from "@/lib/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z
  .object({
    analysisRole: z
      .enum(["CREATOR_MICROPHONE", "GAME_AUDIO", "MIXED_AUDIO", "UNKNOWN"])
      .nullable(),
  })
  .strict();

type Context = {
  params: Promise<{ id: string; trackId: string }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id, trackId } = await params;
    const input = updateSchema.parse(await request.json());
    return Response.json({
      track: await updateAudioTrackRole({
        projectId: id,
        audioTrackId: trackId,
        analysisRole: input.analysisRole,
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}
