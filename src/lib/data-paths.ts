import { mkdir } from "node:fs/promises";
import path from "node:path";

import { appConfig } from "@/lib/config";

export const dataPaths = {
  root: appConfig.dataRoot,
  database: path.join(appConfig.dataRoot, "r6-creator.db"),
  uploads: path.join(appConfig.dataRoot, "uploads"),
  clips: path.join(appConfig.dataRoot, "clips"),
  references: path.join(appConfig.dataRoot, "references"),
  referenceAnalysisTemp: path.join(
    appConfig.dataRoot,
    "reference-analysis-temp",
  ),
  detectorArtifacts: path.join(appConfig.dataRoot, "detector-artifacts"),
  models: path.join(appConfig.dataRoot, "models"),
  transcriptionTemp: path.join(appConfig.dataRoot, "transcription-temp"),
};

export async function ensureDataDirectories() {
  await Promise.all([
    mkdir(dataPaths.root, { recursive: true }),
    mkdir(dataPaths.uploads, { recursive: true }),
    mkdir(dataPaths.clips, { recursive: true }),
    mkdir(dataPaths.references, { recursive: true }),
    mkdir(dataPaths.referenceAnalysisTemp, { recursive: true }),
    mkdir(dataPaths.detectorArtifacts, { recursive: true }),
    mkdir(dataPaths.models, { recursive: true }),
    mkdir(dataPaths.transcriptionTemp, { recursive: true }),
  ]);
}

export function resolveDataPath(relativePath: string) {
  const resolved = path.resolve(dataPaths.root, relativePath);
  const relative = path.relative(dataPaths.root, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      "The requested file is outside the application data folder.",
    );
  }

  return resolved;
}

export function toDataRelativePath(absolutePath: string) {
  const resolved = path.resolve(absolutePath);
  const relative = path.relative(dataPaths.root, resolved);

  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("The file is outside the application data folder.");
  }

  return relative;
}

export function projectUploadDirectory(projectId: string) {
  return path.join(dataPaths.uploads, projectId);
}

export function projectClipDirectory(projectId: string) {
  return path.join(dataPaths.clips, projectId);
}

export function referenceVideoDirectory(referenceId: string) {
  return path.join(dataPaths.references, referenceId);
}

export function referenceAnalysisDirectory(analysisId: string) {
  return path.join(dataPaths.referenceAnalysisTemp, analysisId);
}
