import { z } from "zod";

import { apiError } from "@/lib/errors";
import {
  duplicateTranscriptRule,
  setTranscriptRuleEnabled,
  updateTranscriptRule,
} from "@/lib/transcript-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enable"), enabled: z.boolean() }).strict(),
  z.object({ action: z.literal("duplicate") }).strict(),
  z.object({ action: z.literal("update"), rule: z.unknown() }).strict(),
]);

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const input = actionSchema.parse(await request.json());
    if (input.action === "enable") {
      return Response.json({
        rule: await setTranscriptRuleEnabled(id, input.enabled),
      });
    }
    if (input.action === "duplicate") {
      return Response.json({ rule: await duplicateTranscriptRule(id) });
    }
    return Response.json({ rule: await updateTranscriptRule(id, input.rule) });
  } catch (error) {
    return apiError(error);
  }
}
