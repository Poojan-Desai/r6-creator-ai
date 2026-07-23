-- CreateTable
CREATE TABLE "SignalCurve" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "detectorRunId" TEXT NOT NULL,
    "audioTrackId" TEXT,
    "stableId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "sourceSignal" TEXT NOT NULL,
    "sourceTrackRole" TEXT,
    "sourceStreamIndex" INTEGER,
    "sampleIntervalSeconds" REAL NOT NULL,
    "aggregation" TEXT NOT NULL,
    "configurationJson" TEXT NOT NULL DEFAULT '{}',
    "statisticsJson" TEXT NOT NULL DEFAULT '{}',
    "rawPointCount" INTEGER NOT NULL,
    "storedPointCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SignalCurve_detectorRunId_fkey" FOREIGN KEY ("detectorRunId") REFERENCES "DetectorRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SignalCurve_audioTrackId_fkey" FOREIGN KEY ("audioTrackId") REFERENCES "AudioTrack" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignalCurveChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "signalCurveId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "startSeconds" REAL NOT NULL,
    "endSeconds" REAL NOT NULL,
    "pointCount" INTEGER NOT NULL,
    "encoding" TEXT NOT NULL DEFAULT 'gzip-json-v1',
    "payload" BLOB NOT NULL,
    "rawSizeBytes" INTEGER NOT NULL,
    "compressedSizeBytes" INTEGER NOT NULL,
    "minimumNormalizedValue" REAL,
    "maximumNormalizedValue" REAL,
    "maximumAbsoluteDeviation" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SignalCurveChunk_signalCurveId_fkey" FOREIGN KEY ("signalCurveId") REFERENCES "SignalCurve" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignalExplorerPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "visibleTracksJson" TEXT NOT NULL DEFAULT '[]',
    "hiddenDetectorsJson" TEXT NOT NULL DEFAULT '[]',
    "minimumConfidence" REAL NOT NULL DEFAULT 0,
    "zoomStartSeconds" REAL,
    "zoomEndSeconds" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SignalExplorerPreference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DetectorRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisJobId" TEXT NOT NULL,
    "detectorDefinitionId" TEXT NOT NULL,
    "detectorStableId" TEXT NOT NULL,
    "detectorVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'Waiting',
    "requiredInputsJson" TEXT NOT NULL DEFAULT '[]',
    "parametersJson" TEXT NOT NULL DEFAULT '{}',
    "processingDurationMs" INTEGER,
    "videoDurationSeconds" REAL,
    "processedSourceSeconds" REAL,
    "processingSpeedRatio" REAL,
    "peakMemoryBytes" BIGINT,
    "averageCpuPercent" REAL,
    "temporaryDiskUsageBytes" BIGINT NOT NULL DEFAULT 0,
    "permanentDataBytes" BIGINT NOT NULL DEFAULT 0,
    "rawMeasurementCount" INTEGER NOT NULL DEFAULT 0,
    "aggregatedMeasurementCount" INTEGER NOT NULL DEFAULT 0,
    "generatedEventCount" INTEGER NOT NULL DEFAULT 0,
    "curveChunkCount" INTEGER NOT NULL DEFAULT 0,
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelRequestedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DetectorRun_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "AnalysisJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DetectorRun_detectorDefinitionId_fkey" FOREIGN KEY ("detectorDefinitionId") REFERENCES "DetectorDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DetectorRun" ("analysisJobId", "cancelRequestedAt", "completedAt", "createdAt", "detectorDefinitionId", "detectorStableId", "detectorVersion", "errorMessage", "id", "parametersJson", "processingDurationMs", "progress", "requiredInputsJson", "stage", "startedAt", "status", "updatedAt", "warningsJson") SELECT "analysisJobId", "cancelRequestedAt", "completedAt", "createdAt", "detectorDefinitionId", "detectorStableId", "detectorVersion", "errorMessage", "id", "parametersJson", "processingDurationMs", "progress", "requiredInputsJson", "stage", "startedAt", "status", "updatedAt", "warningsJson" FROM "DetectorRun";
DROP TABLE "DetectorRun";
ALTER TABLE "new_DetectorRun" RENAME TO "DetectorRun";
CREATE INDEX "DetectorRun_analysisJobId_createdAt_idx" ON "DetectorRun"("analysisJobId", "createdAt");
CREATE INDEX "DetectorRun_detectorStableId_detectorVersion_idx" ON "DetectorRun"("detectorStableId", "detectorVersion");
CREATE INDEX "DetectorRun_status_idx" ON "DetectorRun"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SignalCurve_detectorRunId_kind_idx" ON "SignalCurve"("detectorRunId", "kind");

-- CreateIndex
CREATE INDEX "SignalCurve_audioTrackId_idx" ON "SignalCurve"("audioTrackId");

-- CreateIndex
CREATE UNIQUE INDEX "SignalCurve_detectorRunId_stableId_key" ON "SignalCurve"("detectorRunId", "stableId");

-- CreateIndex
CREATE INDEX "SignalCurveChunk_signalCurveId_startSeconds_endSeconds_idx" ON "SignalCurveChunk"("signalCurveId", "startSeconds", "endSeconds");

-- CreateIndex
CREATE UNIQUE INDEX "SignalCurveChunk_signalCurveId_chunkIndex_key" ON "SignalCurveChunk"("signalCurveId", "chunkIndex");

-- CreateIndex
CREATE UNIQUE INDEX "SignalExplorerPreference_projectId_key" ON "SignalExplorerPreference"("projectId");
