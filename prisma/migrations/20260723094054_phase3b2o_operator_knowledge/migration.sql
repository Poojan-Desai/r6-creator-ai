-- CreateTable
CREATE TABLE "SiegeOperator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "squad" TEXT,
    "releaseSeason" TEXT,
    "operatorDataVersion" TEXT NOT NULL DEFAULT 'y11s2-2026-07-22',
    "knowledgeStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "sourceType" TEXT NOT NULL DEFAULT 'OFFICIAL',
    "officialSourceUrl" TEXT NOT NULL,
    "officialSourceTitle" TEXT NOT NULL,
    "retrievedAt" DATETIME NOT NULL,
    "lastVerifiedAt" DATETIME NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OperatorAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'USER_ENTERED',
    "confidence" REAL NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperatorAlias_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "SiegeOperator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperatorVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "gameDataVersionId" TEXT,
    "parentVersionId" TEXT,
    "versionKey" TEXT NOT NULL,
    "versionName" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "effectiveDate" DATETIME,
    "squad" TEXT,
    "speed" INTEGER,
    "armorOrHealth" INTEGER,
    "difficulty" INTEGER,
    "officialSpecialtiesJson" TEXT NOT NULL DEFAULT '[]',
    "officialAbilityName" TEXT,
    "officialAbilitySummary" TEXT,
    "plainLanguageExplanation" TEXT,
    "structuredAbilityJson" TEXT NOT NULL DEFAULT '{}',
    "strengthsJson" TEXT NOT NULL DEFAULT '[]',
    "limitationsJson" TEXT NOT NULL DEFAULT '[]',
    "commonUsesJson" TEXT NOT NULL DEFAULT '[]',
    "contentUsesJson" TEXT NOT NULL DEFAULT '[]',
    "tacticalNotes" TEXT,
    "knowledgeStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "sourceType" TEXT NOT NULL DEFAULT 'OFFICIAL',
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "lastVerifiedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperatorVersion_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "SiegeOperator" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperatorVersion_gameDataVersionId_fkey" FOREIGN KEY ("gameDataVersionId") REFERENCES "GameDataVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OperatorVersion_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "OperatorVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperatorAbility" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "abilityType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperatorAbility_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "SiegeOperator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperatorAbilityVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "abilityId" TEXT NOT NULL,
    "operatorVersionId" TEXT NOT NULL,
    "versionKey" TEXT NOT NULL,
    "deploymentMethod" TEXT,
    "activationMethod" TEXT,
    "validTargetsJson" TEXT NOT NULL DEFAULT '[]',
    "effectsJson" TEXT NOT NULL DEFAULT '{}',
    "limitationsJson" TEXT NOT NULL DEFAULT '[]',
    "durationSeconds" REAL,
    "rangeMeters" REAL,
    "numberOfUses" INTEGER,
    "cooldownSeconds" REAL,
    "damage" REAL,
    "healing" REAL,
    "destructionMethod" TEXT,
    "disableMethod" TEXT,
    "counterConditionsJson" TEXT NOT NULL DEFAULT '[]',
    "friendlyFireBehavior" TEXT,
    "commonMisconceptionsJson" TEXT NOT NULL DEFAULT '[]',
    "sourceType" TEXT NOT NULL DEFAULT 'OFFICIAL',
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "lastVerifiedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperatorAbilityVersion_abilityId_fkey" FOREIGN KEY ("abilityId") REFERENCES "OperatorAbility" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperatorAbilityVersion_operatorVersionId_fkey" FOREIGN KEY ("operatorVersionId") REFERENCES "OperatorVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperatorRoleAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorVersionId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "roleSource" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperatorRoleAssignment_operatorVersionId_fkey" FOREIGN KEY ("operatorVersionId") REFERENCES "OperatorVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperatorGadget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gadgetCategory" TEXT NOT NULL,
    "side" TEXT,
    "primaryPurpose" TEXT,
    "deploymentBehavior" TEXT,
    "effectJson" TEXT NOT NULL DEFAULT '{}',
    "counterMethodsJson" TEXT NOT NULL DEFAULT '[]',
    "tacticalUsesJson" TEXT NOT NULL DEFAULT '[]',
    "visualCluesJson" TEXT NOT NULL DEFAULT '[]',
    "audioCluesJson" TEXT NOT NULL DEFAULT '[]',
    "sourceType" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "versionKey" TEXT NOT NULL,
    "lastVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OperatorLoadoutItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorVersionId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "weaponCategory" TEXT,
    "gadgetId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperatorLoadoutItem_operatorVersionId_fkey" FOREIGN KEY ("operatorVersionId") REFERENCES "OperatorVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperatorLoadoutItem_gadgetId_fkey" FOREIGN KEY ("gadgetId") REFERENCES "OperatorGadget" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperatorInteraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "sourceOperatorId" TEXT NOT NULL,
    "sourceOperatorVersionId" TEXT,
    "targetOperatorId" TEXT,
    "targetOperatorVersionId" TEXT,
    "targetAbilityId" TEXT,
    "targetGadgetId" TEXT,
    "category" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'SOURCE_TO_TARGET',
    "conditions" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "limitations" TEXT,
    "environmentRequirements" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "confidence" REAL NOT NULL DEFAULT 1,
    "lastVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperatorInteraction_sourceOperatorId_fkey" FOREIGN KEY ("sourceOperatorId") REFERENCES "SiegeOperator" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperatorInteraction_sourceOperatorVersionId_fkey" FOREIGN KEY ("sourceOperatorVersionId") REFERENCES "OperatorVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OperatorInteraction_targetOperatorId_fkey" FOREIGN KEY ("targetOperatorId") REFERENCES "SiegeOperator" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OperatorInteraction_targetOperatorVersionId_fkey" FOREIGN KEY ("targetOperatorVersionId") REFERENCES "OperatorVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OperatorInteraction_targetAbilityId_fkey" FOREIGN KEY ("targetAbilityId") REFERENCES "OperatorAbility" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OperatorInteraction_targetGadgetId_fkey" FOREIGN KEY ("targetGadgetId") REFERENCES "OperatorGadget" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperatorMapLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "operatorVersionId" TEXT NOT NULL,
    "mapVersionId" TEXT NOT NULL,
    "floorId" TEXT,
    "roomId" TEXT,
    "bombSiteId" TEXT,
    "tacticalPurpose" TEXT NOT NULL,
    "requiredConditions" TEXT,
    "notes" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'USER_ENTERED',
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "confidence" REAL NOT NULL DEFAULT 1,
    "lastVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperatorMapLink_operatorVersionId_fkey" FOREIGN KEY ("operatorVersionId") REFERENCES "OperatorVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperatorMapLink_mapVersionId_fkey" FOREIGN KEY ("mapVersionId") REFERENCES "MapVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OperatorMapLink_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "MapFloor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OperatorMapLink_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "MapElement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OperatorMapLink_bombSiteId_fkey" FOREIGN KEY ("bombSiteId") REFERENCES "MapBombSitePair" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperatorSourceCitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stableId" TEXT NOT NULL,
    "operatorVersionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "retrievedAt" DATETIME NOT NULL,
    "lastVerifiedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperatorSourceCitation_operatorVersionId_fkey" FOREIGN KEY ("operatorVersionId") REFERENCES "OperatorVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectOperatorContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "playerOperatorId" TEXT,
    "operatorVersionId" TEXT,
    "teamOperatorIdsJson" TEXT NOT NULL DEFAULT '[]',
    "enemyOperatorIdsJson" TEXT NOT NULL DEFAULT '[]',
    "side" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "uniqueAbilityUsed" TEXT,
    "secondaryGadgetUsed" TEXT,
    "abilityUseTimestamp" REAL,
    "abilityResult" TEXT,
    "target" TEXT,
    "abilitySucceeded" BOOLEAN,
    "tacticalPurpose" TEXT,
    "userNotes" TEXT,
    "userConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectOperatorContext_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectOperatorContext_playerOperatorId_fkey" FOREIGN KEY ("playerOperatorId") REFERENCES "SiegeOperator" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProjectOperatorContext_operatorVersionId_fkey" FOREIGN KEY ("operatorVersionId") REFERENCES "OperatorVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperatorUpdateReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameDataVersionId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "retrievedAt" DATETIME NOT NULL,
    "proposedChangesJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY_FOR_MANUAL_REVIEW',
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OperatorUpdateReview_gameDataVersionId_fkey" FOREIGN KEY ("gameDataVersionId") REFERENCES "GameDataVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SiegeOperator_stableId_key" ON "SiegeOperator"("stableId");

