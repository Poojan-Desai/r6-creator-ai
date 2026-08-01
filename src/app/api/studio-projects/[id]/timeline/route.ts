import { apiError } from "@/lib/errors";
import {
  getShortFormTimelineState,
  initializeShortFormTimeline,
  saveShortFormTimeline,
} from "@/lib/short-form-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      timeline: await getShortFormTimelineState(id),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json(
      { timeline: await initializeShortFormTimeline(id) },
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
      timeline: await saveShortFormTimeline(id, await request.json()),
    });
  } catch (error) {
    return apiError(error);
  }
}
