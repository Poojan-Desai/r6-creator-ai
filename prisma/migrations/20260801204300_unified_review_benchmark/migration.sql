-- CreateTable
CREATE TABLE "UnifiedReviewLabel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studioProjectId" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetKind" TEXT NOT NULL DEFAULT 'PROJECT',
    "targetId" TEXT,
    "startSeconds" REAL,
    "endSeconds" REAL,
    "reviewerConfidence" REAL NOT NULL DEFAULT 1,
    "approvedAsBenchmark" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "labelVersion" TEXT NOT NULL DEFAULT 'unified-review-labels/v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UnifiedReviewLabel_studioProjectId_fkey" FOREIGN KEY ("studioProjectId") REFERENCES "StudioProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UnifiedReviewLabel_studioProjectId_area_category_idx" ON "UnifiedReviewLabel"("studioProjectId", "area", "category");

-- CreateIndex
CREATE INDEX "UnifiedReviewLabel_approvedAsBenchmark_createdAt_idx" ON "UnifiedReviewLabel"("approvedAsBenchmark", "createdAt");

-- CreateIndex
CREATE INDEX "UnifiedReviewLabel_targetKind_targetId_idx" ON "UnifiedReviewLabel"("targetKind", "targetId");
