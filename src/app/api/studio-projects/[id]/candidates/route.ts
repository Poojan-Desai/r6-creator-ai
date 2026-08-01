import { z } from "zod";

import { apiError } from "@/lib/errors";
import {
  generateStudioCandidates,
  getStudioCandidateState,
} from "@/lib/short-form-candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const generateSchema = z
  .object({
    analysisJobId: z.string().trim().min(1).max(191).optional(),
  })
  .strict();

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    return Response.json({
      candidateState: await getStudioCandidateState(id),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const payload = generateSchema.parse(await request.json());
    return Response.json(
      {
        candidateState: await generateStudioCandidates(
          id,
          payload.analysisJobId,
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
