-- CreateTable
CREATE TABLE "GameDataVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "game" TEXT NOT NULL DEFAULT 'Rainbow Six Siege',
    "year" INTEGER NOT NULL,
    "seasonName" TEXT NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "releaseDate" DATETIME NOT NULL,
    "verificationDate" DATETIME NOT NULL,
    "notes" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SiegeMap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "officialDescription" TEXT NOT NULL,
    "location" TEXT,
    "releaseLabel" TEXT NOT NULL,
    "releaseDate" DATETIME,
    "modernizationLabel" TEXT,
    "modernizationDate" DATETIME,
    "knowledgeStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "sourceType" TEXT NOT NULL DEFAULT 'OFFICIAL',
    "officialSourceUrl" TEXT NOT NULL,
    "officialSourceTitle" TEXT NOT NULL,
    "retrievedAt" DATETIME NOT NULL,
    "lastVerifiedAt" DATETIME NOT NULL,
    "officialBlueprintAvailable" BOOLEAN NOT NULL DEFAULT false,
    "officialBlueprintPageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MapAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "calloutKind" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "confidence" REAL NOT NULL DEFAULT 1,
    "lastVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MapAlias_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "SiegeMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "gameDataVersionId" TEXT,
    "parentVersionId" TEXT,
    "versionKey" TEXT NOT NULL,
    "versionName" TEXT NOT NULL,
    "effectiveDate" DATETIME,
    "knowledgeStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "sourceType" TEXT NOT NULL DEFAULT 'OFFICIAL',
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "notes" TEXT,
    "lastVerifiedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MapVersion_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "SiegeMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapVersion_gameDataVersionId_fkey" FOREIGN KEY ("gameDataVersionId") REFERENCES "GameDataVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MapVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "MapVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapPlaylistStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapId" TEXT NOT NULL,
    "gameDataVersionId" TEXT NOT NULL,
    "playlist" TEXT NOT NULL,
    "availability" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'OFFICIAL',
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "notes" TEXT,
    "lastVerifiedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MapPlaylistStatus_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "SiegeMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapPlaylistStatus_gameDataVersionId_fkey" FOREIGN KEY ("gameDataVersionId") REFERENCES "GameDataVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapFloor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "mapVersionId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "shortName" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "elevation" INTEGER NOT NULL DEFAULT 0,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "confidence" REAL NOT NULL DEFAULT 1,
    "notes" TEXT,
    "lastVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MapFloor_mapVersionId_fkey" FOREIGN KEY ("mapVersionId") REFERENCES "MapVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapElement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "mapVersionId" TEXT NOT NULL,
    "floorId" TEXT,
    "elementType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "canonicalCallout" TEXT,
    "calloutKind" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "geometryType" TEXT NOT NULL DEFAULT 'NONE',
    "geometryJson" TEXT NOT NULL DEFAULT '[]',
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "confidence" REAL NOT NULL DEFAULT 1,
    "notes" TEXT,
    "commonAttackerApproach" TEXT,
    "commonDefenderHold" TEXT,
    "commonFlankRisk" TEXT,
    "captionName" TEXT,
    "voiceoverName" TEXT,
    "lastVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MapElement_mapVersionId_fkey" FOREIGN KEY ("mapVersionId") REFERENCES "MapVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapElement_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "MapFloor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapElementAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "elementId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "calloutKind" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "confidence" REAL NOT NULL DEFAULT 1,
    "notes" TEXT,
    "lastVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MapElementAlias_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "MapElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "mapVersionId" TEXT NOT NULL,
    "fromElementId" TEXT NOT NULL,
    "toElementId" TEXT NOT NULL,
    "connectionType" TEXT NOT NULL,
    "isBidirectional" BOOLEAN NOT NULL DEFAULT true,
    "traversable" BOOLEAN NOT NULL DEFAULT true,
    "destructible" BOOLEAN NOT NULL DEFAULT false,
    "floorChange" BOOLEAN NOT NULL DEFAULT false,
    "requiredAction" TEXT,
    "notes" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "confidence" REAL NOT NULL DEFAULT 1,
    "lastVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MapConnection_mapVersionId_fkey" FOREIGN KEY ("mapVersionId") REFERENCES "MapVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapConnection_fromElementId_fkey" FOREIGN KEY ("fromElementId") REFERENCES "MapElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapConnection_toElementId_fkey" FOREIGN KEY ("toElementId") REFERENCES "MapElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapBombSitePair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "mapVersionId" TEXT NOT NULL,
    "floorId" TEXT,
    "displayName" TEXT NOT NULL,
    "siteAName" TEXT NOT NULL,
    "siteBName" TEXT NOT NULL,
    "tacticalNotes" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "confidence" REAL NOT NULL DEFAULT 1,
    "lastVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MapBombSitePair_mapVersionId_fkey" FOREIGN KEY ("mapVersionId") REFERENCES "MapVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapBombSitePair_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "MapFloor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapBombSiteElement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bombSiteId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MapBombSiteElement_bombSiteId_fkey" FOREIGN KEY ("bombSiteId") REFERENCES "MapBombSitePair" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapBombSiteElement_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "MapElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BlueprintAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "mapVersionId" TEXT NOT NULL,
    "floorId" TEXT,
    "parentAssetId" TEXT,
    "assetKind" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sourceType" TEXT NOT NULL DEFAULT 'IMPORTED',
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "notes" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" DATETIME,
    CONSTRAINT "BlueprintAsset_mapVersionId_fkey" FOREIGN KEY ("mapVersionId") REFERENCES "MapVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BlueprintAsset_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "MapFloor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BlueprintAsset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "BlueprintAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapSourceCitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "mapId" TEXT,
    "mapVersionId" TEXT,
    "floorId" TEXT,
    "elementId" TEXT,
    "bombSiteId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "retrievedAt" DATETIME NOT NULL,
    "lastVerifiedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MapSourceCitation_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "SiegeMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapSourceCitation_mapVersionId_fkey" FOREIGN KEY ("mapVersionId") REFERENCES "MapVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapSourceCitation_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "MapFloor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapSourceCitation_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "MapElement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MapSourceCitation_bombSiteId_fkey" FOREIGN KEY ("bombSiteId") REFERENCES "MapBombSitePair" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapCalloutPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapId" TEXT NOT NULL,
    "preferredKind" TEXT NOT NULL DEFAULT 'OFFICIAL',
    "customNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MapCalloutPreference_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "SiegeMap" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectMapContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "mapId" TEXT,
    "mapVersionId" TEXT,
    "bombSiteId" TEXT,
    "side" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "startingRoomId" TEXT,
    "importantRoomIdsJson" TEXT NOT NULL DEFAULT '[]',
    "operator" TEXT,
    "roundResult" TEXT,
    "userConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confidence" REAL NOT NULL DEFAULT 1,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectMapContext_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectMapContext_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "SiegeMap" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProjectMapContext_mapVersionId_fkey" FOREIGN KEY ("mapVersionId") REFERENCES "MapVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProjectMapContext_bombSiteId_fkey" FOREIGN KEY ("bombSiteId") REFERENCES "MapBombSitePair" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProjectMapContext_startingRoomId_fkey" FOREIGN KEY ("startingRoomId") REFERENCES "MapElement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapEditHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mapVersionId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityStableId" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "undoGroup" TEXT NOT NULL,
    "revertedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MapEditHistory_mapVersionId_fkey" FOREIGN KEY ("mapVersionId") REFERENCES "MapVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MapUpdateCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameDataVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY_FOR_MANUAL_REVIEW',
    "sourceUrlsJson" TEXT NOT NULL,
    "findingsJson" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "MapUpdateCheck_gameDataVersionId_fkey" FOREIGN KEY ("gameDataVersionId") REFERENCES "GameDataVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GameDataVersion_stableId_key" ON "GameDataVersion"("stableId");

