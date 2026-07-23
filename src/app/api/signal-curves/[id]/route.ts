import { z } from "zod";

import { apiError } from "@/lib/errors";
import { getSignalCurveData, removeSignalCurve } from "@/lib/signal-explorer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  startSeconds: z.coerce.number().finite().nonnegative().optional(),
  endSeconds: z.coerce.number().finite().nonnegative().optional(),
  maxPoints: z.coerce.number().int().min(1).max(10_000).default(2_000),
});

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const query = querySchema.parse({
      startSeconds: url.searchParams.get("startSeconds") ?? undefined,
      endSeconds: url.searchParams.get("endSeconds") ?? undefined,
      maxPoints: url.searchParams.get("maxPoints") ?? undefined,
    });
    return Response.json({ curve: await getSignalCurveData(id, query) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json(await removeSignalCurve(id));
  } catch (error) {
    return apiError(error);
  }
}
