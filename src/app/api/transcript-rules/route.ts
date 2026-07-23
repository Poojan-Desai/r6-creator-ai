import { apiError } from "@/lib/errors";
import { listTranscriptRules } from "@/lib/transcript-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ rules: await listTranscriptRules() });
  } catch (error) {
    return apiError(error);
  }
}
