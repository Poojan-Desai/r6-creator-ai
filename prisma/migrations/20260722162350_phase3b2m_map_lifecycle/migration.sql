-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SiegeMap" (
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
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
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
INSERT INTO "new_SiegeMap" ("createdAt", "id", "knowledgeStatus", "lastVerifiedAt", "location", "modernizationDate", "modernizationLabel", "name", "officialBlueprintAvailable", "officialBlueprintPageUrl", "officialDescription", "officialSourceTitle", "officialSourceUrl", "releaseDate", "releaseLabel", "retrievedAt", "slug", "sourceType", "stableId", "updatedAt") SELECT "createdAt", "id", "knowledgeStatus", "lastVerifiedAt", "location", "modernizationDate", "modernizationLabel", "name", "officialBlueprintAvailable", "officialBlueprintPageUrl", "officialDescription", "officialSourceTitle", "officialSourceUrl", "releaseDate", "releaseLabel", "retrievedAt", "slug", "sourceType", "stableId", "updatedAt" FROM "SiegeMap";
DROP TABLE "SiegeMap";
ALTER TABLE "new_SiegeMap" RENAME TO "SiegeMap";
CREATE UNIQUE INDEX "SiegeMap_stableId_key" ON "SiegeMap"("stableId");
CREATE UNIQUE INDEX "SiegeMap_slug_key" ON "SiegeMap"("slug");
CREATE INDEX "SiegeMap_name_idx" ON "SiegeMap"("name");
CREATE INDEX "SiegeMap_knowledgeStatus_idx" ON "SiegeMap"("knowledgeStatus");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
