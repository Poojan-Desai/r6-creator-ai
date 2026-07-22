-- CreateTable
CREATE TABLE "AudioTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "streamIndex" INTEGER NOT NULL,
    "codecName" TEXT NOT NULL,
    "channels" INTEGER NOT NULL,
    "channelLayout" TEXT,
    "language" TEXT,
    "title" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "preferenceScore" INTEGER NOT NULL DEFAULT 0,
    "preferenceReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AudioTrack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranscriptionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "audioTrackId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'Waiting to start',
    "provider" TEXT NOT NULL DEFAULT 'whisper.cpp',
    "modelName" TEXT NOT NULL DEFAULT 'base.en',
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelRequestedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TranscriptionJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TranscriptionJob_audioTrackId_fkey" FOREIGN KEY ("audioTrackId") REFERENCES "AudioTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "segmentOrder" INTEGER NOT NULL,
    "startSeconds" REAL NOT NULL,
    "endSeconds" REAL NOT NULL,
    "text" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TranscriptSegment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TranscriptionJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AudioTrack_projectId_streamIndex_idx" ON "AudioTrack"("projectId", "streamIndex");

-- CreateIndex
CREATE UNIQUE INDEX "AudioTrack_projectId_streamIndex_key" ON "AudioTrack"("projectId", "streamIndex");

-- CreateIndex
CREATE INDEX "TranscriptionJob_projectId_createdAt_idx" ON "TranscriptionJob"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "TranscriptionJob_status_idx" ON "TranscriptionJob"("status");

-- CreateIndex
CREATE INDEX "TranscriptSegment_jobId_startSeconds_idx" ON "TranscriptSegment"("jobId", "startSeconds");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptSegment_jobId_segmentOrder_key" ON "TranscriptSegment"("jobId", "segmentOrder");
