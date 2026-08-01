import { apiError } from "@/lib/errors";
import { getVoiceoverState } from "@/lib/voiceover";
import { updateVoiceoverTimeline } from "@/lib/voiceover-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; takeId: string }>;
};

export async function POST(request: Request, { params }: Context) {
  try {
    const { id, takeId } = await params;
    const result = await updateVoiceoverTimeline(
      id,
      takeId,
      await request.json().catch(() => ({})),
    );
    return Response.json({
      ...result,
      voiceover: await getVoiceoverState(id),
    });
  } catch (error) {
    return apiError(error);
  }
}
