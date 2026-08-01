import { apiError } from "@/lib/errors";
import { createProgressSnapshot } from "@/lib/progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ profileId: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { profileId } = await params;
    return Response.json(
      {
        progress: await createProgressSnapshot({
          ...(await request.json()),
          playerProfileId: profileId,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
