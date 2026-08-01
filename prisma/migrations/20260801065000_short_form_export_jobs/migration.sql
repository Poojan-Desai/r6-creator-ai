-- CreateTable
CREATE TABLE "ShortFormExportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timelineId" TEXT NOT NULL,
    "timelineRevisionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'Waiting to export',
    "pipelineVersion" TEXT NOT NULL,
    "renderSpecJson" TEXT NOT NULL DEFAULT '{}',
    "outputFilename" TEXT NOT NULL,
    "relativePath" TEXT,
    "fileSizeBytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSeconds" REAL,
    "videoCodec" TEXT,
    "audioCodec" TEXT,
    "errorMessage" TEXT,
    "cancelRequestedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShortFormExportJob_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "ShortFormTimeline" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShortFormExportJob_timelineRevisionId_fkey" FOREIGN KEY ("timelineRevisionId") REFERENCES "ShortFormTimelineRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ShortFormExportJob_timelineId_createdAt_idx" ON "ShortFormExportJob"("timelineId", "createdAt");

-- CreateIndex
CREATE INDEX "ShortFormExportJob_status_updatedAt_idx" ON "ShortFormExportJob"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ShortFormExportJob_timelineRevisionId_idx" ON "ShortFormExportJob"("timelineRevisionId");
