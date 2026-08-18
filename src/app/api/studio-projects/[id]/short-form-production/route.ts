import { apiError } from "@/lib/errors";
import {
  generateShortFormProduction,
  getShortFormProductionState,
  saveShortFormRevision,
} from "@/lib/short-form-productions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      productionState: await getShortFormProductionState(id),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json(
      {
        productionState: await generateShortFormProduction(
          id,
          await request.json(),
          request.signal,
        ),
      },
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
      productionState: await saveShortFormRevision(id, await request.json()),
    });
  } catch (error) {
    return apiError(error);
  }
}
