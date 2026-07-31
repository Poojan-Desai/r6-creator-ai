import { apiError } from "@/lib/errors";
import { retryReplayParseJob } from "@/lib/replays/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const run = await retryReplayParseJob(id);
    return Response.json({ run }, { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
