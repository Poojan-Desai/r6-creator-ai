-- CreateTable
CREATE TABLE "LongFormRenderJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timelineId" TEXT NOT NULL,
    "timelineRevisionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'Waiting to render',
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
    "segmentCount" INTEGER,
    "errorMessage" TEXT,
    "cancelRequestedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LongFormRenderJob_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "LongFormTimeline" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LongFormRenderJob_timelineRevisionId_fkey" FOREIGN KEY ("timelineRevisionId") REFERENCES "LongFormTimelineRevision" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LongFormRenderJob_timelineId_createdAt_idx" ON "LongFormRenderJob"("timelineId", "createdAt");

-- CreateIndex
CREATE INDEX "LongFormRenderJob_status_updatedAt_idx" ON "LongFormRenderJob"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "LongFormRenderJob_timelineRevisionId_idx" ON "LongFormRenderJob"("timelineRevisionId");

-- CreateIndex
CREATE INDEX "LongFormRenderJob_kind_status_createdAt_idx" ON "LongFormRenderJob"("kind", "status", "createdAt");
