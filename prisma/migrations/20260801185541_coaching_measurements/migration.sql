-- CreateTable
CREATE TABLE "CoachingMeasurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "videoProjectId" TEXT NOT NULL,
    "calibrationId" TEXT,
    "findingId" TEXT,
    "kind" TEXT NOT NULL,
    "startSeconds" REAL NOT NULL,
    "peakSeconds" REAL NOT NULL,
    "endSeconds" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "methodVersion" TEXT NOT NULL,
    "inputsJson" TEXT NOT NULL,
    "measurementsJson" TEXT NOT NULL,
    "thresholdsJson" TEXT NOT NULL,
    "userConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "warningMessagesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoachingMeasurement_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoachingMeasurement_videoProjectId_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoachingMeasurement_calibrationId_fkey" FOREIGN KEY ("calibrationId") REFERENCES "CoachingCalibration" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CoachingMeasurement_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "CoachingFinding" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CoachingMeasurement_studioProjectId_createdAt_idx" ON "CoachingMeasurement"("studioProjectId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachingMeasurement_videoProjectId_startSeconds_idx" ON "CoachingMeasurement"("videoProjectId", "startSeconds");

-- CreateIndex
CREATE INDEX "CoachingMeasurement_calibrationId_idx" ON "CoachingMeasurement"("calibrationId");

-- CreateIndex
CREATE INDEX "CoachingMeasurement_findingId_idx" ON "CoachingMeasurement"("findingId");

-- CreateIndex
CREATE INDEX "CoachingMeasurement_kind_createdAt_idx" ON "CoachingMeasurement"("kind", "createdAt");
