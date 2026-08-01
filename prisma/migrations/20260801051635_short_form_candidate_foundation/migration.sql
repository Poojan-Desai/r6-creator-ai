-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CandidateMoment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "studioProjectId" TEXT,
    "analysisJobId" TEXT NOT NULL,
    "styleProfileId" TEXT,
    "category" TEXT NOT NULL,
    "mainEvent" TEXT NOT NULL DEFAULT 'Evidence-supported candidate',
    "alternativeCategoriesJson" TEXT NOT NULL DEFAULT '[]',
    "startSeconds" REAL NOT NULL,
    "peakSeconds" REAL NOT NULL,
    "endSeconds" REAL NOT NULL,
    "eventConfidence" REAL NOT NULL,
    "contentPotentialScore" REAL NOT NULL,
    "styleSimilarity" REAL,
    "scoreBreakdownJson" TEXT NOT NULL DEFAULT '{}',
    "videoEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "replayEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "transcriptEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL,
    "missingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "detectorVersionsJson" TEXT NOT NULL DEFAULT '{}',
    "fusionVersion" TEXT NOT NULL DEFAULT 'u3-candidate-fusion-v1',
    "synchronizationVersion" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CandidateMoment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CandidateMoment_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CandidateMoment_analysisJobId_fkey" FOREIGN KEY ("analysisJobId") REFERENCES "AnalysisJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CandidateMoment_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "CreatorStyleProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CandidateMoment" ("alternativeCategoriesJson", "analysisJobId", "category", "contentPotentialScore", "createdAt", "detectorVersionsJson", "endSeconds", "eventConfidence", "explanation", "id", "missingEvidenceJson", "note", "peakSeconds", "projectId", "scoreBreakdownJson", "startSeconds", "styleProfileId", "styleSimilarity", "updatedAt") SELECT "alternativeCategoriesJson", "analysisJobId", "category", "contentPotentialScore", "createdAt", "detectorVersionsJson", "endSeconds", "eventConfidence", "explanation", "id", "missingEvidenceJson", "note", "peakSeconds", "projectId", "scoreBreakdownJson", "startSeconds", "styleProfileId", "styleSimilarity", "updatedAt" FROM "CandidateMoment";
DROP TABLE "CandidateMoment";
ALTER TABLE "new_CandidateMoment" RENAME TO "CandidateMoment";
CREATE INDEX "CandidateMoment_projectId_startSeconds_idx" ON "CandidateMoment"("projectId", "startSeconds");
CREATE INDEX "CandidateMoment_studioProjectId_contentPotentialScore_idx" ON "CandidateMoment"("studioProjectId", "contentPotentialScore");
CREATE INDEX "CandidateMoment_analysisJobId_idx" ON "CandidateMoment"("analysisJobId");
CREATE INDEX "CandidateMoment_category_idx" ON "CandidateMoment"("category");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
