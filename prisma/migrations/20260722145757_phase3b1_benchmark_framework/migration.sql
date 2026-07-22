-- AlterTable
ALTER TABLE "Project" ADD COLUMN "fingerprintComputedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "videoFingerprintSha256" TEXT;

-- CreateTable
CREATE TABLE "GroundTruthLabel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "startSeconds" REAL NOT NULL,
    "peakSeconds" REAL NOT NULL,
    "endSeconds" REAL NOT NULL,
    "description" TEXT,
    "humanConfidence" REAL NOT NULL DEFAULT 1,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GroundTruthLabel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BenchmarkDataset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schemaVersion" TEXT NOT NULL DEFAULT 'r6-benchmark-dataset/v1',
    "split" TEXT NOT NULL DEFAULT 'DEVELOPMENT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BenchmarkDatasetProject" (
    "datasetId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "videoFingerprint" TEXT NOT NULL,
    "durationSeconds" REAL NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "recordingType" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    "labelSchemaVersion" TEXT NOT NULL DEFAULT 'r6-creator-benchmark-labels/v1',
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("datasetId", "projectId"),
    CONSTRAINT "BenchmarkDatasetProject_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "BenchmarkDataset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BenchmarkDatasetProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BenchmarkRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetId" TEXT NOT NULL,
    "analysisJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "matchingRuleVersion" TEXT NOT NULL DEFAULT 'temporal-category-v1',
    "detectorSetVersion" TEXT NOT NULL,
    "reportJson" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BenchmarkRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "BenchmarkDataset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BenchmarkRun_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "AnalysisJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BenchmarkMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "benchmarkRunId" TEXT NOT NULL,
    "category" TEXT,
    "sampleCount" INTEGER NOT NULL,
    "truePositives" INTEGER NOT NULL,
    "falsePositives" INTEGER NOT NULL,
    "falseNegatives" INTEGER NOT NULL,
    "precision" REAL,
    "recall" REAL,
    "f1" REAL,
    "medianPeakError" REAL,
    "medianStartError" REAL,
    "medianEndError" REAL,
    "insufficientExamples" BOOLEAN NOT NULL DEFAULT true,
    "extraMetricsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BenchmarkMetric_benchmarkRunId_fkey" FOREIGN KEY ("benchmarkRunId") REFERENCES "BenchmarkRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DetectorDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiredInputsJson" TEXT NOT NULL DEFAULT '[]',
    "parameterSchemaJson" TEXT NOT NULL DEFAULT '{}',
    "estimatedCost" TEXT NOT NULL DEFAULT 'LOW',
    "implementationState" TEXT NOT NULL DEFAULT 'ACTIVE',
    "enabledByDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DetectorConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "detectorDefinitionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "parametersJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DetectorConfiguration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DetectorConfiguration_detectorDefinitionId_fkey" FOREIGN KEY ("detectorDefinitionId") REFERENCES "DetectorDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalysisJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "calibrationProfileId" TEXT,
    "styleProfileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'Waiting to start',
    "analysisVersion" TEXT NOT NULL DEFAULT 'phase3b-framework-v1',
    "detectorSetVersion" TEXT NOT NULL,
    "currentDetectorStableId" TEXT,
    "enabledDetectorCount" INTEGER NOT NULL DEFAULT 0,
    "completedDetectorCount" INTEGER NOT NULL DEFAULT 0,
    "failedDetectorCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedWorkUnits" INTEGER NOT NULL DEFAULT 0,
    "temporaryDiskUsageBytes" BIGINT NOT NULL DEFAULT 0,
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelRequestedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnalysisJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnalysisJob_calibrationProfileId_fkey" FOREIGN KEY ("calibrationProfileId") REFERENCES "HudCalibrationProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AnalysisJob_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "CreatorStyleProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DetectorRun" (
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

-- CreateTable
CREATE TABLE "DetectorEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "detectorRunId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "startSeconds" REAL NOT NULL,
    "peakSeconds" REAL NOT NULL,
    "endSeconds" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "supportingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "conflictingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "sourceSignal" TEXT NOT NULL,
    "rawMeasurementsJson" TEXT NOT NULL DEFAULT '{}',
    "thresholdsJson" TEXT NOT NULL DEFAULT '{}',
    "debugArtifactsJson" TEXT NOT NULL DEFAULT '[]',
    "processingDurationMs" INTEGER NOT NULL,
    "warningMessagesJson" TEXT NOT NULL DEFAULT '[]',
    "humanReviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DetectorEvent_detectorRunId_fkey" FOREIGN KEY ("detectorRunId") REFERENCES "DetectorRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DetectorEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "detectorEventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceSignal" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "timestampSeconds" REAL,
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    "artifactRelativePath" TEXT,
    "containsPersonalData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DetectorEvidence_detectorEventId_fkey" FOREIGN KEY ("detectorEventId") REFERENCES "DetectorEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HudCalibrationProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "game" TEXT NOT NULL DEFAULT 'Rainbow Six Siege',
    "baseWidth" INTEGER NOT NULL,
    "baseHeight" INTEGER NOT NULL,
    "profileVersion" TEXT NOT NULL DEFAULT 'hud-calibration-v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HudCalibrationProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HudRegion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "calibrationProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionKind" TEXT NOT NULL,
    "normalizedX" REAL NOT NULL,
    "normalizedY" REAL NOT NULL,
    "normalizedWidth" REAL NOT NULL,
    "normalizedHeight" REAL NOT NULL,
    "preprocessingJson" TEXT NOT NULL DEFAULT '{}',
    "thresholdsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HudRegion_calibrationProfileId_fkey" FOREIGN KEY ("calibrationProfileId") REFERENCES "HudCalibrationProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OcrRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "hudRegionId" TEXT NOT NULL,
    "timestampSeconds" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "engineId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "preprocessingJson" TEXT NOT NULL DEFAULT '{}',
    "redactedText" TEXT,
    "confidence" REAL,
    "measurementsJson" TEXT NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "OcrRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OcrRun_hudRegionId_fkey" FOREIGN KEY ("hudRegionId") REFERENCES "HudRegion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CandidateMoment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "analysisJobId" TEXT NOT NULL,
    "styleProfileId" TEXT,
    "category" TEXT NOT NULL,
    "alternativeCategoriesJson" TEXT NOT NULL DEFAULT '[]',
    "startSeconds" REAL NOT NULL,
    "peakSeconds" REAL NOT NULL,
    "endSeconds" REAL NOT NULL,
    "eventConfidence" REAL NOT NULL,
    "contentPotentialScore" REAL NOT NULL,
    "styleSimilarity" REAL,
    "scoreBreakdownJson" TEXT NOT NULL DEFAULT '{}',
    "explanation" TEXT NOT NULL,
    "missingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "detectorVersionsJson" TEXT NOT NULL DEFAULT '{}',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CandidateMoment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CandidateMoment_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "AnalysisJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CandidateMoment_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "CreatorStyleProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CandidateDetectorEvent" (
    "candidateId" TEXT NOT NULL,
    "detectorEventId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'SUPPORTING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("candidateId", "detectorEventId"),
    CONSTRAINT "CandidateDetectorEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateMoment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CandidateDetectorEvent_detectorEventId_fkey" FOREIGN KEY ("detectorEventId") REFERENCES "DetectorEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CandidateReviewLabel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "correctedStartSeconds" REAL,
    "correctedEndSeconds" REAL,
    "correctedCategory" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CandidateReviewLabel_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "CandidateMoment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelemetryImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "recordingStartTime" DATETIME,
    "clockSource" TEXT NOT NULL,
    "synchronizationOffset" REAL NOT NULL DEFAULT 0,
    "eventSource" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TelemetryImport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelemetryEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "telemetryImportId" TEXT NOT NULL,
    "timestampSeconds" REAL NOT NULL,
    "normalizedCategory" TEXT NOT NULL,
    "rawPayloadJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelemetryEvent_telemetryImportId_fkey" FOREIGN KEY ("telemetryImportId") REFERENCES "TelemetryImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GroundTruthLabel_projectId_startSeconds_idx" ON "GroundTruthLabel"("projectId", "startSeconds");

-- CreateIndex
CREATE INDEX "GroundTruthLabel_projectId_category_approved_idx" ON "GroundTruthLabel"("projectId", "category", "approved");

-- CreateIndex
CREATE INDEX "BenchmarkDataset_split_createdAt_idx" ON "BenchmarkDataset"("split", "createdAt");

-- CreateIndex
CREATE INDEX "BenchmarkDatasetProject_projectId_idx" ON "BenchmarkDatasetProject"("projectId");

-- CreateIndex
CREATE INDEX "BenchmarkRun_datasetId_createdAt_idx" ON "BenchmarkRun"("datasetId", "createdAt");

-- CreateIndex
CREATE INDEX "BenchmarkRun_status_idx" ON "BenchmarkRun"("status");

-- CreateIndex
CREATE INDEX "BenchmarkMetric_benchmarkRunId_category_idx" ON "BenchmarkMetric"("benchmarkRunId", "category");

-- CreateIndex
CREATE INDEX "DetectorDefinition_stableId_idx" ON "DetectorDefinition"("stableId");

-- CreateIndex
CREATE UNIQUE INDEX "DetectorDefinition_stableId_version_key" ON "DetectorDefinition"("stableId", "version");

-- CreateIndex
CREATE INDEX "DetectorConfiguration_projectId_enabled_idx" ON "DetectorConfiguration"("projectId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "DetectorConfiguration_projectId_detectorDefinitionId_key" ON "DetectorConfiguration"("projectId", "detectorDefinitionId");

-- CreateIndex
CREATE INDEX "AnalysisJob_projectId_createdAt_idx" ON "AnalysisJob"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisJob_status_idx" ON "AnalysisJob"("status");

-- CreateIndex
CREATE INDEX "DetectorRun_analysisJobId_createdAt_idx" ON "DetectorRun"("analysisJobId", "createdAt");

-- CreateIndex
CREATE INDEX "DetectorRun_detectorStableId_detectorVersion_idx" ON "DetectorRun"("detectorStableId", "detectorVersion");

-- CreateIndex
CREATE INDEX "DetectorRun_status_idx" ON "DetectorRun"("status");

-- CreateIndex
CREATE INDEX "DetectorEvent_detectorRunId_startSeconds_idx" ON "DetectorEvent"("detectorRunId", "startSeconds");

-- CreateIndex
CREATE INDEX "DetectorEvent_category_idx" ON "DetectorEvent"("category");

-- CreateIndex
CREATE INDEX "DetectorEvidence_detectorEventId_kind_idx" ON "DetectorEvidence"("detectorEventId", "kind");

-- CreateIndex
CREATE INDEX "HudCalibrationProfile_projectId_idx" ON "HudCalibrationProfile"("projectId");

-- CreateIndex
CREATE INDEX "HudCalibrationProfile_baseWidth_baseHeight_idx" ON "HudCalibrationProfile"("baseWidth", "baseHeight");

-- CreateIndex
CREATE INDEX "HudRegion_calibrationProfileId_regionKind_idx" ON "HudRegion"("calibrationProfileId", "regionKind");

-- CreateIndex
CREATE UNIQUE INDEX "HudRegion_calibrationProfileId_name_key" ON "HudRegion"("calibrationProfileId", "name");

-- CreateIndex
CREATE INDEX "OcrRun_projectId_timestampSeconds_idx" ON "OcrRun"("projectId", "timestampSeconds");

-- CreateIndex
CREATE INDEX "OcrRun_hudRegionId_createdAt_idx" ON "OcrRun"("hudRegionId", "createdAt");

-- CreateIndex
CREATE INDEX "CandidateMoment_projectId_startSeconds_idx" ON "CandidateMoment"("projectId", "startSeconds");

-- CreateIndex
CREATE INDEX "CandidateMoment_analysisJobId_idx" ON "CandidateMoment"("analysisJobId");

-- CreateIndex
CREATE INDEX "CandidateMoment_category_idx" ON "CandidateMoment"("category");

-- CreateIndex
CREATE INDEX "CandidateDetectorEvent_detectorEventId_idx" ON "CandidateDetectorEvent"("detectorEventId");

-- CreateIndex
CREATE INDEX "CandidateReviewLabel_candidateId_createdAt_idx" ON "CandidateReviewLabel"("candidateId", "createdAt");

-- CreateIndex
CREATE INDEX "TelemetryImport_projectId_createdAt_idx" ON "TelemetryImport"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "TelemetryEvent_telemetryImportId_timestampSeconds_idx" ON "TelemetryEvent"("telemetryImportId", "timestampSeconds");
