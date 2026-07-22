-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "originalFilename" TEXT NOT NULL,
    "sourceRelativePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "durationSeconds" REAL NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "frameRate" REAL NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "startSeconds" REAL NOT NULL,
    "endSeconds" REAL NOT NULL,
    "durationSeconds" REAL NOT NULL,
    "relativePath" TEXT,
    "fileSizeBytes" BIGINT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Clip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "voiceoverScript" TEXT NOT NULL DEFAULT '',
    "openingHook" TEXT NOT NULL DEFAULT '',
    "youtubeTitle" TEXT NOT NULL DEFAULT '',
    "shortFormCaption" TEXT NOT NULL DEFAULT '',
    "thumbnailText" TEXT NOT NULL DEFAULT '',
    "editingInstructions" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentDraft_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_sourceRelativePath_key" ON "Project"("sourceRelativePath");

-- CreateIndex
CREATE INDEX "Project_createdAt_idx" ON "Project"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Clip_relativePath_key" ON "Clip"("relativePath");

-- CreateIndex
CREATE INDEX "Clip_projectId_createdAt_idx" ON "Clip"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDraft_projectId_key" ON "ContentDraft"("projectId");
