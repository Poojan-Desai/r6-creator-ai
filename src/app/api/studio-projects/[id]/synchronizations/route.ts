import { z } from "zod";

import { apiError } from "@/lib/errors";
import {
  createSynchronizationDraft,
  getSynchronizationWorkspace,
} from "@/lib/replay-video-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const createSchema = z
  .object({
    basedOnVersionId: z.string().trim().min(1).max(191).nullable().optional(),
  })
  .strict();

export async function GET(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const versionValue = new URL(request.url).searchParams.get("version");
    const version = versionValue ? Number(versionValue) : null;
    return Response.json({
      workspace: await getSynchronizationWorkspace(
        id,
        Number.isInteger(version) && (version ?? 0) > 0 ? version : null,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const input = createSchema.parse(await request.json());
    const synchronization = await createSynchronizationDraft(
      id,
      input.basedOnVersionId,
    );
    return Response.json({ synchronization }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