-- CreateIndex
CREATE UNIQUE INDEX "SiegeOperator_slug_key" ON "SiegeOperator"("slug");

-- CreateIndex
CREATE INDEX "SiegeOperator_displayName_idx" ON "SiegeOperator"("displayName");

-- CreateIndex
CREATE INDEX "SiegeOperator_side_knowledgeStatus_idx" ON "SiegeOperator"("side", "knowledgeStatus");

-- CreateIndex
CREATE INDEX "OperatorAlias_normalizedName_idx" ON "OperatorAlias"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorAlias_operatorId_normalizedName_key" ON "OperatorAlias"("operatorId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorVersion_stableId_key" ON "OperatorVersion"("stableId");

-- CreateIndex
CREATE INDEX "OperatorVersion_operatorId_isCurrent_idx" ON "OperatorVersion"("operatorId", "isCurrent");

-- CreateIndex
CREATE INDEX "OperatorVersion_knowledgeStatus_idx" ON "OperatorVersion"("knowledgeStatus");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorVersion_operatorId_versionKey_key" ON "OperatorVersion"("operatorId", "versionKey");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorAbility_stableId_key" ON "OperatorAbility"("stableId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorAbility_operatorId_canonicalName_key" ON "OperatorAbility"("operatorId", "canonicalName");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorAbilityVersion_stableId_key" ON "OperatorAbilityVersion"("stableId");

-- CreateIndex
CREATE INDEX "OperatorAbilityVersion_operatorVersionId_idx" ON "OperatorAbilityVersion"("operatorVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorAbilityVersion_abilityId_operatorVersionId_key" ON "OperatorAbilityVersion"("abilityId", "operatorVersionId");

-- CreateIndex
CREATE INDEX "OperatorRoleAssignment_roleKey_roleSource_idx" ON "OperatorRoleAssignment"("roleKey", "roleSource");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorRoleAssignment_operatorVersionId_roleKey_roleSource_key" ON "OperatorRoleAssignment"("operatorVersionId", "roleKey", "roleSource");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorGadget_stableId_key" ON "OperatorGadget"("stableId");

-- CreateIndex
CREATE INDEX "OperatorGadget_name_idx" ON "OperatorGadget"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorGadget_name_versionKey_key" ON "OperatorGadget"("name", "versionKey");

-- CreateIndex
CREATE INDEX "OperatorLoadoutItem_operatorVersionId_slot_idx" ON "OperatorLoadoutItem"("operatorVersionId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorLoadoutItem_operatorVersionId_slot_displayName_key" ON "OperatorLoadoutItem"("operatorVersionId", "slot", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorInteraction_stableId_key" ON "OperatorInteraction"("stableId");

-- CreateIndex
CREATE INDEX "OperatorInteraction_sourceOperatorId_category_idx" ON "OperatorInteraction"("sourceOperatorId", "category");

-- CreateIndex
CREATE INDEX "OperatorInteraction_targetOperatorId_category_idx" ON "OperatorInteraction"("targetOperatorId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorMapLink_stableId_key" ON "OperatorMapLink"("stableId");

-- CreateIndex
CREATE INDEX "OperatorMapLink_operatorVersionId_mapVersionId_idx" ON "OperatorMapLink"("operatorVersionId", "mapVersionId");

-- CreateIndex
CREATE INDEX "OperatorMapLink_mapVersionId_bombSiteId_idx" ON "OperatorMapLink"("mapVersionId", "bombSiteId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorSourceCitation_stableId_key" ON "OperatorSourceCitation"("stableId");

-- CreateIndex
CREATE INDEX "OperatorSourceCitation_operatorVersionId_idx" ON "OperatorSourceCitation"("operatorVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectOperatorContext_projectId_key" ON "ProjectOperatorContext"("projectId");
