-- CreateTable
CREATE TABLE "CoachingCalibration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "videoProjectId" TEXT,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "crosshairNormalizedX" REAL NOT NULL DEFAULT 0.5,
    "crosshairNormalizedY" REAL NOT NULL DEFAULT 0.5,
    "hudScalePercent" REAL,
    "sensitivityAssumptions" TEXT,
    "aspectRatio" TEXT,
    "fovDegrees" REAL,
    "sourceWidth" INTEGER,
    "sourceHeight" INTEGER,
    "colorSettings" TEXT,
    "safeAreaNotes" TEXT,
    "overlayNotes" TEXT,
    "userConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "calibrationVersion" TEXT NOT NULL DEFAULT 'u6-coaching-calibration-v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CoachingCalibration_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoachingCalibration_videoProjectId_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoachingAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "calibrationId" TEXT,
    "synchronizationId" TEXT,
    "inputMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'Waiting to start',
    "analysisVersion" TEXT NOT NULL,
    "ruleSetVersion" TEXT NOT NULL,
    "sourceSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "detectorVersionsJson" TEXT NOT NULL DEFAULT '{}',
    "currentRuleId" TEXT,
    "completedRuleCount" INTEGER NOT NULL DEFAULT 0,
    "failedRuleCount" INTEGER NOT NULL DEFAULT 0,
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "cancelRequestedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CoachingAnalysis_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoachingAnalysis_calibrationId_fkey" FOREIGN KEY ("calibrationId") REFERENCES "CoachingCalibration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoachingFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "canonicalRoundId" TEXT,
    "canonicalEventId" TEXT,
    "reviewClipId" TEXT,
    "category" TEXT NOT NULL,
    "originalSeverity" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "roundIndex" INTEGER,
    "originalVideoTimestampSeconds" REAL,
    "videoTimestampSeconds" REAL,
    "replayTimestampSeconds" REAL,
    "directObservationsJson" TEXT NOT NULL DEFAULT '[]',
    "replayFactsJson" TEXT NOT NULL DEFAULT '[]',
    "transcriptEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "mapEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "supportingFramesJson" TEXT NOT NULL DEFAULT '[]',
    "conflictingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "missingContextJson" TEXT NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL,
    "alternativeExplanationsJson" TEXT NOT NULL DEFAULT '[]',
    "detectorVersionsJson" TEXT NOT NULL DEFAULT '{}',
    "analysisVersion" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "coachNote" TEXT,
    "futurePractice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CoachingFinding_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoachingFinding_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CoachingAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoachingFinding_canonicalRoundId_fkey" FOREIGN KEY ("canonicalRoundId") REFERENCES "CanonicalRound" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CoachingFinding_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "CanonicalEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CoachingFinding_reviewClipId_fkey" FOREIGN KEY ("reviewClipId") REFERENCES "Clip" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoachingFindingEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "findingId" TEXT NOT NULL,
    "evidenceClass" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "videoTimestampSeconds" REAL,
    "replayTimestampSeconds" REAL,
    "confidence" REAL,
    "observationJson" TEXT NOT NULL DEFAULT '{}',
    "inferenceJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachingFindingEvidence_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "CoachingFinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoachingFindingFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "findingId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "previousDecision" TEXT,
    "correctedVideoTimestamp" REAL,
    "previousVideoTimestamp" REAL,
    "correctedSeverity" TEXT,
    "previousSeverity" TEXT,
    "note" TEXT,
    "futurePractice" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachingFindingFeedback_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "CoachingFinding" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoachingPracticeDrill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "findingId" TEXT,
    "name" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "measurableGoal" TEXT NOT NULL,
    "nextFiveMatchGoal" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CoachingPracticeDrill_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoachingPracticeDrill_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "CoachingFinding" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoachingReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reportVersion" TEXT NOT NULL,
    "reportJson" TEXT NOT NULL,
    "findingSnapshotJson" TEXT NOT NULL,
    "sourceSnapshotJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachingReport_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CoachingReportExport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachingReportExport_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "CoachingReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CoachingCalibration_studioProjectId_isActive_version_idx" ON "CoachingCalibration"("studioProjectId", "isActive", "version");

-- CreateIndex
CREATE INDEX "CoachingCalibration_videoProjectId_idx" ON "CoachingCalibration"("videoProjectId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingCalibration_studioProjectId_version_key" ON "CoachingCalibration"("studioProjectId", "version");

-- CreateIndex
CREATE INDEX "CoachingAnalysis_studioProjectId_createdAt_idx" ON "CoachingAnalysis"("studioProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachingAnalysis_status_updatedAt_idx" ON "CoachingAnalysis"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "CoachingAnalysis_calibrationId_idx" ON "CoachingAnalysis"("calibrationId");

-- CreateIndex
CREATE INDEX "CoachingFinding_studioProjectId_createdAt_idx" ON "CoachingFinding"("studioProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachingFinding_analysisId_category_idx" ON "CoachingFinding"("analysisId", "category");

-- CreateIndex
CREATE INDEX "CoachingFinding_canonicalRoundId_idx" ON "CoachingFinding"("canonicalRoundId");

-- CreateIndex
CREATE INDEX "CoachingFinding_canonicalEventId_idx" ON "CoachingFinding"("canonicalEventId");

-- CreateIndex
CREATE INDEX "CoachingFinding_reviewClipId_idx" ON "CoachingFinding"("reviewClipId");

-- CreateIndex
CREATE INDEX "CoachingFinding_decision_updatedAt_idx" ON "CoachingFinding"("decision", "updatedAt");

-- CreateIndex
CREATE INDEX "CoachingFindingEvidence_findingId_evidenceClass_idx" ON "CoachingFindingEvidence"("findingId", "evidenceClass");

-- CreateIndex
CREATE INDEX "CoachingFindingEvidence_sourceType_sourceId_idx" ON "CoachingFindingEvidence"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "CoachingFindingFeedback_findingId_createdAt_idx" ON "CoachingFindingFeedback"("findingId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachingFindingFeedback_decision_createdAt_idx" ON "CoachingFindingFeedback"("decision", "createdAt");

-- CreateIndex
CREATE INDEX "CoachingPracticeDrill_studioProjectId_createdAt_idx" ON "CoachingPracticeDrill"("studioProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachingPracticeDrill_findingId_idx" ON "CoachingPracticeDrill"("findingId");

-- CreateIndex
CREATE INDEX "CoachingReport_studioProjectId_createdAt_idx" ON "CoachingReport"("studioProjectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingReport_studioProjectId_version_key" ON "CoachingReport"("studioProjectId", "version");

-- CreateIndex
CREATE INDEX "CoachingReportExport_reportId_format_createdAt_idx" ON "CoachingReportExport"("reportId", "format", "createdAt");
