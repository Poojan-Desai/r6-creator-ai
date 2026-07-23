-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BenchmarkDatasetProject" (
    "datasetId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "videoFingerprint" TEXT NOT NULL,
    "durationSeconds" REAL NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "recordingType" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    "labelSchemaVersion" TEXT NOT NULL DEFAULT 'r6-creator-benchmark-labels/v1',
    "fullyReviewedCategoriesJson" TEXT NOT NULL DEFAULT '[]',
    "humanReviewMinutes" REAL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("datasetId", "projectId"),
    CONSTRAINT "BenchmarkDatasetProject_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "BenchmarkDataset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BenchmarkDatasetProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BenchmarkDatasetProject" ("addedAt", "datasetId", "durationSeconds", "height", "labelSchemaVersion", "projectId", "recordingType", "videoFingerprint", "width") SELECT "addedAt", "datasetId", "durationSeconds", "height", "labelSchemaVersion", "projectId", "recordingType", "videoFingerprint", "width" FROM "BenchmarkDatasetProject";
DROP TABLE "BenchmarkDatasetProject";
ALTER TABLE "new_BenchmarkDatasetProject" RENAME TO "BenchmarkDatasetProject";
CREATE INDEX "BenchmarkDatasetProject_projectId_idx" ON "BenchmarkDatasetProject"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
