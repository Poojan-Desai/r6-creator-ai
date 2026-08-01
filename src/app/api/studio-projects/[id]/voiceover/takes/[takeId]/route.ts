import { apiError } from "@/lib/errors";
import { deleteVoiceoverTake, updateVoiceoverTake } from "@/lib/voiceover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ id: string; takeId: string }>;
};

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id, takeId } = await params;
    return Response.json({
      voiceover: await updateVoiceoverTake(
        id,
        takeId,
        await request.json().catch(() => ({})),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id, takeId } = await params;
    return Response.json({
      voiceover: await deleteVoiceoverTake(id, takeId),
    });
  } catch (error) {
    return apiError(error);
  }
}
