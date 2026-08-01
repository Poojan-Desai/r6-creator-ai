import { apiError } from "@/lib/errors";
import { updateVoiceoverCaption } from "@/lib/voiceover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; captionId: string }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id, captionId } = await params;
    return Response.json({
      voiceover: await updateVoiceoverCaption(
        id,
        captionId,
        await request.json().catch(() => ({})),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
