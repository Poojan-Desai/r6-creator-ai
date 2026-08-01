import { apiError } from "@/lib/errors";
import {
  generateVoiceoverScript,
  getVoiceoverState,
  saveVoiceoverRevision,
} from "@/lib/voiceover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({ voiceover: await getVoiceoverState(id) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json(
      {
        voiceover: await generateVoiceoverScript(
          id,
          await request.json().catch(() => ({})),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      voiceover: await saveVoiceoverRevision(
        id,
        await request.json().catch(() => ({})),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
