-- CreateTable
CREATE TABLE "LongFormTimeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LongFormTimeline_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "LongFormProduction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LongFormTimelineRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timelineId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "documentJson" TEXT NOT NULL,
    "renderSpecJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LongFormTimelineRevision_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "LongFormTimeline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LongFormTimeline_productionId_key" ON "LongFormTimeline"("productionId");

-- CreateIndex
CREATE INDEX "LongFormTimeline_status_updatedAt_idx" ON "LongFormTimeline"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LongFormTimelineRevision_timelineId_version_key" ON "LongFormTimelineRevision"("timelineId", "version");

-- CreateIndex
CREATE INDEX "LongFormTimelineRevision_timelineId_createdAt_idx" ON "LongFormTimelineRevision"("timelineId", "createdAt");
