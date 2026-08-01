-- CreateTable
CREATE TABLE "VoiceoverProduction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'SHORT_FORM',
    "tone" TEXT NOT NULL DEFAULT 'NATURAL',
    "currentScriptVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceoverProduction_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceoverScriptRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerVersion" TEXT NOT NULL,
    "targetRevisionId" TEXT,
    "packageJson" TEXT NOT NULL,
    "factsSnapshotJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceoverScriptRevision_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "VoiceoverProduction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceoverFact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "timestampSeconds" REAL,
    "confidence" REAL,
    "sourceId" TEXT,
    "correction" TEXT,
    "userConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceoverFact_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "VoiceoverProduction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceoverTake" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionId" TEXT NOT NULL,
    "sourceAssetId" TEXT NOT NULL,
    "processedAssetId" TEXT,
    "name" TEXT NOT NULL,
    "scriptSectionKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "trimStartSeconds" REAL NOT NULL DEFAULT 0,
    "trimEndSeconds" REAL,
    "normalize" BOOLEAN NOT NULL DEFAULT false,
    "noiseReduction" BOOLEAN NOT NULL DEFAULT false,
    "gainDb" REAL NOT NULL DEFAULT 0,
    "alignmentStartSeconds" REAL NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceoverTake_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "VoiceoverProduction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceoverTake_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "StudioMediaAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VoiceoverTake_processedAssetId_fkey" FOREIGN KEY ("processedAssetId") REFERENCES "StudioMediaAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceoverJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "takeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'Waiting to start',
    "processorVersion" TEXT NOT NULL,
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "cancelRequestedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceoverJob_takeId_fkey" FOREIGN KEY ("takeId") REFERENCES "VoiceoverTake" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceoverCaptionSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "takeId" TEXT NOT NULL,
    "segmentOrder" INTEGER NOT NULL,
    "startSeconds" REAL NOT NULL,
    "endSeconds" REAL NOT NULL,
    "text" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoiceoverCaptionSegment_takeId_fkey" FOREIGN KEY ("takeId") REFERENCES "VoiceoverTake" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceoverProduction_studioProjectId_key" ON "VoiceoverProduction"("studioProjectId");

-- CreateIndex
CREATE INDEX "VoiceoverProduction_targetType_updatedAt_idx" ON "VoiceoverProduction"("targetType", "updatedAt");

-- CreateIndex
CREATE INDEX "VoiceoverScriptRevision_productionId_createdAt_idx" ON "VoiceoverScriptRevision"("productionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceoverScriptRevision_productionId_version_key" ON "VoiceoverScriptRevision"("productionId", "version");

-- CreateIndex
CREATE INDEX "VoiceoverFact_productionId_category_createdAt_idx" ON "VoiceoverFact"("productionId", "category", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceoverTake_sourceAssetId_key" ON "VoiceoverTake"("sourceAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceoverTake_processedAssetId_key" ON "VoiceoverTake"("processedAssetId");

-- CreateIndex
CREATE INDEX "VoiceoverTake_productionId_isActive_createdAt_idx" ON "VoiceoverTake"("productionId", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceoverTake_productionId_scriptSectionKey_idx" ON "VoiceoverTake"("productionId", "scriptSectionKey");

-- CreateIndex
CREATE INDEX "VoiceoverJob_takeId_createdAt_idx" ON "VoiceoverJob"("takeId", "createdAt");

-- CreateIndex
CREATE INDEX "VoiceoverJob_status_updatedAt_idx" ON "VoiceoverJob"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "VoiceoverCaptionSegment_takeId_startSeconds_idx" ON "VoiceoverCaptionSegment"("takeId", "startSeconds");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceoverCaptionSegment_takeId_segmentOrder_key" ON "VoiceoverCaptionSegment"("takeId", "segmentOrder");
