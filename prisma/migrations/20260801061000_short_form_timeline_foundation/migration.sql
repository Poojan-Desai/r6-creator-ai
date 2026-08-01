-- CreateTable
CREATE TABLE "ShortFormTimeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShortFormTimeline_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "ShortFormProduction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShortFormTimelineRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timelineId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "documentJson" TEXT NOT NULL,
    "renderSpecJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShortFormTimelineRevision_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "ShortFormTimeline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudioMediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "durationSeconds" REAL NOT NULL,
    "permissionConfirmed" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudioMediaAsset_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShortFormProxyJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timelineId" TEXT NOT NULL,
    "timelineRevisionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'Waiting to render',
    "pipelineVersion" TEXT NOT NULL,
    "renderSpecJson" TEXT NOT NULL DEFAULT '{}',
    "relativePath" TEXT,
    "fileSizeBytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" REAL,
    "errorMessage" TEXT,
    "cancelRequestedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShortFormProxyJob_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "ShortFormTimeline" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShortFormProxyJob_timelineRevisionId_fkey" FOREIGN KEY ("timelineRevisionId") REFERENCES "ShortFormTimelineRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShortFormTimeline_productionId_key" ON "ShortFormTimeline"("productionId");

-- CreateIndex
CREATE INDEX "ShortFormTimeline_status_updatedAt_idx" ON "ShortFormTimeline"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShortFormTimelineRevision_timelineId_version_key" ON "ShortFormTimelineRevision"("timelineId", "version");

-- CreateIndex
CREATE INDEX "ShortFormTimelineRevision_timelineId_createdAt_idx" ON "ShortFormTimelineRevision"("timelineId", "createdAt");

-- CreateIndex
CREATE INDEX "StudioMediaAsset_studioProjectId_kind_createdAt_idx" ON "StudioMediaAsset"("studioProjectId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ShortFormProxyJob_timelineId_createdAt_idx" ON "ShortFormProxyJob"("timelineId", "createdAt");

-- CreateIndex
CREATE INDEX "ShortFormProxyJob_status_updatedAt_idx" ON "ShortFormProxyJob"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ShortFormProxyJob_timelineRevisionId_idx" ON "ShortFormProxyJob"("timelineRevisionId");
