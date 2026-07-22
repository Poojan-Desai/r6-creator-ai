-- CreateTable
CREATE TABLE "ReferenceVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referenceType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "game" TEXT NOT NULL DEFAULT 'Rainbow Six Siege',
    "platform" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "youtubeVideoId" TEXT,
    "contentCategory" TEXT NOT NULL,
    "notes" TEXT,
    "permissionConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "permissionConfirmedAt" DATETIME,
    "originalFilename" TEXT,
    "sourceRelativePath" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" BIGINT,
    "durationSeconds" REAL,
    "width" INTEGER,
    "height" INTEGER,
    "frameRate" REAL,
    "thumbnailText" TEXT,
    "metadataSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "publicMetadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReferenceAudioTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referenceId" TEXT NOT NULL,
    "streamIndex" INTEGER NOT NULL,
    "codecName" TEXT NOT NULL,
    "channels" INTEGER NOT NULL,
    "channelLayout" TEXT,
    "language" TEXT,
    "title" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "preferenceScore" INTEGER NOT NULL DEFAULT 0,
    "preferenceReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReferenceAudioTrack_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "ReferenceVideo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferenceStyleAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referenceId" TEXT NOT NULL,
    "audioTrackId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'Waiting to start',
    "analyzerVersion" TEXT NOT NULL DEFAULT 'reference-style-v1',
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelRequestedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReferenceStyleAnalysis_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "ReferenceVideo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReferenceStyleAnalysis_audioTrackId_fkey" FOREIGN KEY ("audioTrackId") REFERENCES "ReferenceAudioTrack" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferenceTranscriptSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "segmentOrder" INTEGER NOT NULL,
    "startSeconds" REAL NOT NULL,
    "endSeconds" REAL NOT NULL,
    "text" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReferenceTranscriptSegment_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ReferenceStyleAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferenceStyleFeature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "originalValueJson" TEXT NOT NULL,
    "unit" TEXT,
    "confidence" REAL NOT NULL,
    "evidence" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "detectorVersion" TEXT NOT NULL,
    "manuallyCorrected" BOOLEAN NOT NULL DEFAULT false,
    "correctionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReferenceStyleFeature_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ReferenceStyleAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreatorStyleProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "preferredVideoLengthSeconds" REAL,
    "preferredHookLengthSeconds" REAL,
    "energyLevel" INTEGER NOT NULL DEFAULT 50,
    "humorLevel" INTEGER NOT NULL DEFAULT 50,
    "educationalLevel" INTEGER NOT NULL DEFAULT 50,
    "storytellingLevel" INTEGER NOT NULL DEFAULT 50,
    "setupAmount" INTEGER NOT NULL DEFAULT 50,
    "voiceoverAmount" INTEGER NOT NULL DEFAULT 50,
    "liveAudioAmount" INTEGER NOT NULL DEFAULT 50,
    "captionDensity" INTEGER NOT NULL DEFAULT 50,
    "cutFrequency" INTEGER NOT NULL DEFAULT 50,
    "reactionEmphasis" INTEGER NOT NULL DEFAULT 50,
    "titleStyle" TEXT NOT NULL DEFAULT 'Clear and original',
    "thumbnailTextStyle" TEXT NOT NULL DEFAULT 'Short and readable',
    "wordsToAvoid" TEXT NOT NULL DEFAULT '',
    "preferredPhrases" TEXT NOT NULL DEFAULT '',
    "profanityPreference" TEXT NOT NULL DEFAULT 'CENSOR',
    "perspective" TEXT NOT NULL DEFAULT 'FIRST_PERSON',
    "profileVersion" TEXT NOT NULL DEFAULT 'structured-v1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StyleProfileReference" (
    "profileId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("profileId", "referenceId"),
    CONSTRAINT "StyleProfileReference_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CreatorStyleProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StyleProfileReference_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "ReferenceVideo" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StyleProfileFeature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceReferenceCount" INTEGER NOT NULL,
    "manuallyCorrected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StyleProfileFeature_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CreatorStyleProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceVideo_youtubeVideoId_key" ON "ReferenceVideo"("youtubeVideoId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceVideo_sourceRelativePath_key" ON "ReferenceVideo"("sourceRelativePath");

-- CreateIndex
CREATE INDEX "ReferenceVideo_referenceType_createdAt_idx" ON "ReferenceVideo"("referenceType", "createdAt");

-- CreateIndex
CREATE INDEX "ReferenceVideo_contentCategory_idx" ON "ReferenceVideo"("contentCategory");

-- CreateIndex
CREATE INDEX "ReferenceAudioTrack_referenceId_streamIndex_idx" ON "ReferenceAudioTrack"("referenceId", "streamIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceAudioTrack_referenceId_streamIndex_key" ON "ReferenceAudioTrack"("referenceId", "streamIndex");

-- CreateIndex
CREATE INDEX "ReferenceStyleAnalysis_referenceId_createdAt_idx" ON "ReferenceStyleAnalysis"("referenceId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferenceStyleAnalysis_status_idx" ON "ReferenceStyleAnalysis"("status");

-- CreateIndex
CREATE INDEX "ReferenceTranscriptSegment_analysisId_startSeconds_idx" ON "ReferenceTranscriptSegment"("analysisId", "startSeconds");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceTranscriptSegment_analysisId_segmentOrder_key" ON "ReferenceTranscriptSegment"("analysisId", "segmentOrder");

-- CreateIndex
CREATE INDEX "ReferenceStyleFeature_analysisId_key_idx" ON "ReferenceStyleFeature"("analysisId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceStyleFeature_analysisId_key_key" ON "ReferenceStyleFeature"("analysisId", "key");

-- CreateIndex
CREATE INDEX "CreatorStyleProfile_createdAt_idx" ON "CreatorStyleProfile"("createdAt");

-- CreateIndex
CREATE INDEX "StyleProfileReference_referenceId_idx" ON "StyleProfileReference"("referenceId");

-- CreateIndex
CREATE INDEX "StyleProfileFeature_profileId_key_idx" ON "StyleProfileFeature"("profileId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "StyleProfileFeature_profileId_key_key" ON "StyleProfileFeature"("profileId", "key");
