-- CreateTable
CREATE TABLE "PlayerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "preferredAlias" TEXT,
    "selectedPlayerStableIds" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlayerProgressSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerProfileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "metricVersion" TEXT NOT NULL,
    "filterJson" TEXT NOT NULL DEFAULT '{}',
    "evidenceSummaryJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerProgressSnapshot_playerProfileId_fkey" FOREIGN KEY ("playerProfileId") REFERENCES "PlayerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgressSnapshotProject" (
    "snapshotId" TEXT NOT NULL,
    "studioProjectId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "selectedPlayerStableId" TEXT,
    "selectedPlayerAlias" TEXT,
    "sourceSummaryJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("snapshotId", "studioProjectId"),
    CONSTRAINT "ProgressSnapshotProject_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PlayerProgressSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProgressSnapshotProject_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerProgressMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metricGroup" TEXT NOT NULL,
    "value" REAL,
    "unit" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "availability" TEXT NOT NULL DEFAULT 'UNAVAILABLE',
    "confidence" REAL,
    "explanation" TEXT NOT NULL,
    "evidenceClass" TEXT NOT NULL,
    "sourceVersionsJson" TEXT NOT NULL DEFAULT '[]',
    "sourceEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerProgressMetric_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PlayerProgressSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerProgressNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerProfileId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "studioProjectId" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerProgressNote_playerProfileId_fkey" FOREIGN KEY ("playerProfileId") REFERENCES "PlayerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerProgressNote_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PlayerProgressSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlayerProgressNote_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerPracticeGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerProfileId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "sourceDrillId" TEXT,
    "name" TEXT NOT NULL,
    "measurableGoal" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerPracticeGoal_playerProfileId_fkey" FOREIGN KEY ("playerProfileId") REFERENCES "PlayerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlayerPracticeGoal_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "PlayerProgressSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlayerPracticeGoal_sourceDrillId_fkey" FOREIGN KEY ("sourceDrillId") REFERENCES "CoachingPracticeDrill" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PlayerProfile_updatedAt_idx" ON "PlayerProfile"("updatedAt");

-- CreateIndex
CREATE INDEX "PlayerProgressSnapshot_playerProfileId_createdAt_idx" ON "PlayerProgressSnapshot"("playerProfileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProgressSnapshot_playerProfileId_version_key" ON "PlayerProgressSnapshot"("playerProfileId", "version");

-- CreateIndex
CREATE INDEX "ProgressSnapshotProject_studioProjectId_createdAt_idx" ON "ProgressSnapshotProject"("studioProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerProgressMetric_key_createdAt_idx" ON "PlayerProgressMetric"("key", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerProgressMetric_availability_createdAt_idx" ON "PlayerProgressMetric"("availability", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProgressMetric_snapshotId_key_key" ON "PlayerProgressMetric"("snapshotId", "key");

-- CreateIndex
CREATE INDEX "PlayerProgressNote_playerProfileId_createdAt_idx" ON "PlayerProgressNote"("playerProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerProgressNote_snapshotId_idx" ON "PlayerProgressNote"("snapshotId");

-- CreateIndex
CREATE INDEX "PlayerProgressNote_studioProjectId_idx" ON "PlayerProgressNote"("studioProjectId");

-- CreateIndex
CREATE INDEX "PlayerPracticeGoal_playerProfileId_status_createdAt_idx" ON "PlayerPracticeGoal"("playerProfileId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PlayerPracticeGoal_snapshotId_idx" ON "PlayerPracticeGoal"("snapshotId");

-- CreateIndex
CREATE INDEX "PlayerPracticeGoal_sourceDrillId_idx" ON "PlayerPracticeGoal"("sourceDrillId");
