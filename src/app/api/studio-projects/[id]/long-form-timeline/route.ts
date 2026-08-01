import { apiError } from "@/lib/errors";
import {
  getLongFormTimelineState,
  initializeLongFormTimeline,
  rebalanceSavedLongFormTimeline,
  saveLongFormTimeline,
} from "@/lib/long-form-timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      timeline: await getLongFormTimelineState(id),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json(
      { timeline: await initializeLongFormTimeline(id) },
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
      timeline: await saveLongFormTimeline(id, await request.json()),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json(
      await rebalanceSavedLongFormTimeline(id, await request.json()),
    );
  } catch (error) {
    return apiError(error);
  }
}
