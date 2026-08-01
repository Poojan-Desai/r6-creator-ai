import { apiError } from "@/lib/errors";
import {
  generateLongFormProduction,
  getLongFormProductionState,
} from "@/lib/long-form-productions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      productionState: await getLongFormProductionState(id),
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
        productionState: await generateLongFormProduction(
          id,
          await request.json(),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
