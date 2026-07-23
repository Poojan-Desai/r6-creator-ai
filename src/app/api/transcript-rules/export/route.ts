import { apiError } from "@/lib/errors";
import { exportTranscriptRules } from "@/lib/transcript-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return new Response(
      JSON.stringify(await exportTranscriptRules(), null, 2),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition":
            'attachment; filename="r6-transcript-rules-v1.json"',
          "cache-control": "no-store",
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
