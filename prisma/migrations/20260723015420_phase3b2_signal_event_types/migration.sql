-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DetectorEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "detectorRunId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'LEGACY_GROUND_TRUTH_EVENT',
    "category" TEXT,
    "startSeconds" REAL NOT NULL,
    "peakSeconds" REAL NOT NULL,
    "endSeconds" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "supportingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "conflictingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "sourceSignal" TEXT NOT NULL,
    "rawMeasurementsJson" TEXT NOT NULL DEFAULT '{}',
    "thresholdsJson" TEXT NOT NULL DEFAULT '{}',
    "debugArtifactsJson" TEXT NOT NULL DEFAULT '[]',
    "processingDurationMs" INTEGER NOT NULL,
    "warningMessagesJson" TEXT NOT NULL DEFAULT '[]',
    "humanReviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DetectorEvent_detectorRunId_fkey" FOREIGN KEY ("detectorRunId") REFERENCES "DetectorRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DetectorEvent" ("category", "confidence", "conflictingEvidenceJson", "createdAt", "debugArtifactsJson", "detectorRunId", "endSeconds", "eventType", "humanReviewStatus", "id", "peakSeconds", "processingDurationMs", "rawMeasurementsJson", "sourceSignal", "startSeconds", "supportingEvidenceJson", "thresholdsJson", "warningMessagesJson") SELECT "category", "confidence", "conflictingEvidenceJson", "createdAt", "debugArtifactsJson", "detectorRunId", "endSeconds", 'BENCHMARK_' || "category", "humanReviewStatus", "id", "peakSeconds", "processingDurationMs", "rawMeasurementsJson", "sourceSignal", "startSeconds", "supportingEvidenceJson", "thresholdsJson", "warningMessagesJson" FROM "DetectorEvent";
DROP TABLE "DetectorEvent";
ALTER TABLE "new_DetectorEvent" RENAME TO "DetectorEvent";
CREATE INDEX "DetectorEvent_detectorRunId_startSeconds_idx" ON "DetectorEvent"("detectorRunId", "startSeconds");
CREATE INDEX "DetectorEvent_eventType_idx" ON "DetectorEvent"("eventType");
CREATE INDEX "DetectorEvent_category_idx" ON "DetectorEvent"("category");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
