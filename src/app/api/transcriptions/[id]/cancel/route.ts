import { apiError } from "@/lib/errors";
import {
  cancelTranscriptionJob,
  serializeTranscriptionJob,
} from "@/lib/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const job = await cancelTranscriptionJob(id);
    return Response.json({ job: serializeTranscriptionJob(job) });
  } catch (error) {
    return apiError(error);
  }
}
