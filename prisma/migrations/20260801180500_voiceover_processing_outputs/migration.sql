-- CreateTable
CREATE TABLE "VoiceoverProcessedAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "takeId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "settingsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceoverProcessedAsset_takeId_fkey" FOREIGN KEY ("takeId") REFERENCES "VoiceoverTake" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceoverProcessedAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "VoiceoverJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoiceoverProcessedAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "StudioMediaAsset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceoverProcessedAsset_jobId_key" ON "VoiceoverProcessedAsset"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceoverProcessedAsset_assetId_key" ON "VoiceoverProcessedAsset"("assetId");

-- CreateIndex
CREATE INDEX "VoiceoverProcessedAsset_takeId_createdAt_idx" ON "VoiceoverProcessedAsset"("takeId", "createdAt");
