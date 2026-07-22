import { db } from "@/lib/db";
import { apiError } from "@/lib/errors";
import {
  createStyleProfile,
  serializeStyleProfile,
} from "@/lib/style-profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profiles = await db.creatorStyleProfile.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        referenceLinks: {
          include: { reference: true },
          orderBy: { createdAt: "asc" },
        },
        features: { orderBy: { label: "asc" } },
      },
    });
    return Response.json({ profiles: profiles.map(serializeStyleProfile) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await createStyleProfile(await request.json());
    return Response.json(
      { profile: serializeStyleProfile(profile) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
