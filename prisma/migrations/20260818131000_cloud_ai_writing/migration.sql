-- CreateTable
CREATE TABLE "CloudAiRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "feature" TEXT NOT NULL DEFAULT 'SHORT_FORM_WRITING',
    "providerId" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "consentedAt" DATETIME NOT NULL,
    "promptFingerprint" TEXT NOT NULL,
    "estimatedInputTokens" INTEGER NOT NULL,
    "maxOutputTokens" INTEGER NOT NULL,
    "estimatedCostMicros" INTEGER NOT NULL,
    "pricingJson" TEXT NOT NULL DEFAULT '{}',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "actualCostMicros" INTEGER,
    "responseId" TEXT,
    "fallbackProviderId" TEXT,
    "errorCode" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CloudAiRequest_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CloudAiRequest_studioProjectId_createdAt_idx" ON "CloudAiRequest"("studioProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "CloudAiRequest_status_createdAt_idx" ON "CloudAiRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CloudAiRequest_createdAt_actualCostMicros_idx" ON "CloudAiRequest"("createdAt", "actualCostMicros");
