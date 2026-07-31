import { z } from "zod";

import { apiError, AppError } from "@/lib/errors";
import {
  deleteRoundAdjustment,
  deleteSynchronizationDraft,
  discoverSynchronizationOffsetCandidates,
  findSynchronization,
  updateSynchronizationNotes,
  upsertRoundAdjustment,
  verifySynchronization,
} from "@/lib/replay-video-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; synchronizationId: string }>;
};

const actionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("update_notes"),
      notes: z.string().trim().max(5_000).nullable(),
    })
    .strict(),
  z.object({ action: z.literal("verify") }).strict(),
  z.object({ action: z.literal("discover_offsets") }).strict(),
  z
    .object({
      action: z.literal("upsert_round_adjustment"),
      replayRoundIndex: z.coerce.number().int().min(1).max(100),
      adjustmentSeconds: z.coerce.number().finite().min(-600).max(600),
      reason: z.string().trim().max(1_000).nullable(),
      confidence: z.coerce.number().finite().min(0).max(1),
      userConfirmed: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("delete_round_adjustment"),
      replayRoundIndex: z.coerce.number().int().min(1).max(100),
    })
    .strict(),
]);

export async function GET(_request: Request, context: Context) {
  try {
    const { id, synchronizationId } = await context.params;
    const synchronization = await findSynchronization(id, synchronizationId);
    if (!synchronization) {
      throw new AppError(
        "That synchronization version no longer exists in this project.",
        404,
        "SYNCHRONIZATION_NOT_FOUND",
      );
    }
    return Response.json({ synchronization });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id, synchronizationId } = await context.params;
    const input = actionSchema.parse(await request.json());
    if (input.action === "update_notes") {
      return Response.json({
        synchronization: await updateSynchronizationNotes(
          id,
          synchronizationId,
          { notes: input.notes },
        ),
      });
    }
    if (input.action === "verify") {
      return Response.json({
        synchronization: await verifySynchronization(id, synchronizationId),
      });
    }
    if (input.action === "discover_offsets") {
      return Response.json(
        await discoverSynchronizationOffsetCandidates(id, synchronizationId),
      );
    }
    if (input.action === "upsert_round_adjustment") {
      return Response.json({
        synchronization: await upsertRoundAdjustment(id, synchronizationId, {
          replayRoundIndex: input.replayRoundIndex,
          adjustmentSeconds: input.adjustmentSeconds,
          reason: input.reason,
          confidence: input.confidence,
          userConfirmed: input.userConfirmed,
        }),
      });
    }
    return Response.json({
      synchronization: await deleteRoundAdjustment(
        id,
        synchronizationId,
        input.replayRoundIndex,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id, synchronizationId } = await context.params;
    await deleteSynchronizationDraft(id, synchronizationId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
