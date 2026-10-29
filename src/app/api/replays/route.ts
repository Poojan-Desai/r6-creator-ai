import { localRequestRejection } from "@/lib/local-request-guard";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

import { ensureDataDirectories, replayImportDirectory } from "@/lib/data-paths";
import { apiError } from "@/lib/errors";
import {
  persistReplayPackage,
  streamMultipartReplayUpload,
} from "@/lib/replays/import";
import { findReplayPackage, listReplayPackages } from "@/lib/replays/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejection = localRequestRejection(request);
  if (rejection) return rejection;
  try {
    return Response.json({ replays: await listReplayPackages() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  const rejection = localRequestRejection(request);
  if (rejection) return rejection;
  const importId = randomUUID();
  const replayPackageId = randomUUID();
  const temporaryDirectory = replayImportDirectory(importId);
  try {
    await ensureDataDirectories();
    const upload = await streamMultipartReplayUpload(
      request,
      temporaryDirectory,
    );
    await persistReplayPackage(replayPackageId, upload);
    const replay = await findReplayPackage(replayPackageId);
    return Response.json({ replay }, { status: 201 });
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    );
    return apiError(error);
  }
}