-- CreateIndex
CREATE INDEX "GameDataVersion_year_seasonNumber_idx" ON "GameDataVersion"("year", "seasonNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SiegeMap_stableId_key" ON "SiegeMap"("stableId");

-- CreateIndex
CREATE UNIQUE INDEX "SiegeMap_slug_key" ON "SiegeMap"("slug");

-- CreateIndex
CREATE INDEX "SiegeMap_name_idx" ON "SiegeMap"("name");

-- CreateIndex
CREATE INDEX "SiegeMap_knowledgeStatus_idx" ON "SiegeMap"("knowledgeStatus");

-- CreateIndex
CREATE INDEX "MapAlias_normalizedName_idx" ON "MapAlias"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "MapAlias_mapId_normalizedName_key" ON "MapAlias"("mapId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "MapVersion_stableId_key" ON "MapVersion"("stableId");

-- CreateIndex
CREATE INDEX "MapVersion_mapId_knowledgeStatus_idx" ON "MapVersion"("mapId", "knowledgeStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MapVersion_mapId_versionKey_key" ON "MapVersion"("mapId", "versionKey");

-- CreateIndex
CREATE INDEX "MapPlaylistStatus_playlist_availability_idx" ON "MapPlaylistStatus"("playlist", "availability");

-- CreateIndex
CREATE UNIQUE INDEX "MapPlaylistStatus_mapId_gameDataVersionId_playlist_key" ON "MapPlaylistStatus"("mapId", "gameDataVersionId", "playlist");

-- CreateIndex
CREATE UNIQUE INDEX "MapFloor_stableId_key" ON "MapFloor"("stableId");

-- CreateIndex
CREATE INDEX "MapFloor_mapVersionId_sortOrder_idx" ON "MapFloor"("mapVersionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MapFloor_mapVersionId_displayName_key" ON "MapFloor"("mapVersionId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "MapElement_stableId_key" ON "MapElement"("stableId");

-- CreateIndex
CREATE INDEX "MapElement_mapVersionId_elementType_idx" ON "MapElement"("mapVersionId", "elementType");

-- CreateIndex
CREATE INDEX "MapElement_floorId_elementType_idx" ON "MapElement"("floorId", "elementType");

-- CreateIndex
CREATE UNIQUE INDEX "MapElement_mapVersionId_displayName_elementType_key" ON "MapElement"("mapVersionId", "displayName", "elementType");

-- CreateIndex
CREATE INDEX "MapElementAlias_normalizedName_idx" ON "MapElementAlias"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "MapElementAlias_elementId_normalizedName_key" ON "MapElementAlias"("elementId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "MapConnection_stableId_key" ON "MapConnection"("stableId");

-- CreateIndex
CREATE INDEX "MapConnection_fromElementId_idx" ON "MapConnection"("fromElementId");

-- CreateIndex
CREATE INDEX "MapConnection_toElementId_idx" ON "MapConnection"("toElementId");

-- CreateIndex
CREATE UNIQUE INDEX "MapConnection_mapVersionId_fromElementId_toElementId_connectionType_key" ON "MapConnection"("mapVersionId", "fromElementId", "toElementId", "connectionType");

-- CreateIndex
CREATE UNIQUE INDEX "MapBombSitePair_stableId_key" ON "MapBombSitePair"("stableId");

-- CreateIndex
CREATE INDEX "MapBombSitePair_mapVersionId_floorId_idx" ON "MapBombSitePair"("mapVersionId", "floorId");

-- CreateIndex
CREATE UNIQUE INDEX "MapBombSitePair_mapVersionId_displayName_key" ON "MapBombSitePair"("mapVersionId", "displayName");

-- CreateIndex
CREATE INDEX "MapBombSiteElement_elementId_idx" ON "MapBombSiteElement"("elementId");

-- CreateIndex
CREATE UNIQUE INDEX "MapBombSiteElement_bombSiteId_elementId_role_key" ON "MapBombSiteElement"("bombSiteId", "elementId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintAsset_stableId_key" ON "BlueprintAsset"("stableId");

-- CreateIndex
CREATE UNIQUE INDEX "BlueprintAsset_relativePath_key" ON "BlueprintAsset"("relativePath");

-- CreateIndex
CREATE INDEX "BlueprintAsset_mapVersionId_assetKind_idx" ON "BlueprintAsset"("mapVersionId", "assetKind");

-- CreateIndex
CREATE INDEX "BlueprintAsset_floorId_idx" ON "BlueprintAsset"("floorId");

-- CreateIndex
CREATE UNIQUE INDEX "MapSourceCitation_stableId_key" ON "MapSourceCitation"("stableId");

-- CreateIndex
CREATE INDEX "MapSourceCitation_mapId_idx" ON "MapSourceCitation"("mapId");

-- CreateIndex
CREATE INDEX "MapSourceCitation_mapVersionId_idx" ON "MapSourceCitation"("mapVersionId");

-- CreateIndex
CREATE INDEX "MapSourceCitation_elementId_idx" ON "MapSourceCitation"("elementId");

-- CreateIndex
CREATE INDEX "MapSourceCitation_bombSiteId_idx" ON "MapSourceCitation"("bombSiteId");

-- CreateIndex
CREATE UNIQUE INDEX "MapCalloutPreference_mapId_key" ON "MapCalloutPreference"("mapId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMapContext_projectId_key" ON "ProjectMapContext"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMapContext_mapId_mapVersionId_idx" ON "ProjectMapContext"("mapId", "mapVersionId");

-- CreateIndex
CREATE INDEX "MapEditHistory_mapVersionId_createdAt_idx" ON "MapEditHistory"("mapVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "MapEditHistory_undoGroup_idx" ON "MapEditHistory"("undoGroup");

-- CreateIndex
CREATE INDEX "MapUpdateCheck_gameDataVersionId_requestedAt_idx" ON "MapUpdateCheck"("gameDataVersionId", "requestedAt");
