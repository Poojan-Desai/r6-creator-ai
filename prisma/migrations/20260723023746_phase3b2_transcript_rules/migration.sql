-- CreateTable
CREATE TABLE "TranscriptRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TranscriptRuleVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "patternJson" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.6,
    "source" TEXT NOT NULL DEFAULT 'USER',
    "changeNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TranscriptRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TranscriptRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptRule_stableId_key" ON "TranscriptRule"("stableId");

-- CreateIndex
CREATE INDEX "TranscriptRule_category_enabled_idx" ON "TranscriptRule"("category", "enabled");

-- CreateIndex
CREATE INDEX "TranscriptRuleVersion_ruleId_version_idx" ON "TranscriptRuleVersion"("ruleId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptRuleVersion_ruleId_version_key" ON "TranscriptRuleVersion"("ruleId", "version");
