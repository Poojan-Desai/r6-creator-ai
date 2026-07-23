import { apiError } from "@/lib/errors";
import { importTranscriptRules } from "@/lib/transcript-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 1_000_000) {
      return Response.json(
        {
          error: {
            code: "RULE_IMPORT_TOO_LARGE",
            message: "Transcript rule imports must be smaller than 1 MB.",
          },
        },
        { status: 413 },
      );
    }
    return Response.json(await importTranscriptRules(await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
