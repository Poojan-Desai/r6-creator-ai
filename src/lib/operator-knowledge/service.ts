import type {
  OperatorInteractionCategory,
  OperatorKnowledgeSource,
  OperatorRoleSource,
  OperatorSide,
  Prisma,
  ProjectOperatorSide,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import {
  OFFICIAL_OPERATOR_DETAILS,
  OFFICIAL_OPERATOR_DIRECTORY_TITLE,
  OFFICIAL_OPERATOR_DIRECTORY_URL,
  OFFICIAL_OPERATOR_ROSTER,
  OPERATOR_DATA_RETRIEVED_AT,
  OPERATOR_DATA_VERSION,
  officialOperatorDetailUrl,
} from "@/lib/operator-knowledge/official-roster";

export const OPERATOR_EXPORT_SCHEMA_VERSION =
  "r6-creator-operator-knowledge/v1";
export const OPERATOR_DATABASE_EXPORT_SCHEMA_VERSION =
  "r6-creator-operator-knowledge-database/v1";

const now = new Date(OPERATOR_DATA_RETRIEVED_AT);

function displayRole(role: string) {
  return role
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function ensureOfficialOperatorRoster() {
  const count = await db.siegeOperator.count({
    where: { operatorDataVersion: OPERATOR_DATA_VERSION },
  });
  if (count >= OFFICIAL_OPERATOR_ROSTER.length) return;
  await db.$transaction(async (transaction) => {
    for (const entry of OFFICIAL_OPERATOR_ROSTER) {
      const detail = OFFICIAL_OPERATOR_DETAILS[entry.slug];
      const sourceUrl = detail
        ? officialOperatorDetailUrl(entry.slug)
        : OFFICIAL_OPERATOR_DIRECTORY_URL;
      const sourceTitle = detail
        ? `${entry.displayName} | Operators | Tom Clancy's Rainbow Six Siege | Ubisoft (US)`
        : OFFICIAL_OPERATOR_DIRECTORY_TITLE;
      const operator = await transaction.siegeOperator.upsert({
        where: { slug: entry.slug },
        create: {
          stableId: `r6-operator:${entry.slug}`,
          slug: entry.slug,
          canonicalName: entry.displayName,
          displayName: entry.displayName,
          side: entry.side,
          squad: detail?.squad,
          operatorDataVersion: OPERATOR_DATA_VERSION,
          knowledgeStatus: "CURRENT",
          sourceType: "OFFICIAL",
          officialSourceUrl: sourceUrl,
          officialSourceTitle: sourceTitle,
          retrievedAt: now,
          lastVerifiedAt: now,
          confidence: 1,
        },
        update: {
          displayName: entry.displayName,
          side: entry.side,
          squad: detail?.squad,
          operatorDataVersion: OPERATOR_DATA_VERSION,
          officialSourceUrl: sourceUrl,
          officialSourceTitle: sourceTitle,
          lastVerifiedAt: now,
        },
      });
      await transaction.operatorVersion.updateMany({
        where: {
          operatorId: operator.id,
          versionKey: { not: OPERATOR_DATA_VERSION },
          isCurrent: true,
        },
        data: { isCurrent: false, knowledgeStatus: "HISTORICAL" },
      });
      const version = await transaction.operatorVersion.upsert({
        where: {
          operatorId_versionKey: {
            operatorId: operator.id,
            versionKey: OPERATOR_DATA_VERSION,
          },
        },
        create: {
          stableId: `r6-operator:${entry.slug}:version:${OPERATOR_DATA_VERSION}`,
          operatorId: operator.id,
          versionKey: OPERATOR_DATA_VERSION,
          versionName: "Year 11 Season 2 — retrieved 2026-07-22",
          isCurrent: true,
          effectiveDate: new Date("2026-06-02T00:00:00.000Z"),
          squad: detail?.squad,
          officialSpecialtiesJson: JSON.stringify(entry.specialties),
          officialAbilityName: detail?.abilityName,
          officialAbilitySummary: detail?.abilitySummary,
          plainLanguageExplanation: detail?.abilitySummary,
          structuredAbilityJson: JSON.stringify(
            detail?.structuredAbility ?? {},
          ),
          knowledgeStatus: detail ? "CURRENT" : "NEEDS_VERIFICATION",
          sourceType: "OFFICIAL",
          sourceUrl,
          sourceTitle,
          confidence: detail ? 1 : 0.9,
          lastVerifiedAt: now,
        },
        update: {
          isCurrent: true,
          squad: detail?.squad,
          officialSpecialtiesJson: JSON.stringify(entry.specialties),
          officialAbilityName: detail?.abilityName,
          officialAbilitySummary: detail?.abilitySummary,
          structuredAbilityJson: JSON.stringify(
            detail?.structuredAbility ?? {},
          ),
          knowledgeStatus: detail ? "CURRENT" : "NEEDS_VERIFICATION",
          sourceUrl,
          sourceTitle,
          lastVerifiedAt: now,
        },
      });
      for (const specialty of entry.specialties) {
        await transaction.operatorRoleAssignment.upsert({
          where: {
            operatorVersionId_roleKey_roleSource: {
              operatorVersionId: version.id,
              roleKey: specialty,
              roleSource: "OFFICIAL_SPECIALTY",
            },
          },
          create: {
            operatorVersionId: version.id,
            roleKey: specialty,
            displayName: displayRole(specialty),
            roleSource: "OFFICIAL_SPECIALTY",
            sourceType: "OFFICIAL",
            confidence: 1,
          },
          update: { displayName: displayRole(specialty), confidence: 1 },
        });
      }
      if (detail) {
        for (const role of detail.communityRoles) {
          await transaction.operatorRoleAssignment.upsert({
            where: {
              operatorVersionId_roleKey_roleSource: {
                operatorVersionId: version.id,
                roleKey: role,
                roleSource: "COMMUNITY_ROLE",
              },
            },
            create: {
              operatorVersionId: version.id,
              roleKey: role,
              displayName: displayRole(role),
              roleSource: "COMMUNITY_ROLE",
              sourceType: "COMMUNITY_DERIVED",
              confidence: 0.75,
              notes:
                "Common tactical role label; not an official Ubisoft specialty.",
            },
            update: {},
          });
        }
        const loadout: Array<{
          slot: "PRIMARY_WEAPON" | "SECONDARY_WEAPON" | "SECONDARY_GADGET";
          values: string[];
        }> = [
          { slot: "PRIMARY_WEAPON", values: detail.primaryWeapons },
          { slot: "SECONDARY_WEAPON", values: detail.secondaryWeapons },
          { slot: "SECONDARY_GADGET", values: detail.secondaryGadgets },
        ];
        for (const group of loadout) {
          for (const [sortOrder, displayName] of group.values.entries()) {
            await transaction.operatorLoadoutItem.upsert({
              where: {
                operatorVersionId_slot_displayName: {
                  operatorVersionId: version.id,
                  slot: group.slot,
                  displayName,
                },
              },
              create: {
                operatorVersionId: version.id,
                slot: group.slot,
                displayName,
                sortOrder,
              },
              update: { sortOrder },
            });
          }
        }
        const ability = await transaction.operatorAbility.upsert({
          where: {
            operatorId_canonicalName: {
              operatorId: operator.id,
              canonicalName: detail.abilityName,
            },
          },
          create: {
            stableId: `r6-operator:${entry.slug}:ability:${detail.abilityName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            operatorId: operator.id,
            canonicalName: detail.abilityName,
            abilityType:
              typeof detail.structuredAbility.abilityType === "string"
                ? detail.structuredAbility.abilityType
                : null,
          },
          update: {},
        });
        await transaction.operatorAbilityVersion.upsert({
          where: {
            abilityId_operatorVersionId: {
              abilityId: ability.id,
              operatorVersionId: version.id,
            },
          },
          create: {
            stableId: `${ability.stableId}:version:${OPERATOR_DATA_VERSION}`,
            abilityId: ability.id,
            operatorVersionId: version.id,
            versionKey: OPERATOR_DATA_VERSION,
            deploymentMethod:
              typeof detail.structuredAbility.deploymentMethod === "string"
                ? detail.structuredAbility.deploymentMethod
                : null,
            activationMethod:
              typeof detail.structuredAbility.activationMethod === "string"
                ? detail.structuredAbility.activationMethod
                : null,
            effectsJson: JSON.stringify(detail.structuredAbility),
            sourceType: "OFFICIAL",
            sourceUrl,
            sourceTitle,
            confidence: 1,
            lastVerifiedAt: now,
          },
          update: { effectsJson: JSON.stringify(detail.structuredAbility) },
        });
      }
      await transaction.operatorSourceCitation.upsert({
        where: {
          stableId: `r6-operator:${entry.slug}:citation:${OPERATOR_DATA_VERSION}`,
        },
        create: {
          stableId: `r6-operator:${entry.slug}:citation:${OPERATOR_DATA_VERSION}`,
          operatorVersionId: version.id,
          title: sourceTitle,
          url: sourceUrl,
          sourceType: "OFFICIAL",
          retrievedAt: now,
          lastVerifiedAt: now,
        },
        update: { title: sourceTitle, url: sourceUrl, lastVerifiedAt: now },
      });
    }
  });
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const operatorInclude = {
  aliases: { orderBy: { displayName: "asc" } },
  versions: {
    include: {
      roles: { orderBy: [{ roleSource: "asc" }, { displayName: "asc" }] },
      loadout: { orderBy: [{ slot: "asc" }, { sortOrder: "asc" }] },
      abilityVersions: { include: { ability: true } },
      citations: true,
      mapLinks: {
        include: {
          mapVersion: { include: { map: true } },
          floor: true,
          room: true,
          bombSite: true,
        },
      },
      sourceInteractions: {
        include: {
          targetOperator: true,
          targetAbility: true,
          targetGadget: true,
        },
      },
      targetInteractions: { include: { sourceOperator: true } },
    },
    orderBy: [{ isCurrent: "desc" }, { createdAt: "desc" }],
  },
} satisfies Prisma.SiegeOperatorInclude;

type IncludedOperator = Prisma.SiegeOperatorGetPayload<{
  include: typeof operatorInclude;
}>;

function serializeOperator(operator: IncludedOperator) {
  return {
    id: operator.id,
    stableId: operator.stableId,
    slug: operator.slug,
    canonicalName: operator.canonicalName,
    displayName: operator.displayName,
    side: operator.side,
    squad: operator.squad,
    releaseSeason: operator.releaseSeason,
    operatorDataVersion: operator.operatorDataVersion,
    knowledgeStatus: operator.knowledgeStatus,
    sourceType: operator.sourceType,
    officialSourceUrl: operator.officialSourceUrl,
    officialSourceTitle: operator.officialSourceTitle,
    retrievedAt: operator.retrievedAt.toISOString(),
    lastVerifiedAt: operator.lastVerifiedAt.toISOString(),
    confidence: operator.confidence,
    aliases: operator.aliases.map((alias) => ({
      id: alias.id,
      displayName: alias.displayName,
      sourceType: alias.sourceType,
      confidence: alias.confidence,
    })),
    versions: operator.versions.map((version) => ({
      id: version.id,
      stableId: version.stableId,
      versionKey: version.versionKey,
      versionName: version.versionName,
      isCurrent: version.isCurrent,
      squad: version.squad,
      speed: version.speed,
      armorOrHealth: version.armorOrHealth,
      difficulty: version.difficulty,
      officialSpecialties: parseJson<string[]>(
        version.officialSpecialtiesJson,
        [],
      ),
      officialAbilityName: version.officialAbilityName,
      officialAbilitySummary: version.officialAbilitySummary,
      plainLanguageExplanation: version.plainLanguageExplanation,
      structuredAbility: parseJson<Record<string, unknown>>(
        version.structuredAbilityJson,
        {},
      ),
      strengths: parseJson<string[]>(version.strengthsJson, []),
      limitations: parseJson<string[]>(version.limitationsJson, []),
      commonUses: parseJson<string[]>(version.commonUsesJson, []),
      contentUses: parseJson<string[]>(version.contentUsesJson, []),
      tacticalNotes: version.tacticalNotes,
      knowledgeStatus: version.knowledgeStatus,
      sourceType: version.sourceType,
      sourceUrl: version.sourceUrl,
      sourceTitle: version.sourceTitle,
      confidence: version.confidence,
      lastVerifiedAt: version.lastVerifiedAt.toISOString(),
      roles: version.roles.map((role) => ({
        id: role.id,
        roleKey: role.roleKey,
        displayName: role.displayName,
        roleSource: role.roleSource,
        sourceType: role.sourceType,
        confidence: role.confidence,
        notes: role.notes,
      })),
      loadout: version.loadout.map((item) => ({
        id: item.id,
        slot: item.slot,
        displayName: item.displayName,
        weaponCategory: item.weaponCategory,
      })),
      abilities: version.abilityVersions.map((abilityVersion) => ({
        id: abilityVersion.id,
        stableId: abilityVersion.stableId,
        abilityStableId: abilityVersion.ability.stableId,
        name: abilityVersion.ability.canonicalName,
        abilityType: abilityVersion.ability.abilityType,
        deploymentMethod: abilityVersion.deploymentMethod,
        activationMethod: abilityVersion.activationMethod,
        effects: parseJson<Record<string, unknown>>(
          abilityVersion.effectsJson,
          {},
        ),
        limitations: parseJson<string[]>(abilityVersion.limitationsJson, []),
      })),
      interactions: version.sourceInteractions.map((interaction) => ({
        id: interaction.id,
        stableId: interaction.stableId,
        category: interaction.category,
        targetOperatorStableId: interaction.targetOperator?.stableId ?? null,
        targetOperator: interaction.targetOperator?.displayName ?? null,
        targetAbilityStableId: interaction.targetAbility?.stableId ?? null,
        targetAbility: interaction.targetAbility?.canonicalName ?? null,
        targetGadgetStableId: interaction.targetGadget?.stableId ?? null,
        targetGadget: interaction.targetGadget?.name ?? null,
        conditions: interaction.conditions,
        outcome: interaction.outcome,
        limitations: interaction.limitations,
        sourceType: interaction.sourceType,
        confidence: interaction.confidence,
      })),
      incomingInteractions: version.targetInteractions.map((interaction) => ({
        id: interaction.id,
        category: interaction.category,
        sourceOperator: interaction.sourceOperator.displayName,
        conditions: interaction.conditions,
        outcome: interaction.outcome,
        sourceType: interaction.sourceType,
        confidence: interaction.confidence,
      })),
      mapLinks: version.mapLinks.map((link) => ({
        id: link.id,
        stableId: link.stableId,
        mapVersionStableId: link.mapVersion.stableId,
        mapName: link.mapVersion.map.name,
        mapVersion: link.mapVersion.versionName,
        floorStableId: link.floor?.stableId ?? null,
        floor: link.floor?.displayName ?? null,
        roomStableId: link.room?.stableId ?? null,
        room: link.room?.displayName ?? null,
        bombSiteStableId: link.bombSite?.stableId ?? null,
        bombSite: link.bombSite?.displayName ?? null,
        tacticalPurpose: link.tacticalPurpose,
        requiredConditions: link.requiredConditions,
        notes: link.notes,
        sourceType: link.sourceType,
        confidence: link.confidence,
      })),
      citations: version.citations.map((citation) => ({
        id: citation.id,
        title: citation.title,
        url: citation.url,
        sourceType: citation.sourceType,
        retrievedAt: citation.retrievedAt.toISOString(),
        lastVerifiedAt: citation.lastVerifiedAt?.toISOString() ?? null,
      })),
    })),
  };
}

export type OperatorDetailDto = ReturnType<typeof serializeOperator>;

export async function listOperators(rawQuery?: unknown) {
  await ensureOfficialOperatorRoster();
  const query = z
    .object({
      search: z.string().trim().max(200).optional().default(""),
      side: z.enum(["ATTACKER", "DEFENDER"]).optional(),
      specialty: z.string().trim().max(100).optional(),
      role: z.string().trim().max(100).optional(),
      squad: z.string().trim().max(100).optional(),
    })
    .parse(rawQuery ?? {});
  const operators = await db.siegeOperator.findMany({
    include: operatorInclude,
    orderBy: { displayName: "asc" },
  });
  return filterOperatorDtos(operators.map(serializeOperator), query);
}

export function filterOperatorDtos(
  operators: OperatorDetailDto[],
  query: {
    search?: string;
    side?: OperatorSide;
    specialty?: string;
    role?: string;
    squad?: string;
  },
) {
  const search = (query.search ?? "").toLocaleLowerCase();
  return operators.filter((operator) => {
    const current = operator.versions.find((version) => version.isCurrent);
    const searchable = [
      operator.displayName,
      operator.canonicalName,
      operator.squad ?? "",
      ...operator.aliases.map((alias) => alias.displayName),
      ...(current?.officialSpecialties ?? []),
      ...(current?.roles.map((role) => role.displayName) ?? []),
      ...(current?.loadout.map((item) => item.displayName) ?? []),
      ...(current?.contentUses ?? []),
      ...(current?.interactions.flatMap((interaction) => [
        interaction.category,
        interaction.targetOperator ?? "",
        interaction.targetAbility ?? "",
        interaction.targetGadget ?? "",
        interaction.conditions,
        interaction.outcome,
      ]) ?? []),
      ...(current?.mapLinks.flatMap((link) => [
        link.mapName,
        link.mapVersion,
        link.floor ?? "",
        link.room ?? "",
        link.bombSite ?? "",
        link.tacticalPurpose,
        link.requiredConditions ?? "",
      ]) ?? []),
      current?.officialAbilityName ?? "",
      current?.officialAbilitySummary ?? "",
    ]
      .join(" ")
      .toLocaleLowerCase();
    return (
      (!query.side || operator.side === query.side) &&
      (!query.specialty ||
        current?.officialSpecialties.includes(query.specialty)) &&
      (!query.role ||
        current?.roles.some((role) => role.roleKey === query.role)) &&
      (!query.squad || operator.squad === query.squad) &&
      (!search || searchable.includes(search))
    );
  });
}

export async function getOperatorDetail(slug: string) {
  await ensureOfficialOperatorRoster();
  const operator = await db.siegeOperator.findUnique({
    where: { slug },
    include: operatorInclude,
  });
  if (!operator) {
    throw new AppError(
      "That operator is not in the local knowledge base.",
      404,
      "OPERATOR_NOT_FOUND",
    );
  }
  return serializeOperator(operator);
}

function normalizeLabel(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

const aliasInputSchema = z
  .object({ displayName: z.string().trim().min(1).max(100) })
  .strict();

export async function addOperatorAlias(slug: string, rawInput: unknown) {
  const input = aliasInputSchema.parse(rawInput);
  const operator = await db.siegeOperator.findUnique({ where: { slug } });
  if (!operator)
    throw new AppError("Operator not found.", 404, "OPERATOR_NOT_FOUND");
  await db.operatorAlias.upsert({
    where: {
      operatorId_normalizedName: {
        operatorId: operator.id,
        normalizedName: normalizeLabel(input.displayName),
      },
    },
    create: {
      operatorId: operator.id,
      displayName: input.displayName,
      normalizedName: normalizeLabel(input.displayName),
      sourceType: "USER_ENTERED",
      confidence: 1,
    },
    update: { displayName: input.displayName },
  });
  return getOperatorDetail(slug);
}

const roleInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    notes: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict();

async function getCurrentOperatorVersion(slug: string) {
  const operator = await db.siegeOperator.findUnique({
    where: { slug },
    include: { versions: { where: { isCurrent: true }, take: 1 } },
  });
  const version = operator?.versions[0];
  if (!operator || !version)
    throw new AppError(
      "The current operator version is unavailable.",
      404,
      "OPERATOR_VERSION_NOT_FOUND",
    );
  return { operator, version };
}

export async function addOperatorRole(slug: string, rawInput: unknown) {
  const input = roleInputSchema.parse(rawInput);
  const { version } = await getCurrentOperatorVersion(slug);
  const roleKey = normalizeLabel(input.displayName).replace(/[^a-z0-9]+/g, "-");
  await db.operatorRoleAssignment.upsert({
    where: {
      operatorVersionId_roleKey_roleSource: {
        operatorVersionId: version.id,
        roleKey,
        roleSource: "USER_ASSIGNED",
      },
    },
    create: {
      operatorVersionId: version.id,
      roleKey,
      displayName: input.displayName,
      roleSource: "USER_ASSIGNED",
      sourceType: "USER_ENTERED",
      confidence: 1,
      notes: input.notes,
    },
    update: { displayName: input.displayName, notes: input.notes },
  });
  return getOperatorDetail(slug);
}

const interactionCategories = [
  "HARD_COUNTER",
  "SOFT_COUNTER",
  "CONDITIONAL_COUNTER",
  "SYNERGY",
  "GADGET_DESTRUCTION",
  "GADGET_DISABLEMENT",
  "GADGET_CAPTURE",
  "GADGET_REDIRECTION",
  "GADGET_DETECTION",
  "GADGET_AVOIDANCE",
  "INTEL_DENIAL",
  "PROJECTILE_INTERCEPTION",
  "ELECTRONIC_DISRUPTION",
  "MOVEMENT_RESTRICTION",
  "VISION_DENIAL",
  "AUDIO_MASKING",
  "BREACH_SUPPORT",
  "PLANT_DENIAL",
  "HEALING_OR_RECOVERY",
  "FORCED_REPOSITIONING",
] as const satisfies readonly OperatorInteractionCategory[];

const interactionInputSchema = z
  .object({
    targetOperatorSlug: z.string().trim().min(1).max(100),
    category: z.enum(interactionCategories),
    conditions: z.string().trim().min(1).max(2_000),
    outcome: z.string().trim().min(1).max(2_000),
    limitations: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict();

export async function addOperatorInteraction(slug: string, rawInput: unknown) {
  const input = interactionInputSchema.parse(rawInput);
  const [{ operator, version }, target] = await Promise.all([
    getCurrentOperatorVersion(slug),
    db.siegeOperator.findUnique({
      where: { slug: input.targetOperatorSlug },
      include: { versions: { where: { isCurrent: true }, take: 1 } },
    }),
  ]);
  if (!target)
    throw new AppError(
      "The target operator was not found.",
      400,
      "TARGET_OPERATOR_NOT_FOUND",
    );
  await db.operatorInteraction.create({
    data: {
      stableId: `user-interaction:${crypto.randomUUID()}`,
      sourceOperatorId: operator.id,
      sourceOperatorVersionId: version.id,
      targetOperatorId: target.id,
      targetOperatorVersionId: target.versions[0]?.id,
      category: input.category,
      conditions: input.conditions,
      outcome: input.outcome,
      limitations: input.limitations,
      sourceType: "USER_ENTERED",
      confidence: 1,
      lastVerifiedAt: new Date(),
    },
  });
  return getOperatorDetail(slug);
}

const mapLinkInputSchema = z
  .object({
    mapVersionId: z.string().trim().min(1).max(200),
    floorId: z.string().trim().min(1).max(200).nullable().optional(),
    roomId: z.string().trim().min(1).max(200).nullable().optional(),
    bombSiteId: z.string().trim().min(1).max(200).nullable().optional(),
    tacticalPurpose: z.string().trim().min(1).max(2_000),
    requiredConditions: z.string().trim().max(2_000).nullable().optional(),
    notes: z.string().trim().max(2_000).nullable().optional(),
  })
  .strict();

export async function addOperatorMapLink(slug: string, rawInput: unknown) {
  const input = mapLinkInputSchema.parse(rawInput);
  const { version } = await getCurrentOperatorVersion(slug);
  const mapVersion = await db.mapVersion.findUnique({
    where: { id: input.mapVersionId },
    include: { floors: true, elements: true, bombSites: true },
  });
  if (!mapVersion)
    throw new AppError(
      "That map version was not found.",
      400,
      "MAP_VERSION_NOT_FOUND",
    );
  if (
    (input.floorId &&
      !mapVersion.floors.some((item) => item.id === input.floorId)) ||
    (input.roomId &&
      !mapVersion.elements.some((item) => item.id === input.roomId)) ||
    (input.bombSiteId &&
      !mapVersion.bombSites.some((item) => item.id === input.bombSiteId))
  ) {
    throw new AppError(
      "The selected floor, room, or bomb site does not belong to that map version.",
      400,
      "OPERATOR_MAP_REFERENCE_INVALID",
    );
  }
  await db.operatorMapLink.create({
    data: {
      stableId: `user-operator-map:${crypto.randomUUID()}`,
      operatorVersionId: version.id,
      mapVersionId: input.mapVersionId,
      floorId: input.floorId,
      roomId: input.roomId,
      bombSiteId: input.bombSiteId,
      tacticalPurpose: input.tacticalPurpose,
      requiredConditions: input.requiredConditions,
      notes: input.notes,
      sourceType: "USER_ENTERED",
      confidence: 1,
      lastVerifiedAt: new Date(),
    },
  });
  return getOperatorDetail(slug);
}

const notesInputSchema = z
  .object({ tacticalNotes: z.string().trim().max(10_000).nullable() })
  .strict();

export async function updateOperatorNotes(slug: string, rawInput: unknown) {
  const input = notesInputSchema.parse(rawInput);
  const { version } = await getCurrentOperatorVersion(slug);
  await db.operatorVersion.update({
    where: { id: version.id },
    data: { tacticalNotes: input.tacticalNotes },
  });
  return getOperatorDetail(slug);
}

const contentUseInputSchema = z
  .object({ contentUse: z.string().trim().min(1).max(2_000) })
  .strict();

export async function addOperatorContentUse(slug: string, rawInput: unknown) {
  const input = contentUseInputSchema.parse(rawInput);
  const { version } = await getCurrentOperatorVersion(slug);
  const current = parseJson<string[]>(version.contentUsesJson, []);
  const contentUses = [...new Set([...current, input.contentUse])];
  await db.operatorVersion.update({
    where: { id: version.id },
    data: { contentUsesJson: JSON.stringify(contentUses) },
  });
  return getOperatorDetail(slug);
}

export async function deleteOperatorKnowledgeItem(
  kind: "alias" | "role" | "interaction" | "map-link",
  id: string,
) {
  if (kind === "alias") {
    const item = await db.operatorAlias.findUnique({ where: { id } });
    if (!item || item.sourceType !== "USER_ENTERED")
      throw new AppError(
        "Only user-created aliases can be deleted.",
        400,
        "OPERATOR_ITEM_DELETE_NOT_ALLOWED",
      );
    await db.operatorAlias.delete({ where: { id } });
    return;
  }
  if (kind === "role") {
    const item = await db.operatorRoleAssignment.findUnique({ where: { id } });
    if (!item || item.roleSource !== "USER_ASSIGNED")
      throw new AppError(
        "Official specialties cannot be deleted.",
        400,
        "OPERATOR_ITEM_DELETE_NOT_ALLOWED",
      );
    await db.operatorRoleAssignment.delete({ where: { id } });
    return;
  }
  if (kind === "interaction") {
    const item = await db.operatorInteraction.findUnique({ where: { id } });
    if (!item || item.sourceType !== "USER_ENTERED")
      throw new AppError(
        "Only user-created interactions can be deleted.",
        400,
        "OPERATOR_ITEM_DELETE_NOT_ALLOWED",
      );
    await db.operatorInteraction.delete({ where: { id } });
    return;
  }
  const item = await db.operatorMapLink.findUnique({ where: { id } });
  if (!item || item.sourceType !== "USER_ENTERED")
    throw new AppError(
      "Only user-created map links can be deleted.",
      400,
      "OPERATOR_ITEM_DELETE_NOT_ALLOWED",
    );
  await db.operatorMapLink.delete({ where: { id } });
}

export async function createOperatorUpdateReview() {
  await ensureOfficialOperatorRoster();
  const saved = await db.siegeOperator.findMany({
    select: {
      slug: true,
      displayName: true,
      side: true,
      operatorDataVersion: true,
    },
  });
  const savedBySlug = new Map(
    saved.map((operator) => [operator.slug, operator]),
  );
  const additions = OFFICIAL_OPERATOR_ROSTER.filter(
    (operator) => !savedBySlug.has(operator.slug),
  );
  const differences = OFFICIAL_OPERATOR_ROSTER.flatMap((operator) => {
    const existing = savedBySlug.get(operator.slug);
    if (!existing || existing.side === operator.side) return [];
    return [
      {
        slug: operator.slug,
        field: "side",
        saved: existing.side,
        packagedOfficial: operator.side,
      },
    ];
  });
  const review = await db.operatorUpdateReview.create({
    data: {
      sourceUrl: OFFICIAL_OPERATOR_DIRECTORY_URL,
      sourceTitle: OFFICIAL_OPERATOR_DIRECTORY_TITLE,
      retrievedAt: now,
      proposedChangesJson: JSON.stringify({
        packagedDataVersion: OPERATOR_DATA_VERSION,
        additions,
        differences,
        note: "This local check compares saved roster identity fields with the packaged official retrieval. It never overwrites records automatically.",
      }),
      status:
        additions.length || differences.length
          ? "CHANGES_FOUND"
          : "REVIEWED_NO_CHANGE",
      reviewedAt: new Date(),
    },
  });
  return {
    id: review.id,
    status: review.status,
    proposedChanges: parseJson<Record<string, unknown>>(
      review.proposedChangesJson,
      {},
    ),
    createdAt: review.createdAt.toISOString(),
  };
}

export async function getOperatorEditorOptions() {
  await ensureOfficialOperatorRoster();
  const [operators, maps] = await Promise.all([
    db.siegeOperator.findMany({
      select: { id: true, slug: true, displayName: true, side: true },
      orderBy: { displayName: "asc" },
    }),
    db.siegeMap.findMany({
      include: {
        versions: {
          include: { floors: true, elements: true, bombSites: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    operators,
    maps: maps.map((map) => ({
      id: map.id,
      name: map.name,
      versions: map.versions.map((version) => ({
        id: version.id,
        name: version.versionName,
        floors: version.floors.map((floor) => ({
          id: floor.id,
          name: floor.displayName,
        })),
        rooms: version.elements
          .filter((element) => element.elementType === "ROOM")
          .map((room) => ({ id: room.id, name: room.displayName })),
        bombSites: version.bombSites.map((site) => ({
          id: site.id,
          name: site.displayName,
        })),
      })),
    })),
    interactionCategories,
  };
}

export type OperatorEditorOptionsDto = Awaited<
  ReturnType<typeof getOperatorEditorOptions>
>;

export async function compareOperators(slugs: string[]) {
  const selected = [...new Set(slugs)].slice(0, 4);
  if (selected.length < 2)
    throw new AppError(
      "Choose at least two operators to compare.",
      400,
      "OPERATOR_COMPARISON_TOO_SMALL",
    );
  const details = await Promise.all(selected.map(getOperatorDetail));
  return {
    operators: details,
    explanation:
      "This comparison shows structured differences and conditions. It does not declare one operator objectively better.",
  };
}

function containsPrivatePath(value: unknown): boolean {
  if (typeof value === "string") {
    return (
      value.startsWith("/") ||
      /^[A-Za-z]:\\/.test(value) ||
      value.includes("file://")
    );
  }
  if (Array.isArray(value)) return value.some(containsPrivatePath);
  if (value && typeof value === "object")
    return Object.values(value).some(containsPrivatePath);
  return false;
}

export async function exportOperator(slug: string) {
  const operator = await getOperatorDetail(slug);
  return {
    schemaVersion: OPERATOR_EXPORT_SCHEMA_VERSION,
    operatorDataVersion: operator.operatorDataVersion,
    gameSeason: {
      year: 11,
      seasonName: "Operation System Override",
      seasonNumber: 2,
    },
    sourceMetadata: {
      title: operator.officialSourceTitle,
      url: operator.officialSourceUrl,
      retrievedAt: operator.retrievedAt,
      lastVerifiedAt: operator.lastVerifiedAt,
    },
    creationMetadata: {
      application: "R6 Creator AI",
      createdAt: new Date().toISOString(),
    },
    operator,
  };
}

export async function exportOperatorDatabase() {
  await ensureOfficialOperatorRoster();
  const operators = await db.siegeOperator.findMany({
    include: operatorInclude,
    orderBy: { displayName: "asc" },
  });
  return {
    schemaVersion: OPERATOR_DATABASE_EXPORT_SCHEMA_VERSION,
    operatorDataVersion: OPERATOR_DATA_VERSION,
    gameSeason: {
      year: 11,
      seasonName: "Operation System Override",
      seasonNumber: 2,
    },
    sourceMetadata: {
      title: OFFICIAL_OPERATOR_DIRECTORY_TITLE,
      url: OFFICIAL_OPERATOR_DIRECTORY_URL,
      retrievedAt: OPERATOR_DATA_RETRIEVED_AT,
    },
    creationMetadata: {
      application: "R6 Creator AI",
      createdAt: new Date().toISOString(),
    },
    operators: operators.map(serializeOperator),
  };
}

const importedRoleSchema = z
  .object({
    roleKey: z.string().trim().min(1).max(100),
    displayName: z.string().trim().min(1).max(100),
    roleSource: z.enum([
      "OFFICIAL_SPECIALTY",
      "COMMUNITY_ROLE",
      "USER_ASSIGNED",
      "INFERRED_TACTICAL_ROLE",
    ]),
    sourceType: z.enum([
      "OFFICIAL",
      "USER_ENTERED",
      "COMMUNITY_DERIVED",
      "INFERRED",
      "UNVERIFIED",
    ]),
    confidence: z.number().min(0).max(1),
    notes: z.string().max(2_000).nullable(),
  })
  .passthrough();

const importedLoadoutSchema = z
  .object({
    slot: z.enum(["PRIMARY_WEAPON", "SECONDARY_WEAPON", "SECONDARY_GADGET"]),
    displayName: z.string().trim().min(1).max(200),
    weaponCategory: z.string().max(200).nullable(),
  })
  .passthrough();

const importedAbilitySchema = z
  .object({
    stableId: z.string().trim().min(1).max(300),
    abilityStableId: z.string().trim().min(1).max(300),
    name: z.string().trim().min(1).max(300),
    abilityType: z.string().max(200).nullable(),
    deploymentMethod: z.string().max(2_000).nullable(),
    activationMethod: z.string().max(2_000).nullable(),
    effects: z.record(z.string(), z.unknown()),
    limitations: z.array(z.string().max(2_000)).max(100),
  })
  .passthrough();

const importedInteractionSchema = z
  .object({
    stableId: z.string().trim().min(1).max(300),
    category: z.enum(interactionCategories),
    targetOperatorStableId: z.string().max(300).nullable(),
    targetAbilityStableId: z.string().max(300).nullable(),
    targetGadgetStableId: z.string().max(300).nullable(),
    conditions: z.string().trim().min(1).max(2_000),
    outcome: z.string().trim().min(1).max(2_000),
    limitations: z.string().max(2_000).nullable(),
    sourceType: z.enum([
      "OFFICIAL",
      "USER_ENTERED",
      "COMMUNITY_DERIVED",
      "INFERRED",
      "UNVERIFIED",
    ]),
    confidence: z.number().min(0).max(1),
  })
  .passthrough();

const importedMapLinkSchema = z
  .object({
    stableId: z.string().trim().min(1).max(300),
    mapVersionStableId: z.string().trim().min(1).max(300),
    floorStableId: z.string().max(300).nullable(),
    roomStableId: z.string().max(300).nullable(),
    bombSiteStableId: z.string().max(300).nullable(),
    tacticalPurpose: z.string().trim().min(1).max(2_000),
    requiredConditions: z.string().max(2_000).nullable(),
    notes: z.string().max(2_000).nullable(),
    sourceType: z.enum([
      "OFFICIAL",
      "USER_ENTERED",
      "COMMUNITY_DERIVED",
      "INFERRED",
      "UNVERIFIED",
    ]),
    confidence: z.number().min(0).max(1),
  })
  .passthrough();

const importedVersionSchema = z
  .object({
    stableId: z.string().trim().min(1).max(300),
    versionKey: z.string().trim().min(1).max(200),
    versionName: z.string().trim().min(1).max(300),
    isCurrent: z.boolean(),
    officialSpecialties: z.array(z.string().max(100)).max(50),
    officialAbilityName: z.string().max(300).nullable(),
    officialAbilitySummary: z.string().max(10_000).nullable(),
    plainLanguageExplanation: z.string().max(10_000).nullable(),
    structuredAbility: z.record(z.string(), z.unknown()),
    knowledgeStatus: z.enum([
      "CURRENT",
      "HISTORICAL",
      "POSSIBLY_OUTDATED",
      "NEEDS_VERIFICATION",
      "TEMPORARILY_UNAVAILABLE",
      "UNVERIFIED",
    ]),
    sourceType: z.enum([
      "OFFICIAL",
      "USER_ENTERED",
      "COMMUNITY_DERIVED",
      "INFERRED",
      "UNVERIFIED",
    ]),
    sourceUrl: z.string().url(),
    sourceTitle: z.string().min(1).max(500),
    confidence: z.number().min(0).max(1),
    lastVerifiedAt: z.string().datetime(),
    tacticalNotes: z.string().max(10_000).nullable(),
    contentUses: z.array(z.string().max(2_000)).max(100).default([]),
    roles: z.array(importedRoleSchema).max(100).default([]),
    loadout: z.array(importedLoadoutSchema).max(100).default([]),
    abilities: z.array(importedAbilitySchema).max(20).default([]),
    interactions: z.array(importedInteractionSchema).max(500).default([]),
    mapLinks: z.array(importedMapLinkSchema).max(500).default([]),
  })
  .passthrough();

const operatorImportSchema = z
  .object({
    schemaVersion: z.literal(OPERATOR_EXPORT_SCHEMA_VERSION),
    operatorDataVersion: z.string().trim().min(1).max(200),
    gameSeason: z.object({
      year: z.number().int().positive(),
      seasonName: z.string().min(1).max(200),
      seasonNumber: z.number().int().positive(),
    }),
    sourceMetadata: z.object({
      title: z.string().min(1).max(500),
      url: z.string().url(),
      retrievedAt: z.string().datetime(),
      lastVerifiedAt: z.string().datetime(),
    }),
    creationMetadata: z.object({
      application: z.string().min(1),
      createdAt: z.string().datetime(),
    }),
    operator: z
      .object({
        stableId: z.string().min(1).max(300),
        slug: z.string().regex(/^[a-z0-9-]+$/),
        canonicalName: z.string().min(1).max(200),
        displayName: z.string().min(1).max(200),
        side: z.enum(["ATTACKER", "DEFENDER"]),
        squad: z.string().max(200).nullable(),
        sourceType: z.enum([
          "OFFICIAL",
          "USER_ENTERED",
          "COMMUNITY_DERIVED",
          "INFERRED",
          "UNVERIFIED",
        ]),
        officialSourceUrl: z.string().url(),
        officialSourceTitle: z.string().min(1).max(500),
        retrievedAt: z.string().datetime(),
        lastVerifiedAt: z.string().datetime(),
        confidence: z.number().min(0).max(1),
        aliases: z
          .array(
            z
              .object({
                displayName: z.string().trim().min(1).max(100),
                sourceType: z.enum([
                  "OFFICIAL",
                  "USER_ENTERED",
                  "COMMUNITY_DERIVED",
                  "INFERRED",
                  "UNVERIFIED",
                ]),
                confidence: z.number().min(0).max(1),
              })
              .passthrough(),
          )
          .max(100)
          .default([]),
        versions: z.array(importedVersionSchema).min(1).max(100),
      })
      .passthrough(),
  })
  .strict();

const operatorDatabaseImportSchema = z
  .object({
    schemaVersion: z.literal(OPERATOR_DATABASE_EXPORT_SCHEMA_VERSION),
    operatorDataVersion: z.string().trim().min(1).max(200),
    gameSeason: z.object({
      year: z.number().int().positive(),
      seasonName: z.string().min(1).max(200),
      seasonNumber: z.number().int().positive(),
    }),
    sourceMetadata: z.object({
      title: z.string().min(1).max(500),
      url: z.string().url(),
      retrievedAt: z.string().datetime(),
    }),
    creationMetadata: z.object({
      application: z.string().min(1),
      createdAt: z.string().datetime(),
    }),
    operators: z.array(operatorImportSchema.shape.operator).min(1).max(500),
  })
  .strict();

export async function importOperator(rawInput: unknown) {
  const input = validateOperatorImportDocument(rawInput);
  await db.$transaction(async (transaction) => {
    const operator = await transaction.siegeOperator.upsert({
      where: { stableId: input.operator.stableId },
      create: {
        stableId: input.operator.stableId,
        slug: input.operator.slug,
        canonicalName: input.operator.canonicalName,
        displayName: input.operator.displayName,
        side: input.operator.side,
        squad: input.operator.squad,
        operatorDataVersion: input.operatorDataVersion,
        knowledgeStatus: "NEEDS_VERIFICATION",
        sourceType: input.operator.sourceType,
        officialSourceUrl: input.operator.officialSourceUrl,
        officialSourceTitle: input.operator.officialSourceTitle,
        retrievedAt: new Date(input.operator.retrievedAt),
        lastVerifiedAt: new Date(input.operator.lastVerifiedAt),
        confidence: input.operator.confidence,
      },
      update: {},
    });
    for (const alias of input.operator.aliases) {
      await transaction.operatorAlias.upsert({
        where: {
          operatorId_normalizedName: {
            operatorId: operator.id,
            normalizedName: normalizeLabel(alias.displayName),
          },
        },
        create: {
          operatorId: operator.id,
          displayName: alias.displayName,
          normalizedName: normalizeLabel(alias.displayName),
          sourceType: alias.sourceType,
          confidence: alias.confidence,
        },
        update: {},
      });
    }
    for (const version of input.operator.versions) {
      const existing = await transaction.operatorVersion.findUnique({
        where: { stableId: version.stableId },
      });
      if (existing && existing.operatorId !== operator.id)
        throw new AppError(
          "An imported version stable ID belongs to another operator.",
          400,
          "OPERATOR_IMPORT_BROKEN_REFERENCE",
        );
      const savedVersion = await transaction.operatorVersion.upsert({
        where: {
          operatorId_versionKey: {
            operatorId: operator.id,
            versionKey: version.versionKey,
          },
        },
        create: {
          stableId: version.stableId,
          operatorId: operator.id,
          versionKey: version.versionKey,
          versionName: version.versionName,
          isCurrent: false,
          officialSpecialtiesJson: JSON.stringify(version.officialSpecialties),
          officialAbilityName: version.officialAbilityName,
          officialAbilitySummary: version.officialAbilitySummary,
          plainLanguageExplanation: version.plainLanguageExplanation,
          structuredAbilityJson: JSON.stringify(version.structuredAbility),
          tacticalNotes: version.tacticalNotes,
          contentUsesJson: JSON.stringify(version.contentUses),
          knowledgeStatus: "NEEDS_VERIFICATION",
          sourceType: version.sourceType,
          sourceUrl: version.sourceUrl,
          sourceTitle: version.sourceTitle,
          confidence: version.confidence,
          lastVerifiedAt: new Date(version.lastVerifiedAt),
        },
        update: {},
      });
      for (const role of version.roles) {
        await transaction.operatorRoleAssignment.upsert({
          where: {
            operatorVersionId_roleKey_roleSource: {
              operatorVersionId: savedVersion.id,
              roleKey: role.roleKey,
              roleSource: role.roleSource,
            },
          },
          create: {
            operatorVersionId: savedVersion.id,
            roleKey: role.roleKey,
            displayName: role.displayName,
            roleSource: role.roleSource,
            sourceType: role.sourceType,
            confidence: role.confidence,
            notes: role.notes,
          },
          update: {},
        });
      }
      for (const [sortOrder, loadout] of version.loadout.entries()) {
        await transaction.operatorLoadoutItem.upsert({
          where: {
            operatorVersionId_slot_displayName: {
              operatorVersionId: savedVersion.id,
              slot: loadout.slot,
              displayName: loadout.displayName,
            },
          },
          create: {
            operatorVersionId: savedVersion.id,
            slot: loadout.slot,
            displayName: loadout.displayName,
            weaponCategory: loadout.weaponCategory,
            sortOrder,
          },
          update: {},
        });
      }
      for (const ability of version.abilities) {
        const savedAbility = await transaction.operatorAbility.upsert({
          where: { stableId: ability.abilityStableId },
          create: {
            stableId: ability.abilityStableId,
            operatorId: operator.id,
            canonicalName: ability.name,
            abilityType: ability.abilityType,
          },
          update: {},
        });
        if (savedAbility.operatorId !== operator.id)
          throw new AppError(
            "An imported ability stable ID belongs to another operator.",
            400,
            "OPERATOR_IMPORT_BROKEN_REFERENCE",
          );
        await transaction.operatorAbilityVersion.upsert({
          where: {
            abilityId_operatorVersionId: {
              abilityId: savedAbility.id,
              operatorVersionId: savedVersion.id,
            },
          },
          create: {
            stableId: ability.stableId,
            abilityId: savedAbility.id,
            operatorVersionId: savedVersion.id,
            versionKey: version.versionKey,
            deploymentMethod: ability.deploymentMethod,
            activationMethod: ability.activationMethod,
            effectsJson: JSON.stringify(ability.effects),
            limitationsJson: JSON.stringify(ability.limitations),
            sourceType: version.sourceType,
            sourceUrl: version.sourceUrl,
            sourceTitle: version.sourceTitle,
            confidence: version.confidence,
            lastVerifiedAt: new Date(version.lastVerifiedAt),
          },
          update: {},
        });
      }
      for (const interaction of version.interactions) {
        const [targetOperator, targetAbility, targetGadget] = await Promise.all(
          [
            interaction.targetOperatorStableId
              ? transaction.siegeOperator.findUnique({
                  where: { stableId: interaction.targetOperatorStableId },
                })
              : null,
            interaction.targetAbilityStableId
              ? transaction.operatorAbility.findUnique({
                  where: { stableId: interaction.targetAbilityStableId },
                })
              : null,
            interaction.targetGadgetStableId
              ? transaction.operatorGadget.findUnique({
                  where: { stableId: interaction.targetGadgetStableId },
                })
              : null,
          ],
        );
        if (
          (interaction.targetOperatorStableId && !targetOperator) ||
          (interaction.targetAbilityStableId && !targetAbility) ||
          (interaction.targetGadgetStableId && !targetGadget)
        )
          throw new AppError(
            "An imported interaction refers to operator knowledge that does not exist.",
            400,
            "OPERATOR_IMPORT_BROKEN_REFERENCE",
          );
        await transaction.operatorInteraction.upsert({
          where: { stableId: interaction.stableId },
          create: {
            stableId: interaction.stableId,
            sourceOperatorId: operator.id,
            sourceOperatorVersionId: savedVersion.id,
            targetOperatorId: targetOperator?.id,
            targetAbilityId: targetAbility?.id,
            targetGadgetId: targetGadget?.id,
            category: interaction.category,
            conditions: interaction.conditions,
            outcome: interaction.outcome,
            limitations: interaction.limitations,
            sourceType: interaction.sourceType,
            confidence: interaction.confidence,
          },
          update: {},
        });
      }
      for (const link of version.mapLinks) {
        const [mapVersion, floor, room, bombSite] = await Promise.all([
          transaction.mapVersion.findUnique({
            where: { stableId: link.mapVersionStableId },
          }),
          link.floorStableId
            ? transaction.mapFloor.findUnique({
                where: { stableId: link.floorStableId },
              })
            : null,
          link.roomStableId
            ? transaction.mapElement.findUnique({
                where: { stableId: link.roomStableId },
              })
            : null,
          link.bombSiteStableId
            ? transaction.mapBombSitePair.findUnique({
                where: { stableId: link.bombSiteStableId },
              })
            : null,
        ]);
        if (
          !mapVersion ||
          (link.floorStableId && !floor) ||
          (link.roomStableId && !room) ||
          (link.bombSiteStableId && !bombSite)
        )
          throw new AppError(
            "An imported operator map link refers to map knowledge that does not exist.",
            400,
            "OPERATOR_IMPORT_BROKEN_REFERENCE",
          );
        if (
          floor?.mapVersionId !== mapVersion.id ||
          room?.mapVersionId !== mapVersion.id ||
          bombSite?.mapVersionId !== mapVersion.id
        )
          throw new AppError(
            "An imported operator map link combines incompatible map versions.",
            400,
            "OPERATOR_IMPORT_BROKEN_REFERENCE",
          );
        await transaction.operatorMapLink.upsert({
          where: { stableId: link.stableId },
          create: {
            stableId: link.stableId,
            operatorVersionId: savedVersion.id,
            mapVersionId: mapVersion.id,
            floorId: floor?.id,
            roomId: room?.id,
            bombSiteId: bombSite?.id,
            tacticalPurpose: link.tacticalPurpose,
            requiredConditions: link.requiredConditions,
            notes: link.notes,
            sourceType: link.sourceType,
            confidence: link.confidence,
          },
          update: {},
        });
      }
    }
  });
  return getOperatorDetail(input.operator.slug);
}

export async function importOperatorKnowledgeDocument(rawInput: unknown) {
  if (
    rawInput &&
    typeof rawInput === "object" &&
    "schemaVersion" in rawInput &&
    rawInput.schemaVersion === OPERATOR_DATABASE_EXPORT_SCHEMA_VERSION
  ) {
    if (containsPrivatePath(rawInput))
      throw new AppError(
        "Operator imports cannot contain private absolute file paths.",
        400,
        "OPERATOR_IMPORT_PRIVATE_PATH",
      );
    const input = operatorDatabaseImportSchema.parse(rawInput);
    const makeSingleDocument = (
      operator: (typeof input.operators)[number],
      includeRelationships: boolean,
    ) => ({
      schemaVersion: OPERATOR_EXPORT_SCHEMA_VERSION,
      operatorDataVersion: input.operatorDataVersion,
      gameSeason: input.gameSeason,
      sourceMetadata: {
        ...input.sourceMetadata,
        lastVerifiedAt: operator.lastVerifiedAt,
      },
      creationMetadata: input.creationMetadata,
      operator: {
        ...operator,
        versions: operator.versions.map((version) => ({
          ...version,
          interactions: includeRelationships ? version.interactions : [],
          mapLinks: includeRelationships ? version.mapLinks : [],
        })),
      },
    });
    for (const operator of input.operators)
      await importOperator(makeSingleDocument(operator, false));
    const operators = [];
    for (const operator of input.operators)
      operators.push(await importOperator(makeSingleDocument(operator, true)));
    return { operators, importedCount: operators.length };
  }
  return { operators: [await importOperator(rawInput)], importedCount: 1 };
}

export function validateOperatorImportDocument(rawInput: unknown) {
  if (containsPrivatePath(rawInput)) {
    throw new AppError(
      "Operator imports cannot contain private absolute file paths.",
      400,
      "OPERATOR_IMPORT_PRIVATE_PATH",
    );
  }
  const input = operatorImportSchema.parse(rawInput);
  const stableIds = new Set<string>([input.operator.stableId]);
  for (const version of input.operator.versions) {
    for (const stableId of [
      version.stableId,
      ...version.abilities.flatMap((ability) => [
        ability.stableId,
        ability.abilityStableId,
      ]),
      ...version.interactions.map((interaction) => interaction.stableId),
      ...version.mapLinks.map((link) => link.stableId),
    ]) {
      if (stableIds.has(stableId))
        throw new AppError(
          "The import contains duplicate stable IDs.",
          400,
          "OPERATOR_IMPORT_DUPLICATE_ID",
        );
      stableIds.add(stableId);
    }
  }
  return input;
}

const projectContextSchema = z
  .object({
    playerOperatorId: z.string().trim().min(1).max(200).nullable(),
    operatorVersionId: z.string().trim().min(1).max(200).nullable(),
    teamOperatorIds: z.array(z.string().trim().min(1).max(200)).max(4),
    enemyOperatorIds: z.array(z.string().trim().min(1).max(200)).max(5),
    side: z.enum(["UNKNOWN", "ATTACK", "DEFENSE"]),
    uniqueAbilityUsed: z.string().trim().max(300).nullable(),
    secondaryGadgetUsed: z.string().trim().max(300).nullable(),
    abilityUseTimestamp: z.number().finite().min(0).nullable(),
    abilityResult: z.string().trim().max(2_000).nullable(),
    target: z.string().trim().max(500).nullable(),
    abilitySucceeded: z.boolean().nullable(),
    tacticalPurpose: z.string().trim().max(2_000).nullable(),
    userNotes: z.string().trim().max(5_000).nullable(),
    userConfirmed: z.boolean(),
  })
  .strict();

export async function getProjectOperatorContext(projectId: string) {
  await ensureOfficialOperatorRoster();
  const [project, context, operators] = await Promise.all([
    db.project.findUnique({ where: { id: projectId } }),
    db.projectOperatorContext.findUnique({ where: { projectId } }),
    db.siegeOperator.findMany({
      include: {
        versions: { where: { isCurrent: true }, take: 1 },
      },
      orderBy: { displayName: "asc" },
    }),
  ]);
  if (!project)
    throw new AppError(
      "That project no longer exists.",
      404,
      "PROJECT_NOT_FOUND",
    );
  return {
    context: context
      ? {
          playerOperatorId: context.playerOperatorId,
          operatorVersionId: context.operatorVersionId,
          teamOperatorIds: parseJson<string[]>(context.teamOperatorIdsJson, []),
          enemyOperatorIds: parseJson<string[]>(
            context.enemyOperatorIdsJson,
            [],
          ),
          side: context.side,
          uniqueAbilityUsed: context.uniqueAbilityUsed,
          secondaryGadgetUsed: context.secondaryGadgetUsed,
          abilityUseTimestamp: context.abilityUseTimestamp,
          abilityResult: context.abilityResult,
          target: context.target,
          abilitySucceeded: context.abilitySucceeded,
          tacticalPurpose: context.tacticalPurpose,
          userNotes: context.userNotes,
          userConfirmed: context.userConfirmed,
        }
      : null,
    operators: operators.map((operator) => ({
      id: operator.id,
      slug: operator.slug,
      displayName: operator.displayName,
      side: operator.side,
      versionId: operator.versions[0]?.id ?? null,
      versionName: operator.versions[0]?.versionName ?? null,
      abilityName: operator.versions[0]?.officialAbilityName ?? null,
    })),
    projectDurationSeconds: project.durationSeconds,
  };
}

export type ProjectOperatorContextDto = Awaited<
  ReturnType<typeof getProjectOperatorContext>
>;

export async function updateProjectOperatorContext(
  projectId: string,
  rawInput: unknown,
) {
  const input = projectContextSchema.parse(rawInput);
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project)
    throw new AppError(
      "That project no longer exists.",
      404,
      "PROJECT_NOT_FOUND",
    );
  if (
    input.abilityUseTimestamp !== null &&
    input.abilityUseTimestamp > project.durationSeconds
  ) {
    throw new AppError(
      "The ability timestamp must be inside the recording.",
      400,
      "OPERATOR_TIMESTAMP_OUT_OF_RANGE",
    );
  }
  if (input.playerOperatorId) {
    const operator = await db.siegeOperator.findUnique({
      where: { id: input.playerOperatorId },
      include: { versions: true },
    });
    if (
      !operator ||
      (input.operatorVersionId &&
        !operator.versions.some(
          (version) => version.id === input.operatorVersionId,
        ))
    ) {
      throw new AppError(
        "The selected operator version does not belong to that operator.",
        400,
        "OPERATOR_CONTEXT_REFERENCE_INVALID",
      );
    }
  }
  await db.projectOperatorContext.upsert({
    where: { projectId },
    create: {
      projectId,
      playerOperatorId: input.playerOperatorId,
      operatorVersionId: input.operatorVersionId,
      teamOperatorIdsJson: JSON.stringify(input.teamOperatorIds),
      enemyOperatorIdsJson: JSON.stringify(input.enemyOperatorIds),
      side: input.side,
      uniqueAbilityUsed: input.uniqueAbilityUsed,
      secondaryGadgetUsed: input.secondaryGadgetUsed,
      abilityUseTimestamp: input.abilityUseTimestamp,
      abilityResult: input.abilityResult,
      target: input.target,
      abilitySucceeded: input.abilitySucceeded,
      tacticalPurpose: input.tacticalPurpose,
      userNotes: input.userNotes,
      userConfirmed: input.userConfirmed,
    },
    update: {
      playerOperatorId: input.playerOperatorId,
      operatorVersionId: input.operatorVersionId,
      teamOperatorIdsJson: JSON.stringify(input.teamOperatorIds),
      enemyOperatorIdsJson: JSON.stringify(input.enemyOperatorIds),
      side: input.side,
      uniqueAbilityUsed: input.uniqueAbilityUsed,
      secondaryGadgetUsed: input.secondaryGadgetUsed,
      abilityUseTimestamp: input.abilityUseTimestamp,
      abilityResult: input.abilityResult,
      target: input.target,
      abilitySucceeded: input.abilitySucceeded,
      tacticalPurpose: input.tacticalPurpose,
      userNotes: input.userNotes,
      userConfirmed: input.userConfirmed,
    },
  });
  return getProjectOperatorContext(projectId);
}

export type VerifiedOperatorWritingContext = {
  provenance: "USER_CONFIRMED";
  operator: string;
  operatorVersion: string | null;
  side: ProjectOperatorSide;
  verifiedGeneralAbility: string | null;
  userProvidedAction: string | null;
  userProvidedResult: string | null;
  unknowns: string[];
};

export async function getVerifiedOperatorWritingContext(
  projectId: string,
): Promise<VerifiedOperatorWritingContext | null> {
  const state = await getProjectOperatorContext(projectId);
  if (!state.context?.userConfirmed || !state.context.playerOperatorId)
    return null;
  const operator = state.operators.find(
    (item) => item.id === state.context?.playerOperatorId,
  );
  if (!operator) return null;
  return {
    provenance: "USER_CONFIRMED",
    operator: operator.displayName,
    operatorVersion: operator.versionName,
    side: state.context.side,
    verifiedGeneralAbility: operator.abilityName,
    userProvidedAction: state.context.uniqueAbilityUsed,
    userProvidedResult: state.context.abilityResult,
    unknowns: [
      ...(state.context.abilitySucceeded === null
        ? ["Whether the ability succeeded"]
        : []),
      ...(!state.context.target ? ["The ability target"] : []),
    ],
  };
}

export const OPERATOR_ROLE_SOURCES: readonly OperatorRoleSource[] = [
  "OFFICIAL_SPECIALTY",
  "COMMUNITY_ROLE",
  "USER_ASSIGNED",
  "INFERRED_TACTICAL_ROLE",
];

export const OPERATOR_KNOWLEDGE_SOURCES: readonly OperatorKnowledgeSource[] = [
  "OFFICIAL",
  "USER_ENTERED",
  "COMMUNITY_DERIVED",
  "INFERRED",
  "UNVERIFIED",
];

export const OPERATOR_SIDES: readonly OperatorSide[] = ["ATTACKER", "DEFENDER"];
