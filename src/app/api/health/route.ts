import { db } from "@/lib/db";
import { ensureDataDirectories } from "@/lib/data-paths";
import { getTranscriptionHealth } from "@/lib/transcription";
import { getVideoToolHealth } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tools = await getVideoToolHealth();
  const transcription = getTranscriptionHealth();
  let database = false;

  try {
    await ensureDataDirectories();
    await db.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }

  const ready =
    tools.ffmpeg && tools.ffprobe && database && transcription.ready;
  return Response.json(
    {
      ready,
      checks: {
        database,
        ...tools,
        whisperEngine: transcription.engineReady,
        whisperModel: transcription.modelReady,
      },
      message: ready
        ? "Local video, speech, and project storage are ready."
        : "Local setup is incomplete. Run the setup steps in README.md.",
    },
    { status: ready ? 200 : 503 },
  );
}
