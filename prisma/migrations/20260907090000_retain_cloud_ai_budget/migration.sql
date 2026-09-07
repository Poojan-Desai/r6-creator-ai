-- CreateTable
CREATE TABLE "CloudAiBudgetLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "generation" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "CloudAiBudgetLock" ("id", "generation") VALUES ('global', 0);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CloudAiRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT,
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
    CONSTRAINT "CloudAiRequest_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CloudAiRequest" ("actualCostMicros", "completedAt", "consentedAt", "createdAt", "errorCode", "estimatedCostMicros", "estimatedInputTokens", "fallbackProviderId", "feature", "id", "inputTokens", "maxOutputTokens", "model", "outputTokens", "pricingJson", "promptFingerprint", "providerId", "responseId", "status", "studioProjectId", "updatedAt") SELECT "actualCostMicros", "completedAt", "consentedAt", "createdAt", "errorCode", "estimatedCostMicros", "estimatedInputTokens", "fallbackProviderId", "feature", "id", "inputTokens", "maxOutputTokens", "model", "outputTokens", "pricingJson", "promptFingerprint", "providerId", "responseId", "status", "studioProjectId", "updatedAt" FROM "CloudAiRequest";
DROP TABLE "CloudAiRequest";
ALTER TABLE "new_CloudAiRequest" RENAME TO "CloudAiRequest";
CREATE INDEX "CloudAiRequest_studioProjectId_createdAt_idx" ON "CloudAiRequest"("studioProjectId", "createdAt");
CREATE INDEX "CloudAiRequest_status_createdAt_idx" ON "CloudAiRequest"("status", "createdAt");
CREATE INDEX "CloudAiRequest_createdAt_actualCostMicros_idx" ON "CloudAiRequest"("createdAt", "actualCostMicros");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
