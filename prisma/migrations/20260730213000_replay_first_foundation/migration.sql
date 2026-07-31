-- CreateTable
CREATE TABLE "ReplayPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IMPORTING',
    "permissionConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "permissionConfirmedAt" DATETIME,
    "privacyMode" TEXT NOT NULL DEFAULT 'ALIASES',
    "retentionPreference" TEXT NOT NULL DEFAULT 'KEEP_EVERYTHING',
    "notes" TEXT,
    "sourceKind" TEXT NOT NULL,
    "sourceArchiveRelativePath" TEXT,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "roundFileCount" INTEGER NOT NULL DEFAULT 0,
    "totalSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "packageFingerprintSha256" TEXT NOT NULL,
    "detectedReplayVersion" TEXT,
    "detectedGameVersion" TEXT,
    "activeProviderId" TEXT,
    "activeProviderVersion" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReplayPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReplayFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "replayPackageId" TEXT NOT NULL,
    "stableFileId" TEXT NOT NULL,
    "safeDisplayName" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "fingerprintSha256" TEXT NOT NULL,
    "roundIndex" INTEGER,
    "detectedVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReplayFile_replayPackageId_fkey" FOREIGN KEY ("replayPackageId") REFERENCES "ReplayPackage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReplayProviderRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "replayPackageId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerVersion" TEXT NOT NULL,
    "providerCommit" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'Waiting to start',
    "rawOutputRelativePath" TEXT,
    "stdoutPreview" TEXT,
    "stderrPreview" TEXT,
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "cancelRequestedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "processingDurationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReplayProviderRun_replayPackageId_fkey" FOREIGN KEY ("replayPackageId") REFERENCES "ReplayPackage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReplayCapability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "replayPackageId" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "providerId" TEXT,
    "providerVersion" TEXT,
    "evidenceSummary" TEXT NOT NULL,
    "missingReason" TEXT,
    "populatedCount" INTEGER,
    "confidence" REAL,
    "lastEvaluatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReplayCapability_replayPackageId_fkey" FOREIGN KEY ("replayPackageId") REFERENCES "ReplayPackage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CanonicalMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "replayPackageId" TEXT NOT NULL,
    "videoProjectId" TEXT,
    "replayLocalMatchId" TEXT,
    "gameVersion" TEXT,
    "matchTimestamp" DATETIME,
    "mapName" TEXT,
    "gameMode" TEXT,
    "matchType" TEXT,
    "recordingPlayerStableId" TEXT,
    "finalScoreSummary" TEXT,
    "finalResult" TEXT,
    "sourceProviderId" TEXT NOT NULL,
    "sourceProviderVersion" TEXT NOT NULL,
    "confidenceStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "validationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "conflictingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "missingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "userCorrectionJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CanonicalMatch_replayPackageId_fkey" FOREIGN KEY ("replayPackageId") REFERENCES "ReplayPackage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CanonicalMatch_videoProjectId_fkey" FOREIGN KEY ("videoProjectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CanonicalRound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "side" TEXT,
    "site" TEXT,
    "startSeconds" REAL,
    "endSeconds" REAL,
    "durationSeconds" REAL,
    "scoreBefore" TEXT,
    "scoreAfter" TEXT,
    "winner" TEXT,
    "winCondition" TEXT,
    "overtimeState" TEXT,
    "sourceProviderId" TEXT NOT NULL,
    "sourceProviderVersion" TEXT NOT NULL,
    "confidenceStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "validationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "conflictingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "missingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "userCorrectionJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CanonicalRound_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "CanonicalMatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CanonicalPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "replayLocalPlayerId" TEXT NOT NULL,
    "privacyAlias" TEXT NOT NULL,
    "localDisplayName" TEXT,
    "profileHash" TEXT,
    "teamIndex" INTEGER,
    "side" TEXT,
    "operatorName" TEXT,
    "isRecordingPlayer" BOOLEAN NOT NULL DEFAULT false,
    "sourceProviderId" TEXT NOT NULL,
    "sourceProviderVersion" TEXT NOT NULL,
    "confidenceStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "validationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "conflictingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "missingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "userCorrectionJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CanonicalPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "CanonicalMatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CanonicalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "roundId" TEXT,
    "category" TEXT NOT NULL,
    "timestampSeconds" REAL,
    "actorPlayerId" TEXT,
    "targetPlayerId" TEXT,
    "directObservationJson" TEXT NOT NULL,
    "inferenceJson" TEXT NOT NULL DEFAULT '{}',
    "confidenceStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "validationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "conflictingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "missingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "userCorrectionJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CanonicalEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "CanonicalMatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CanonicalEvent_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CanonicalRound" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CanonicalEvent_actorPlayerId_fkey" FOREIGN KEY ("actorPlayerId") REFERENCES "CanonicalPlayer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CanonicalEvent_targetPlayerId_fkey" FOREIGN KEY ("targetPlayerId") REFERENCES "CanonicalPlayer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CanonicalEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "evidenceClass" TEXT NOT NULL,
    "sourceProviderId" TEXT NOT NULL,
    "sourceProviderVersion" TEXT NOT NULL,
    "sourceFileStableId" TEXT,
    "sourceReference" TEXT NOT NULL,
    "directObservationJson" TEXT NOT NULL,
    "inferenceJson" TEXT NOT NULL DEFAULT '{}',
    "confidenceStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "validationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "conflictingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "missingEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CanonicalEvidence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CanonicalEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReplayPackage_sourceArchiveRelativePath_key" ON "ReplayPackage"("sourceArchiveRelativePath");
CREATE UNIQUE INDEX "ReplayPackage_packageFingerprintSha256_key" ON "ReplayPackage"("packageFingerprintSha256");
CREATE INDEX "ReplayPackage_createdAt_idx" ON "ReplayPackage"("createdAt");
CREATE INDEX "ReplayPackage_status_idx" ON "ReplayPackage"("status");
CREATE INDEX "ReplayPackage_projectId_idx" ON "ReplayPackage"("projectId");
CREATE UNIQUE INDEX "ReplayFile_relativePath_key" ON "ReplayFile"("relativePath");
CREATE INDEX "ReplayFile_replayPackageId_roundIndex_idx" ON "ReplayFile"("replayPackageId", "roundIndex");
CREATE UNIQUE INDEX "ReplayFile_replayPackageId_stableFileId_key" ON "ReplayFile"("replayPackageId", "stableFileId");
CREATE UNIQUE INDEX "ReplayFile_replayPackageId_fingerprintSha256_key" ON "ReplayFile"("replayPackageId", "fingerprintSha256");
CREATE UNIQUE INDEX "ReplayProviderRun_rawOutputRelativePath_key" ON "ReplayProviderRun"("rawOutputRelativePath");
CREATE INDEX "ReplayProviderRun_replayPackageId_createdAt_idx" ON "ReplayProviderRun"("replayPackageId", "createdAt");
CREATE INDEX "ReplayProviderRun_status_idx" ON "ReplayProviderRun"("status");
CREATE INDEX "ReplayProviderRun_providerId_providerVersion_idx" ON "ReplayProviderRun"("providerId", "providerVersion");
CREATE INDEX "ReplayCapability_replayPackageId_state_idx" ON "ReplayCapability"("replayPackageId", "state");
CREATE UNIQUE INDEX "ReplayCapability_replayPackageId_capabilityKey_key" ON "ReplayCapability"("replayPackageId", "capabilityKey");
CREATE UNIQUE INDEX "CanonicalMatch_stableId_key" ON "CanonicalMatch"("stableId");
CREATE UNIQUE INDEX "CanonicalMatch_replayPackageId_key" ON "CanonicalMatch"("replayPackageId");
CREATE INDEX "CanonicalMatch_videoProjectId_idx" ON "CanonicalMatch"("videoProjectId");
CREATE INDEX "CanonicalMatch_mapName_gameMode_idx" ON "CanonicalMatch"("mapName", "gameMode");
CREATE UNIQUE INDEX "CanonicalRound_stableId_key" ON "CanonicalRound"("stableId");
CREATE INDEX "CanonicalRound_matchId_startSeconds_idx" ON "CanonicalRound"("matchId", "startSeconds");
CREATE UNIQUE INDEX "CanonicalRound_matchId_roundIndex_key" ON "CanonicalRound"("matchId", "roundIndex");
CREATE UNIQUE INDEX "CanonicalPlayer_stableId_key" ON "CanonicalPlayer"("stableId");
CREATE INDEX "CanonicalPlayer_matchId_teamIndex_idx" ON "CanonicalPlayer"("matchId", "teamIndex");
CREATE UNIQUE INDEX "CanonicalPlayer_matchId_replayLocalPlayerId_key" ON "CanonicalPlayer"("matchId", "replayLocalPlayerId");
CREATE UNIQUE INDEX "CanonicalEvent_stableId_key" ON "CanonicalEvent"("stableId");
CREATE INDEX "CanonicalEvent_matchId_timestampSeconds_idx" ON "CanonicalEvent"("matchId", "timestampSeconds");
CREATE INDEX "CanonicalEvent_roundId_timestampSeconds_idx" ON "CanonicalEvent"("roundId", "timestampSeconds");
CREATE INDEX "CanonicalEvent_category_idx" ON "CanonicalEvent"("category");
CREATE INDEX "CanonicalEvidence_eventId_evidenceClass_idx" ON "CanonicalEvidence"("eventId", "evidenceClass");
CREATE INDEX "CanonicalEvidence_sourceProviderId_sourceProviderVersion_idx" ON "CanonicalEvidence"("sourceProviderId", "sourceProviderVersion");
