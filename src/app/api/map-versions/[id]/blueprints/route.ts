import { randomUUID } from "node:crypto";

import { apiError } from "@/lib/errors";
import {
  cleanupBlueprintImport,
  importBlueprint,
  streamMultipartBlueprint,
} from "@/lib/map-knowledge/blueprints";
import { mapBlueprintImportDirectory } from "@/lib/data-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const importId = randomUUID();
  try {
    const { id } = await params;
    const upload = await streamMultipartBlueprint(
      request,
      mapBlueprintImportDirectory(importId),
    );
    const assets = await importBlueprint(id, upload);
    return Response.json(
      {
        assets: assets.map((asset) => ({
          ...asset,
          fileSizeBytes: Number(asset.fileSizeBytes),
          importedAt: asset.importedAt.toISOString(),
          lastVerifiedAt: asset.lastVerifiedAt?.toISOString() ?? null,
        })),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  } finally {
    await cleanupBlueprintImport(importId).catch(() => undefined);
  }
}
