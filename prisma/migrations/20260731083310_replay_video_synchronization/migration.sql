-- CreateTable
CREATE TABLE "ReplayVideoSynchronization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "basedOnVersionId" TEXT,
    "mappingAlgorithmVersion" TEXT NOT NULL DEFAULT 'u2-linear-sync-v1',
    "offsetSeconds" REAL NOT NULL DEFAULT 0,
    "slope" REAL NOT NULL DEFAULT 1,
    "driftSecondsPerHour" REAL NOT NULL DEFAULT 0,
    "rootMeanSquareErrorSeconds" REAL,
    "confidence" REAL NOT NULL DEFAULT 0,
    "confidenceLabel" TEXT NOT NULL DEFAULT 'Unavailable',
    "supportingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "conflictingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "missingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "userVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReplayVideoSynchronization_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReplayVideoSynchronization_basedOnVersionId_fkey" FOREIGN KEY ("basedOnVersionId") REFERENCES "ReplayVideoSynchronization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReplayVideoSyncAnchor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "synchronizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "matchStatus" TEXT NOT NULL DEFAULT 'MATCHED',
    "label" TEXT NOT NULL,
    "videoTimestampSeconds" REAL NOT NULL,
    "replayTimestampSeconds" REAL NOT NULL,
    "replayRoundIndex" INTEGER,
    "replayRoundStableId" TEXT,
    "replayEventStableId" TEXT,
    "replayEventCategory" TEXT,
    "videoObservationJson" TEXT NOT NULL DEFAULT '{}',
    "replayFactJson" TEXT NOT NULL DEFAULT '{}',
    "alignmentInferenceJson" TEXT NOT NULL DEFAULT '{}',
    "supportingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "conflictingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "missingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "userConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "residualSeconds" REAL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReplayVideoSyncAnchor_synchronizationId_fkey" FOREIGN KEY ("synchronizationId") REFERENCES "ReplayVideoSynchronization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReplayVideoSyncRoundAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "synchronizationId" TEXT NOT NULL,
    "replayRoundIndex" INTEGER NOT NULL,
    "adjustmentSeconds" REAL NOT NULL,
    "reason" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "userConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReplayVideoSyncRoundAdjustment_synchronizationId_fkey" FOREIGN KEY ("synchronizationId") REFERENCES "ReplayVideoSynchronization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReplayVideoSyncOffsetCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "synchronizationId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "offsetSeconds" REAL NOT NULL,
    "slope" REAL NOT NULL DEFAULT 1,
    "driftSecondsPerHour" REAL NOT NULL DEFAULT 0,
    "confidence" REAL NOT NULL,
    "compatiblePairCount" INTEGER NOT NULL,
    "distinctEvidenceTypeCount" INTEGER NOT NULL,
    "supportingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "conflictingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "missingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "algorithmVersion" TEXT NOT NULL DEFAULT 'u2-offset-cluster-v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReplayVideoSyncOffsetCandidate_synchronizationId_fkey" FOREIGN KEY ("synchronizationId") REFERENCES "ReplayVideoSynchronization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReplayVideoSynchronization_studioProjectId_status_version_idx" ON "ReplayVideoSynchronization"("studioProjectId", "status", "version");

-- CreateIndex
CREATE INDEX "ReplayVideoSynchronization_basedOnVersionId_idx" ON "ReplayVideoSynchronization"("basedOnVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplayVideoSynchronization_studioProjectId_version_key" ON "ReplayVideoSynchronization"("studioProjectId", "version");

-- CreateIndex
CREATE INDEX "ReplayVideoSyncAnchor_synchronizationId_sortOrder_idx" ON "ReplayVideoSyncAnchor"("synchronizationId", "sortOrder");

-- CreateIndex
CREATE INDEX "ReplayVideoSyncAnchor_replayRoundIndex_replayTimestampSeconds_idx" ON "ReplayVideoSyncAnchor"("replayRoundIndex", "replayTimestampSeconds");

-- CreateIndex
CREATE INDEX "ReplayVideoSyncAnchor_replayEventStableId_idx" ON "ReplayVideoSyncAnchor"("replayEventStableId");

-- CreateIndex
CREATE INDEX "ReplayVideoSyncRoundAdjustment_synchronizationId_replayRoundIndex_idx" ON "ReplayVideoSyncRoundAdjustment"("synchronizationId", "replayRoundIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ReplayVideoSyncRoundAdjustment_synchronizationId_replayRoundIndex_key" ON "ReplayVideoSyncRoundAdjustment"("synchronizationId", "replayRoundIndex");

-- CreateIndex
CREATE INDEX "ReplayVideoSyncOffsetCandidate_synchronizationId_status_rank_idx" ON "ReplayVideoSyncOffsetCandidate"("synchronizationId", "status", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "ReplayVideoSyncOffsetCandidate_synchronizationId_rank_key" ON "ReplayVideoSyncOffsetCandidate"("synchronizationId", "rank");
