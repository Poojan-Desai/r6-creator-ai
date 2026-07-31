ALTER TABLE "ReplayProviderRun" ADD COLUMN "failureKind" TEXT;
ALTER TABLE "ReplayProviderRun" ADD COLUMN "internalErrorCode" TEXT;
ALTER TABLE "ReplayProviderRun" ADD COLUMN "executableLabel" TEXT;
ALTER TABLE "ReplayProviderRun" ADD COLUMN "invocationJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ReplayProviderRun" ADD COLUMN "inputFilesJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ReplayProviderRun" ADD COLUMN "exitCode" INTEGER;
ALTER TABLE "ReplayProviderRun" ADD COLUMN "terminationSignal" TEXT;
ALTER TABLE "ReplayProviderRun" ADD COLUMN "timedOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReplayProviderRun" ADD COLUMN "replayReadStarted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReplayProviderRun" ADD COLUMN "unsupportedVersion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReplayProviderRun" ADD COLUMN "successfulRoundCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ReplayProviderRun" ADD COLUMN "failedRoundCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ReplayRoundProviderResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerRunId" TEXT NOT NULL,
    "replayFileId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "failureKind" TEXT,
    "internalErrorCode" TEXT,
    "safeSummary" TEXT,
    "suggestedAction" TEXT,
    "stderrPreview" TEXT,
    "stdoutPreview" TEXT,
    "exitCode" INTEGER,
    "terminationSignal" TEXT,
    "timedOut" BOOLEAN NOT NULL DEFAULT false,
    "replayReadStarted" BOOLEAN NOT NULL DEFAULT false,
    "processingDurationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReplayRoundProviderResult_providerRunId_fkey" FOREIGN KEY ("providerRunId") REFERENCES "ReplayProviderRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReplayRoundProviderResult_replayFileId_fkey" FOREIGN KEY ("replayFileId") REFERENCES "ReplayFile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReplayRoundProviderResult_providerRunId_replayFileId_key" ON "ReplayRoundProviderResult"("providerRunId", "replayFileId");
CREATE INDEX "ReplayRoundProviderResult_providerRunId_status_idx" ON "ReplayRoundProviderResult"("providerRunId", "status");
CREATE INDEX "ReplayRoundProviderResult_replayFileId_idx" ON "ReplayRoundProviderResult"("replayFileId");
