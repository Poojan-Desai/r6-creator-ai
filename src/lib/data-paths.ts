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
  detectorAnalysisTemp: path.join(appConfig.dataRoot, "detector-analysis-temp"),
  detectorArtifacts: path.join(appConfig.dataRoot, "detector-artifacts"),
  mapKnowledge: path.join(appConfig.dataRoot, "map-knowledge"),
  mapBlueprintTemp: path.join(appConfig.dataRoot, "map-blueprint-temp"),
  replays: path.join(appConfig.dataRoot, "replays"),
  replayImportTemp: path.join(appConfig.dataRoot, "replay-import-temp"),
  replayParserOutputs: path.join(appConfig.dataRoot, "replay-parser-outputs"),
  replayTools: path.join(appConfig.dataRoot, "tools", "replay-parsers"),
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
    mkdir(dataPaths.detectorAnalysisTemp, { recursive: true }),
    mkdir(dataPaths.detectorArtifacts, { recursive: true }),
    mkdir(dataPaths.mapKnowledge, { recursive: true }),
    mkdir(dataPaths.mapBlueprintTemp, { recursive: true }),
    mkdir(dataPaths.replays, { recursive: true }),
    mkdir(dataPaths.replayImportTemp, { recursive: true }),
    mkdir(dataPaths.replayParserOutputs, { recursive: true }),
    mkdir(dataPaths.replayTools, { recursive: true }),
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

export function detectorAnalysisDirectory(analysisId: string) {
  return path.join(dataPaths.detectorAnalysisTemp, analysisId);
}

export function detectorArtifactDirectory(analysisId: string) {
  return path.join(dataPaths.detectorArtifacts, analysisId);
}

export function mapVersionAssetDirectory(mapVersionId: string) {
  return path.join(dataPaths.mapKnowledge, mapVersionId);
}

export function mapBlueprintImportDirectory(importId: string) {
  return path.join(dataPaths.mapBlueprintTemp, importId);
}

export function replayPackageDirectory(replayPackageId: string) {
  return path.join(dataPaths.replays, replayPackageId);
}

export function replayImportDirectory(importId: string) {
  return path.join(dataPaths.replayImportTemp, importId);
}

export function replayProviderOutputDirectory(providerRunId: string) {
  return path.join(dataPaths.replayParserOutputs, providerRunId);
}
