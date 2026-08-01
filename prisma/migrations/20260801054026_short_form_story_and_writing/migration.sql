-- CreateTable
CREATE TABLE "ShortFormProduction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "selectedCandidateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "platform" TEXT NOT NULL DEFAULT 'YOUTUBE_SHORTS',
    "targetDurationSeconds" REAL NOT NULL DEFAULT 30,
    "aspectRatio" TEXT NOT NULL DEFAULT 'VERTICAL_9_16',
    "tone" TEXT NOT NULL DEFAULT 'NATURAL',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShortFormProduction_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShortFormProduction_selectedCandidateId_fkey" FOREIGN KEY ("selectedCandidateId") REFERENCES "CandidateMoment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShortFormProductionRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "configurationJson" TEXT NOT NULL DEFAULT '{}',
    "storyPlanJson" TEXT NOT NULL DEFAULT '{}',
    "writingPackageJson" TEXT NOT NULL DEFAULT '{}',
    "factsSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "evidenceSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShortFormProductionRevision_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "ShortFormProduction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShortFormProduction_studioProjectId_key" ON "ShortFormProduction"("studioProjectId");

-- CreateIndex
CREATE INDEX "ShortFormProduction_selectedCandidateId_idx" ON "ShortFormProduction"("selectedCandidateId");

-- CreateIndex
CREATE INDEX "ShortFormProduction_status_updatedAt_idx" ON "ShortFormProduction"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ShortFormProductionRevision_productionId_createdAt_idx" ON "ShortFormProductionRevision"("productionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShortFormProductionRevision_productionId_version_key" ON "ShortFormProductionRevision"("productionId", "version");
