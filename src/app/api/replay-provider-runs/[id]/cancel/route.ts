import { apiError } from "@/lib/errors";
import { cancelReplayParseJob } from "@/lib/replays/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    await cancelReplayParseJob(id);
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
