import { z } from "zod";

import { apiError } from "@/lib/errors";
import { startLongFormRenderJob } from "@/lib/long-form-renders";
import { getLongFormTimelineState } from "@/lib/long-form-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const requestSchema = z
  .object({
    kind: z.enum(["PREVIEW", "EXPORT"]),
  })
  .strict();

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const { kind } = requestSchema.parse(await request.json());
    const job = await startLongFormRenderJob(id, kind);
    return Response.json(
      {
        jobId: job.id,
        timeline: await getLongFormTimelineState(id),
      },
      { status: job.status === "COMPLETED" ? 200 : 202 },
    );
  } catch (error) {
    return apiError(error);
  }
}
