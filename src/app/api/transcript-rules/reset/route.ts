import { apiError } from "@/lib/errors";
import { resetDefaultTranscriptRules } from "@/lib/transcript-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return Response.json({ rules: await resetDefaultTranscriptRules() });
  } catch (error) {
    return apiError(error);
  }
}
