import { db } from "@/lib/db";
import { apiError, AppError } from "@/lib/errors";
import {
  findStyleProfile,
  serializeStyleProfile,
  updateStyleProfile,
} from "@/lib/style-profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const profile = await findStyleProfile(id);
    if (!profile) {
      throw new AppError(
        "That Creator Style Profile no longer exists.",
        404,
        "STYLE_PROFILE_NOT_FOUND",
      );
    }
    return Response.json({ profile: serializeStyleProfile(profile) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const profile = await updateStyleProfile(id, await request.json());
    return Response.json({ profile: serializeStyleProfile(profile) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const existing = await db.creatorStyleProfile.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError(
        "That Creator Style Profile no longer exists.",
        404,
        "STYLE_PROFILE_NOT_FOUND",
      );
    }
    await db.creatorStyleProfile.delete({ where: { id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
