-- CreateTable
CREATE TABLE "StudioProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "outputGoal" TEXT NOT NULL,
    "inputMode" TEXT NOT NULL,
    "referenceMode" TEXT NOT NULL DEFAULT 'NONE',
    "focusAreasJson" TEXT NOT NULL DEFAULT '[]',
    "contentInstructions" TEXT,
    "coachingGoals" TEXT,
    "selectedPlayerStableId" TEXT,
    "selectedPlayerAlias" TEXT,
    "selectedAudioTrackId" TEXT,
    "styleProfileId" TEXT,
    "mapId" TEXT,
    "mapVersionId" TEXT,
    "bombSiteId" TEXT,
    "side" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "operatorId" TEXT,
    "operatorVersionId" TEXT,
    "roundResult" TEXT,
    "contextUserConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudioProject_selectedAudioTrackId_fkey" FOREIGN KEY ("selectedAudioTrackId") REFERENCES "AudioTrack" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudioProject_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "CreatorStyleProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudioProject_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "SiegeMap" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudioProject_mapVersionId_fkey" FOREIGN KEY ("mapVersionId") REFERENCES "MapVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudioProject_bombSiteId_fkey" FOREIGN KEY ("bombSiteId") REFERENCES "MapBombSitePair" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudioProject_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "SiegeOperator" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudioProject_operatorVersionId_fkey" FOREIGN KEY ("operatorVersionId") REFERENCES "OperatorVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudioProjectInput" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "videoProjectId" TEXT,
    "replayPackageId" TEXT,
    "referenceVideoId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudioProjectInput_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudioProjectInput_videoProjectId_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudioProjectInput_replayPackageId_fkey" FOREIGN KEY ("replayPackageId") REFERENCES "ReplayPackage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudioProjectInput_referenceVideoId_fkey" FOREIGN KEY ("referenceVideoId") REFERENCES "ReferenceVideo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StudioProject_createdAt_idx" ON "StudioProject"("createdAt");

-- CreateIndex
CREATE INDEX "StudioProject_status_updatedAt_idx" ON "StudioProject"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "StudioProject_selectedAudioTrackId_idx" ON "StudioProject"("selectedAudioTrackId");

-- CreateIndex
CREATE INDEX "StudioProject_styleProfileId_idx" ON "StudioProject"("styleProfileId");

-- CreateIndex
CREATE INDEX "StudioProject_mapId_mapVersionId_idx" ON "StudioProject"("mapId", "mapVersionId");

-- CreateIndex
CREATE INDEX "StudioProject_operatorId_operatorVersionId_idx" ON "StudioProject"("operatorId", "operatorVersionId");

-- CreateIndex
CREATE INDEX "StudioProjectInput_studioProjectId_kind_sortOrder_idx" ON "StudioProjectInput"("studioProjectId", "kind", "sortOrder");

-- CreateIndex
CREATE INDEX "StudioProjectInput_videoProjectId_idx" ON "StudioProjectInput"("videoProjectId");

-- CreateIndex
CREATE INDEX "StudioProjectInput_replayPackageId_idx" ON "StudioProjectInput"("replayPackageId");

-- CreateIndex
CREATE INDEX "StudioProjectInput_referenceVideoId_idx" ON "StudioProjectInput"("referenceVideoId");
