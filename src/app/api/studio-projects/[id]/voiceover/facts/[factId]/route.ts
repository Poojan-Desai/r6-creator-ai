import { apiError } from "@/lib/errors";
import { updateVoiceoverFact } from "@/lib/voiceover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; factId: string }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id, factId } = await params;
    return Response.json({
      voiceover: await updateVoiceoverFact(
        id,
        factId,
        await request.json().catch(() => ({})),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
