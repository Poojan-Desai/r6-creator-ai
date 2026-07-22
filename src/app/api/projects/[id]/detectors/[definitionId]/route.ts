import { z } from "zod";

import { updateDetectorConfiguration } from "@/lib/detector-framework";
import { apiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z
  .object({
    enabled: z.boolean(),
    parameters: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

type Context = {
  params: Promise<{ id: string; definitionId: string }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id, definitionId } = await params;
    const input = updateSchema.parse(await request.json());
    return Response.json({
      analysis: await updateDetectorConfiguration(id, definitionId, input),
    });
  } catch (error) {
    return apiError(error);
  }
}
