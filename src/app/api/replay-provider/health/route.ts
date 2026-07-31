import { apiError } from "@/lib/errors";
import { r6DissectReplayProvider } from "@/lib/replays/providers/r6-dissect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const readiness = await r6DissectReplayProvider.inspectReadiness();
    return Response.json({
      provider: {
        id: r6DissectReplayProvider.id,
        name: r6DissectReplayProvider.displayName,
        version: r6DissectReplayProvider.version,
        sourceCommit: r6DissectReplayProvider.sourceCommit,
        license: r6DissectReplayProvider.license,
        supportedReplayVersions:
          r6DissectReplayProvider.supportedReplayVersions,
        ...readiness,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
