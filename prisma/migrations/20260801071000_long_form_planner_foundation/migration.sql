-- CreateTable
CREATE TABLE "LongFormProduction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "targetDurationSeconds" REAL NOT NULL DEFAULT 1500,
    "storytellingStyle" TEXT NOT NULL DEFAULT 'STORYTELLING',
    "energyLevel" INTEGER NOT NULL DEFAULT 60,
    "humorLevel" INTEGER NOT NULL DEFAULT 40,
    "educationalLevel" INTEGER NOT NULL DEFAULT 30,
    "liveGameplayPercent" INTEGER NOT NULL DEFAULT 75,
    "voiceoverPercent" INTEGER NOT NULL DEFAULT 25,
    "matchOrRoundLimit" INTEGER NOT NULL DEFAULT 4,
    "excludeWeakSections" BOOLEAN NOT NULL DEFAULT true,
    "includeLosses" BOOLEAN NOT NULL DEFAULT true,
    "chronologicalOrder" BOOLEAN NOT NULL DEFAULT true,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LongFormProduction_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LongFormProductionRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "plannerVersion" TEXT NOT NULL,
    "settingsJson" TEXT NOT NULL,
    "planJson" TEXT NOT NULL,
    "factsSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "evidenceSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LongFormProductionRevision_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "LongFormProduction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LongFormProduction_studioProjectId_key" ON "LongFormProduction"("studioProjectId");

-- CreateIndex
CREATE INDEX "LongFormProduction_status_updatedAt_idx" ON "LongFormProduction"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LongFormProductionRevision_productionId_version_key" ON "LongFormProductionRevision"("productionId", "version");

-- CreateIndex
CREATE INDEX "LongFormProductionRevision_productionId_createdAt_idx" ON "LongFormProductionRevision"("productionId", "createdAt");
