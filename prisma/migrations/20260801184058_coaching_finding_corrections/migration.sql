/*
  Warnings:

  - Added the required column `originalCategory` to the `CoachingFinding` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CoachingFindingFeedback" ADD COLUMN "correctedCategory" TEXT;
ALTER TABLE "CoachingFindingFeedback" ADD COLUMN "previousCategory" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CoachingFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "canonicalRoundId" TEXT,
    "canonicalEventId" TEXT,
    "reviewClipId" TEXT,
    "originalCategory" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "originalSeverity" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "roundIndex" INTEGER,
    "originalVideoTimestampSeconds" REAL,
    "videoTimestampSeconds" REAL,
    "replayTimestampSeconds" REAL,
    "directObservationsJson" TEXT NOT NULL DEFAULT '[]',
    "replayFactsJson" TEXT NOT NULL DEFAULT '[]',
    "transcriptEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "mapEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "supportingFramesJson" TEXT NOT NULL DEFAULT '[]',
    "conflictingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "missingContextJson" TEXT NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL,
    "alternativeExplanationsJson" TEXT NOT NULL DEFAULT '[]',
    "detectorVersionsJson" TEXT NOT NULL DEFAULT '{}',
    "analysisVersion" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "coachNote" TEXT,
    "futurePractice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CoachingFinding_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoachingFinding_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CoachingAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoachingFinding_canonicalRoundId_fkey" FOREIGN KEY ("canonicalRoundId") REFERENCES "CanonicalRound" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CoachingFinding_canonicalEventId_fkey" FOREIGN KEY ("canonicalEventId") REFERENCES "CanonicalEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CoachingFinding_reviewClipId_fkey" FOREIGN KEY ("reviewClipId") REFERENCES "Clip" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CoachingFinding" ("alternativeExplanationsJson", "analysisId", "analysisVersion", "canonicalEventId", "canonicalRoundId", "category", "coachNote", "confidence", "conflictingEvidenceJson", "createdAt", "decision", "detectorVersionsJson", "directObservationsJson", "explanation", "futurePractice", "id", "mapEvidenceJson", "missingContextJson", "originalSeverity", "originalVideoTimestampSeconds", "replayFactsJson", "replayTimestampSeconds", "reviewClipId", "roundIndex", "severity", "studioProjectId", "supportingFramesJson", "transcriptEvidenceJson", "updatedAt", "videoTimestampSeconds") SELECT "alternativeExplanationsJson", "analysisId", "analysisVersion", "canonicalEventId", "canonicalRoundId", "category", "coachNote", "confidence", "conflictingEvidenceJson", "createdAt", "decision", "detectorVersionsJson", "directObservationsJson", "explanation", "futurePractice", "id", "mapEvidenceJson", "missingContextJson", "originalSeverity", "originalVideoTimestampSeconds", "replayFactsJson", "replayTimestampSeconds", "reviewClipId", "roundIndex", "severity", "studioProjectId", "supportingFramesJson", "transcriptEvidenceJson", "updatedAt", "videoTimestampSeconds" FROM "CoachingFinding";
DROP TABLE "CoachingFinding";
ALTER TABLE "new_CoachingFinding" RENAME TO "CoachingFinding";
CREATE INDEX "CoachingFinding_studioProjectId_createdAt_idx" ON "CoachingFinding"("studioProjectId", "createdAt");
CREATE INDEX "CoachingFinding_analysisId_category_idx" ON "CoachingFinding"("analysisId", "category");
CREATE INDEX "CoachingFinding_canonicalRoundId_idx" ON "CoachingFinding"("canonicalRoundId");
CREATE INDEX "CoachingFinding_canonicalEventId_idx" ON "CoachingFinding"("canonicalEventId");
CREATE INDEX "CoachingFinding_reviewClipId_idx" ON "CoachingFinding"("reviewClipId");
CREATE INDEX "CoachingFinding_decision_updatedAt_idx" ON "CoachingFinding"("decision", "updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
