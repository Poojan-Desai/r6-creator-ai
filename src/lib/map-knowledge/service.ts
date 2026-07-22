import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

import type {
  MapCalloutKind,
  MapKnowledgeSource,
  Prisma,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { resolveDataPath } from "@/lib/data-paths";
import { AppError } from "@/lib/errors";
import {
  CURRENT_GAME_DATA_VERSION,
  OFFICIAL_MAP_DATA_VERSION,
  OFFICIAL_MAP_INDEX_URL,
  OFFICIAL_MAP_RETRIEVED_AT,
  OFFICIAL_MAPS,
} from "@/lib/map-knowledge/official-data";
import {
  BOMB_SITE_ELEMENT_ROLES,
  MAP_COORDINATE_SYSTEM,
  MAP_EDITOR_SCHEMA_VERSION,
  MAP_EXPORT_SCHEMA_VERSION,
  mapEditorDocumentSchema,
  mapExportDocumentSchema,
  projectMapContextInputSchema,
  type MapEditorDocument,
  type MapExportDocument,
  type ProjectMapContextInput,
  type WritingMapContext,
} from "@/lib/map-knowledge/types";
import { findPossibleGraphRoutes } from "@/lib/map-knowledge/graph";

const MAP_APPLICATION_VERSION = "phase3b2m-v1";

const mapListQuerySchema = z.object({
  search: z.string().trim().max(200).optional().default(""),
  playlist: z
    .enum([
      "ALL",
      "RANKED",
      "UNRANKED",
      "QUICK_MATCH",
      "TEAM_DEATHMATCH",
      "EVENT_ONLY",
      "DUAL_FRONT",
    ])
    .optional()
    .default("ALL"),
});

const duplicateVersionSchema = z.object({
  versionName: z.string().trim().min(1).max(160),
  versionKey: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  notes: z.string().trim().max(2_000).optional().default(""),
});

const manualMapSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  versionName: z.string().trim().min(1).max(160),
  versionKey: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  location: z.string().trim().max(160).optional().default(""),
  description: z.string().trim().max(2_000).optional().default(""),
  sourceUrl: z.string().trim().url().max(2_000),
  sourceTitle: z.string().trim().min(1).max(240),
  aliases: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
});

const mapAliasSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  calloutKind: z
    .enum(["OFFICIAL", "COMMUNITY", "PERSONAL", "IMPORTED", "UNVERIFIED"])
    .default("PERSONAL"),
  confidence: z.number().finite().min(0).max(1).default(1),
});

type MapVersionWithEditorData = Prisma.MapVersionGetPayload<{
  include: {
    map: true;
    floors: { orderBy: { sortOrder: "asc" } };
    elements: { include: { aliases: true } };
    connections: true;
    bombSites: { include: { elementLinks: true } };
    citations: true;
    blueprintAssets: true;
  };
}>;

function normalized(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function searchTokenForms(token: string) {
  const forms = new Set([token]);
  if (token.endsWith("ies") && token.length > 3) {
    forms.add(`${token.slice(0, -3)}y`);
  } else if (token.endsWith("ches") && token.length > 4) {
    forms.add(token.slice(0, -2));
  } else if (token.endsWith("s") && token.length > 3) {
    forms.add(token.slice(0, -1));
  }
  return [...forms];
}

export function mapSearchTextMatches(text: string, queryText: string) {
  const haystack = normalized(text);
  return normalized(queryText)
    .split(" ")
    .filter(Boolean)
    .every((token) =>
      searchTokenForms(token).some((form) => haystack.includes(form)),
    );
}

function asDate(value: string | undefined) {
  return value ? new Date(value) : null;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function ensureOfficialMapKnowledge() {
  const verificationDate = new Date(CURRENT_GAME_DATA_VERSION.verificationDate);
  const gameDataVersion = await db.gameDataVersion.upsert({
    where: { stableId: CURRENT_GAME_DATA_VERSION.stableId },
    create: {
      stableId: CURRENT_GAME_DATA_VERSION.stableId,
      year: CURRENT_GAME_DATA_VERSION.year,
      seasonName: CURRENT_GAME_DATA_VERSION.seasonName,
      seasonNumber: CURRENT_GAME_DATA_VERSION.seasonNumber,
      releaseDate: new Date(CURRENT_GAME_DATA_VERSION.releaseDate),
      verificationDate,
      notes: CURRENT_GAME_DATA_VERSION.notes,
      sourceUrl: CURRENT_GAME_DATA_VERSION.sourceUrl,
      sourceTitle: CURRENT_GAME_DATA_VERSION.sourceTitle,
    },
    update: {
      verificationDate,
      notes: CURRENT_GAME_DATA_VERSION.notes,
      sourceUrl: CURRENT_GAME_DATA_VERSION.sourceUrl,
      sourceTitle: CURRENT_GAME_DATA_VERSION.sourceTitle,
    },
  });

  for (const official of OFFICIAL_MAPS) {
    const map = await db.siegeMap.upsert({
      where: { stableId: official.stableId },
      create: {
        stableId: official.stableId,
        slug: official.slug,
        name: official.name,
        officialDescription: official.description,
        location: official.location,
        releaseLabel: official.releaseLabel,
        releaseDate: asDate(official.releaseDate),
        modernizationLabel: official.modernizationLabel ?? null,
        modernizationDate: asDate(official.modernizationDate),
        lifecycleStatus: official.lifecycleStatus ?? "ACTIVE",
        knowledgeStatus: "CURRENT",
        sourceType: "OFFICIAL",
        officialSourceUrl: official.sourceUrl,
        officialSourceTitle: official.sourceTitle,
        retrievedAt: new Date(OFFICIAL_MAP_RETRIEVED_AT),
        lastVerifiedAt: verificationDate,
        officialBlueprintAvailable: official.blueprintAvailable,
        officialBlueprintPageUrl: official.blueprintAvailable
          ? official.sourceUrl
          : null,
      },
      update: {
        slug: official.slug,
        name: official.name,
        officialDescription: official.description,
        location: official.location,
        releaseLabel: official.releaseLabel,
        releaseDate: asDate(official.releaseDate),
        modernizationLabel: official.modernizationLabel ?? null,
        modernizationDate: asDate(official.modernizationDate),
        lifecycleStatus: official.lifecycleStatus ?? "ACTIVE",
        knowledgeStatus: "CURRENT",
        officialSourceUrl: official.sourceUrl,
        officialSourceTitle: official.sourceTitle,
        lastVerifiedAt: verificationDate,
        officialBlueprintAvailable: official.blueprintAvailable,
        officialBlueprintPageUrl: official.blueprintAvailable
          ? official.sourceUrl
          : null,
      },
    });

    const mapVersionStableId = `${official.stableId}:${official.versionKey}`;
    const version = await db.mapVersion.upsert({
      where: { stableId: mapVersionStableId },
      create: {
        stableId: mapVersionStableId,
        mapId: map.id,
        gameDataVersionId: gameDataVersion.id,
        versionKey: official.versionKey,
        versionName: official.versionName,
        effectiveDate:
          asDate(official.modernizationDate) ?? asDate(official.releaseDate),
        knowledgeStatus: "CURRENT",
        sourceType: "OFFICIAL",
        sourceUrl: official.sourceUrl,
        sourceTitle: official.sourceTitle,
        confidence: 1,
        lastVerifiedAt: verificationDate,
      },
      update: {
        gameDataVersionId: gameDataVersion.id,
        versionName: official.versionName,
        sourceUrl: official.sourceUrl,
        sourceTitle: official.sourceTitle,
        lastVerifiedAt: verificationDate,
      },
    });

    await db.mapSourceCitation.upsert({
      where: {
        stableId: `official-map:${official.stableId}:${OFFICIAL_MAP_DATA_VERSION}`,
      },
      create: {
        stableId: `official-map:${official.stableId}:${OFFICIAL_MAP_DATA_VERSION}`,
        mapId: map.id,
        mapVersionId: version.id,
        title: official.sourceTitle,
        url: official.sourceUrl,
        sourceType: "OFFICIAL",
        retrievedAt: new Date(OFFICIAL_MAP_RETRIEVED_AT),
        lastVerifiedAt: verificationDate,
        notes:
          "Official Ubisoft map page used for map metadata and blueprint availability.",
      },
      update: {
        title: official.sourceTitle,
        url: official.sourceUrl,
        lastVerifiedAt: verificationDate,
      },
    });

    for (const alias of official.aliases ?? []) {
      await db.mapAlias.upsert({
        where: {
          mapId_normalizedName: {
            mapId: map.id,
            normalizedName: normalized(alias),
          },
        },
        create: {
          mapId: map.id,
          displayName: alias,
          normalizedName: normalized(alias),
          calloutKind: "OFFICIAL",
          sourceType: "OFFICIAL",
          confidence: 1,
          lastVerifiedAt: verificationDate,
        },
        update: {
          displayName: alias,
          lastVerifiedAt: verificationDate,
        },
      });
    }

    for (const playlist of official.playlists) {
      await db.mapPlaylistStatus.upsert({
        where: {
          mapId_gameDataVersionId_playlist: {
            mapId: map.id,
            gameDataVersionId: gameDataVersion.id,
            playlist: playlist.playlist,
          },
        },
        create: {
          mapId: map.id,
          gameDataVersionId: gameDataVersion.id,
          playlist: playlist.playlist,
          availability: playlist.availability,
          sourceType: "OFFICIAL",
          sourceUrl: playlist.sourceUrl ?? official.sourceUrl,
          sourceTitle: playlist.sourceTitle ?? official.sourceTitle,
          notes: playlist.notes ?? null,
          lastVerifiedAt: verificationDate,
        },
        update: {
          availability: playlist.availability,
          sourceUrl: playlist.sourceUrl ?? official.sourceUrl,
          sourceTitle: playlist.sourceTitle ?? official.sourceTitle,
          notes: playlist.notes ?? null,
          lastVerifiedAt: verificationDate,
        },
      });
    }
  }
  return gameDataVersion;
}

export async function listMapKnowledge(input: unknown = {}) {
  await ensureOfficialMapKnowledge();
  const query = mapListQuerySchema.parse(input);
  const search = normalized(query.search);
  const maps = await db.siegeMap.findMany({
    include: {
      aliases: true,
      versions: {
        orderBy: { effectiveDate: "desc" },
        include: {
          _count: {
            select: {
              floors: true,
              elements: true,
              bombSites: true,
              connections: true,
              blueprintAssets: true,
            },
          },
        },
      },
      playlistStatuses: {
        where: { gameDataVersion: { stableId: OFFICIAL_MAP_DATA_VERSION } },
      },
    },
    orderBy: { name: "asc" },
  });
  return maps
    .filter((map) => {
      const matchesText =
        !search ||
        normalized(map.name).includes(search) ||
        normalized(map.stableId).includes(search) ||
        map.aliases.some((alias) =>
          normalized(alias.displayName).includes(search),
        );
      const matchesPlaylist =
        query.playlist === "ALL" ||
        map.playlistStatuses.some(
          (status) =>
            status.playlist === query.playlist &&
            status.availability === "ACTIVE",
        );
      return matchesText && matchesPlaylist;
    })
    .map((map) => {
      const currentVersion =
        map.versions.find((version) => version.knowledgeStatus === "CURRENT") ??
        map.versions[0] ??
        null;
      return {
        id: map.id,
        stableId: map.stableId,
        slug: map.slug,
        name: map.name,
        location: map.location,
        releaseLabel: map.releaseLabel,
        modernizationLabel: map.modernizationLabel,
        lifecycleStatus: map.lifecycleStatus,
        knowledgeStatus: map.knowledgeStatus,
        blueprintAvailable: map.officialBlueprintAvailable,
        sourceUrl: map.officialSourceUrl,
        lastVerifiedAt: map.lastVerifiedAt.toISOString(),
        aliases: map.aliases.map((alias) => alias.displayName),
        playlists: map.playlistStatuses.map((status) => ({
          playlist: status.playlist,
          availability: status.availability,
          sourceUrl: status.sourceUrl,
        })),
        versionCount: map.versions.length,
        currentVersion: currentVersion
          ? {
              id: currentVersion.id,
              stableId: currentVersion.stableId,
              name: currentVersion.versionName,
              status: currentVersion.knowledgeStatus,
              counts: currentVersion._count,
            }
          : null,
      };
    });
}

export async function createManualMap(input: unknown) {
  const fields = manualMapSchema.parse(input);
  const existing = await db.siegeMap.findFirst({
    where: { OR: [{ slug: fields.slug }, { stableId: fields.slug }] },
  });
  if (existing)
    throw new AppError(
      "A map with that name or URL key already exists.",
      409,
      "MAP_EXISTS",
    );
  const now = new Date();
  return db.siegeMap.create({
    data: {
      stableId: fields.slug,
      slug: fields.slug,
      name: fields.name,
      officialDescription: fields.description,
      location: fields.location || null,
      releaseLabel: "Manually entered",
      lifecycleStatus: "ACTIVE",
      knowledgeStatus: "UNVERIFIED",
      sourceType: "MANUAL",
      officialSourceUrl: fields.sourceUrl,
      officialSourceTitle: fields.sourceTitle,
      retrievedAt: now,
      lastVerifiedAt: now,
      officialBlueprintAvailable: false,
      aliases: {
        create: fields.aliases.map((alias) => ({
          displayName: alias,
          normalizedName: normalized(alias),
          calloutKind: "PERSONAL",
          sourceType: "MANUAL",
          confidence: 1,
          lastVerifiedAt: now,
        })),
      },
      versions: {
        create: {
          stableId: `${fields.slug}:${fields.versionKey}`,
          versionKey: fields.versionKey,
          versionName: fields.versionName,
          effectiveDate: now,
          knowledgeStatus: "UNVERIFIED",
          sourceType: "MANUAL",
          sourceUrl: fields.sourceUrl,
          sourceTitle: fields.sourceTitle,
          confidence: 1,
          lastVerifiedAt: now,
        },
      },
      citations: {
        create: {
          stableId: `manual-map:${fields.slug}:${randomUUID()}`,
          title: fields.sourceTitle,
          url: fields.sourceUrl,
          sourceType: "MANUAL",
          retrievedAt: now,
          lastVerifiedAt: now,
        },
      },
    },
  });
}

export async function addMapAlias(slug: string, input: unknown) {
  const fields = mapAliasSchema.parse(input);
  const map = await db.siegeMap.findUnique({ where: { slug } });
  if (!map)
    throw new AppError("That map does not exist.", 404, "MAP_NOT_FOUND");
  return db.mapAlias.upsert({
    where: {
      mapId_normalizedName: {
        mapId: map.id,
        normalizedName: normalized(fields.displayName),
      },
    },
    create: {
      mapId: map.id,
      displayName: fields.displayName,
      normalizedName: normalized(fields.displayName),
      calloutKind: fields.calloutKind,
      sourceType: "MANUAL",
      confidence: fields.confidence,
      lastVerifiedAt: new Date(),
    },
    update: {
      displayName: fields.displayName,
      calloutKind: fields.calloutKind,
      confidence: fields.confidence,
    },
  });
}

export async function deleteMapAlias(aliasId: string) {
  const alias = await db.mapAlias.findUnique({ where: { id: aliasId } });
  if (!alias)
    throw new AppError(
      "That alias does not exist.",
      404,
      "MAP_ALIAS_NOT_FOUND",
    );
  if (alias.sourceType === "OFFICIAL") {
    throw new AppError(
      "Official aliases are source records and cannot be deleted. Add a personal preference instead.",
      409,
      "MAP_ALIAS_OFFICIAL",
    );
  }
  await db.mapAlias.delete({ where: { id: aliasId } });
}

export async function deleteManualMap(slug: string) {
  const map = await db.siegeMap.findUnique({
    where: { slug },
    include: { versions: { include: { blueprintAssets: true } } },
  });
  if (!map)
    throw new AppError("That map does not exist.", 404, "MAP_NOT_FOUND");
  if (map.sourceType === "OFFICIAL") {
    throw new AppError(
      "Official map records are preserved. Delete only user-created map versions or annotations.",
      409,
      "OFFICIAL_MAP_PRESERVED",
    );
  }
  const assetPaths = map.versions.flatMap((version) =>
    version.blueprintAssets.map((asset) => asset.relativePath),
  );
  await db.siegeMap.delete({ where: { id: map.id } });
  await Promise.all(
    assetPaths.map((relativePath) =>
      rm(resolveDataPath(relativePath), { force: true }),
    ),
  );
}

export async function deleteManualMapVersion(versionId: string) {
  const version = await db.mapVersion.findUnique({
    where: { id: versionId },
    include: { blueprintAssets: true },
  });
  if (!version)
    throw new AppError(
      "That map version does not exist.",
      404,
      "MAP_VERSION_NOT_FOUND",
    );
  if (version.sourceType === "OFFICIAL") {
    throw new AppError(
      "Official and historical versions are preserved. Duplicate the version before editing large layout changes.",
      409,
      "OFFICIAL_MAP_VERSION_PRESERVED",
    );
  }
  const assetPaths = version.blueprintAssets.map((asset) => asset.relativePath);
  await db.mapVersion.delete({ where: { id: versionId } });
  await Promise.all(
    assetPaths.map((relativePath) =>
      rm(resolveDataPath(relativePath), { force: true }),
    ),
  );
}

async function findVersionWithEditorData(id: string) {
  return db.mapVersion.findUnique({
    where: { id },
    include: {
      map: true,
      floors: { orderBy: { sortOrder: "asc" } },
      elements: { include: { aliases: true } },
      connections: true,
      bombSites: { include: { elementLinks: true } },
      citations: true,
      blueprintAssets: true,
    },
  });
}

export function serializeEditorDocument(
  version: MapVersionWithEditorData,
  preferredCalloutKind: MapCalloutKind = "OFFICIAL",
  preferredCalloutNotes = "",
): MapEditorDocument {
  const floorStableIds = new Map(
    version.floors.map((floor) => [floor.id, floor.stableId]),
  );
  const elementStableIds = new Map(
    version.elements.map((element) => [element.id, element.stableId]),
  );
  const bombSiteStableIds = new Map(
    version.bombSites.map((site) => [site.id, site.stableId]),
  );
  return {
    schemaVersion: MAP_EDITOR_SCHEMA_VERSION,
    versionStableId: version.stableId,
    preferredCalloutKind,
    preferredCalloutNotes,
    floors: version.floors.map((floor) => ({
      stableId: floor.stableId,
      displayName: floor.displayName,
      shortName: floor.shortName ?? "",
      sortOrder: floor.sortOrder,
      elevation: floor.elevation,
      confidence: floor.confidence,
      notes: floor.notes ?? "",
    })),
    elements: version.elements.map((element) => ({
      stableId: element.stableId,
      floorStableId: element.floorId
        ? (floorStableIds.get(element.floorId) ?? null)
        : null,
      elementType: element.elementType,
      displayName: element.displayName,
      canonicalCallout: element.canonicalCallout ?? "",
      calloutKind: element.calloutKind,
      geometryType: element.geometryType,
      geometry: parseJson(element.geometryJson, []),
      confidence: element.confidence,
      notes: element.notes ?? "",
      commonAttackerApproach: element.commonAttackerApproach ?? "",
      commonDefenderHold: element.commonDefenderHold ?? "",
      commonFlankRisk: element.commonFlankRisk ?? "",
      captionName: element.captionName ?? "",
      voiceoverName: element.voiceoverName ?? "",
      aliases: element.aliases.map((alias) => ({
        displayName: alias.displayName,
        calloutKind: alias.calloutKind,
        confidence: alias.confidence,
        notes: alias.notes ?? "",
      })),
    })),
    connections: version.connections.map((connection) => ({
      stableId: connection.stableId,
      fromElementStableId:
        elementStableIds.get(connection.fromElementId) ?? "missing",
      toElementStableId:
        elementStableIds.get(connection.toElementId) ?? "missing",
      connectionType: connection.connectionType,
      isBidirectional: connection.isBidirectional,
      traversable: connection.traversable,
      destructible: connection.destructible,
      floorChange: connection.floorChange,
      requiredAction: connection.requiredAction ?? "",
      notes: connection.notes ?? "",
      confidence: connection.confidence,
    })),
    bombSites: version.bombSites.map((site) => ({
      stableId: site.stableId,
      floorStableId: site.floorId
        ? (floorStableIds.get(site.floorId) ?? null)
        : null,
      displayName: site.displayName,
      siteAName: site.siteAName,
      siteBName: site.siteBName,
      tacticalNotes: site.tacticalNotes ?? "",
      confidence: site.confidence,
      elementLinks: site.elementLinks.map((link) => ({
        elementStableId: elementStableIds.get(link.elementId) ?? "missing",
        role: link.role as (typeof BOMB_SITE_ELEMENT_ROLES)[number],
        notes: link.notes ?? "",
      })),
    })),
    citations: version.citations
      .filter((citation) => citation.sourceType !== "OFFICIAL")
      .map((citation) => ({
        stableId: citation.stableId,
        floorStableId: citation.floorId
          ? (floorStableIds.get(citation.floorId) ?? null)
          : null,
        elementStableId: citation.elementId
          ? (elementStableIds.get(citation.elementId) ?? null)
          : null,
        bombSiteStableId: citation.bombSiteId
          ? (bombSiteStableIds.get(citation.bombSiteId) ?? null)
          : null,
        title: citation.title,
        url: citation.url,
        notes: citation.notes ?? "",
        lastVerifiedAt: citation.lastVerifiedAt?.toISOString() ?? null,
      })),
    saveReason: "",
  };
}

export async function getMapDetail(slug: string) {
  await ensureOfficialMapKnowledge();
  const map = await db.siegeMap.findUnique({
    where: { slug },
    include: {
      aliases: true,
      playlistStatuses: {
        include: { gameDataVersion: true },
        orderBy: { createdAt: "desc" },
      },
      citations: { where: { sourceType: "OFFICIAL" } },
      calloutPreference: true,
      versions: {
        orderBy: [{ knowledgeStatus: "asc" }, { effectiveDate: "desc" }],
        include: {
          map: true,
          floors: { orderBy: { sortOrder: "asc" } },
          elements: { include: { aliases: true } },
          connections: true,
          bombSites: { include: { elementLinks: true } },
          citations: true,
          blueprintAssets: true,
        },
      },
    },
  });
  if (!map) return null;
  const preferredKind = map.calloutPreference?.preferredKind ?? "OFFICIAL";
  const preferredNotes = map.calloutPreference?.customNotes ?? "";
  return {
    id: map.id,
    stableId: map.stableId,
    slug: map.slug,
    name: map.name,
    officialDescription: map.officialDescription,
    location: map.location,
    releaseLabel: map.releaseLabel,
    modernizationLabel: map.modernizationLabel,
    lifecycleStatus: map.lifecycleStatus,
    knowledgeStatus: map.knowledgeStatus,
    sourceType: map.sourceType,
    sourceUrl: map.officialSourceUrl,
    sourceTitle: map.officialSourceTitle,
    retrievedAt: map.retrievedAt.toISOString(),
    lastVerifiedAt: map.lastVerifiedAt.toISOString(),
    blueprintAvailable: map.officialBlueprintAvailable,
    blueprintPageUrl: map.officialBlueprintPageUrl,
    aliases: map.aliases.map((alias) => ({
      id: alias.id,
      displayName: alias.displayName,
      calloutKind: alias.calloutKind,
      sourceType: alias.sourceType,
      confidence: alias.confidence,
    })),
    playlists: map.playlistStatuses.map((status) => ({
      playlist: status.playlist,
      availability: status.availability,
      sourceUrl: status.sourceUrl,
      sourceTitle: status.sourceTitle,
      notes: status.notes,
      dataVersion: status.gameDataVersion.stableId,
      lastVerifiedAt: status.lastVerifiedAt.toISOString(),
    })),
    officialCitations: map.citations.map((citation) => ({
      id: citation.id,
      title: citation.title,
      url: citation.url,
      lastVerifiedAt: citation.lastVerifiedAt?.toISOString() ?? null,
      notes: citation.notes,
    })),
    versions: map.versions.map((version) => ({
      id: version.id,
      stableId: version.stableId,
      versionKey: version.versionKey,
      versionName: version.versionName,
      knowledgeStatus: version.knowledgeStatus,
      sourceType: version.sourceType,
      confidence: version.confidence,
      notes: version.notes,
      lastVerifiedAt: version.lastVerifiedAt.toISOString(),
      document: serializeEditorDocument(version, preferredKind, preferredNotes),
      floorRecords: version.floors.map((floor) => ({
        id: floor.id,
        stableId: floor.stableId,
        displayName: floor.displayName,
      })),
      elementRecords: version.elements.map((element) => ({
        id: element.id,
        stableId: element.stableId,
      })),
      bombSiteRecords: version.bombSites.map((site) => ({
        id: site.id,
        stableId: site.stableId,
      })),
      blueprintAssets: version.blueprintAssets.map((asset) => ({
        id: asset.id,
        stableId: asset.stableId,
        floorId: asset.floorId,
        parentAssetId: asset.parentAssetId,
        assetKind: asset.assetKind,
        originalFileName: asset.originalFileName,
        mimeType: asset.mimeType,
        fileSizeBytes: Number(asset.fileSizeBytes),
        width: asset.width,
        height: asset.height,
        sourceUrl: asset.sourceUrl,
        sourceTitle: asset.sourceTitle,
        importedAt: asset.importedAt.toISOString(),
      })),
    })),
  };
}

export type MapDetail = NonNullable<Awaited<ReturnType<typeof getMapDetail>>>;

export async function saveMapEditorDocument(
  versionId: string,
  input: unknown,
  sourceType: MapKnowledgeSource = "MANUAL",
) {
  const document = mapEditorDocumentSchema.parse(input);
  const version = await findVersionWithEditorData(versionId);
  if (!version) {
    throw new AppError(
      "That map version does not exist.",
      404,
      "MAP_VERSION_NOT_FOUND",
    );
  }
  if (document.versionStableId !== version.stableId) {
    throw new AppError(
      "This map document belongs to a different version.",
      409,
      "MAP_VERSION_MISMATCH",
    );
  }
  const before = serializeEditorDocument(version);
  const now = new Date();
  const undoGroup = randomUUID();

  await db.$transaction(async (transaction) => {
    const stableIds = [
      ...document.floors.map((item) => item.stableId),
      ...document.elements.map((item) => item.stableId),
      ...document.connections.map((item) => item.stableId),
      ...document.bombSites.map((item) => item.stableId),
      ...document.citations.map((item) => item.stableId),
    ];
    const foreignCount =
      (await transaction.mapFloor.count({
        where: {
          stableId: { in: stableIds },
          mapVersionId: { not: versionId },
        },
      })) +
      (await transaction.mapElement.count({
        where: {
          stableId: { in: stableIds },
          mapVersionId: { not: versionId },
        },
      })) +
      (await transaction.mapConnection.count({
        where: {
          stableId: { in: stableIds },
          mapVersionId: { not: versionId },
        },
      })) +
      (await transaction.mapBombSitePair.count({
        where: {
          stableId: { in: stableIds },
          mapVersionId: { not: versionId },
        },
      })) +
      (await transaction.mapSourceCitation.count({
        where: {
          stableId: { in: stableIds },
          mapVersionId: { not: versionId },
        },
      }));
    if (foreignCount > 0) {
      throw new AppError(
        "A stable ID in this document is already used by another map version.",
        409,
        "MAP_STABLE_ID_CONFLICT",
      );
    }

    for (const floor of document.floors) {
      await transaction.mapFloor.upsert({
        where: { stableId: floor.stableId },
        create: {
          stableId: floor.stableId,
          mapVersionId: versionId,
          displayName: floor.displayName,
          shortName: floor.shortName || null,
          sortOrder: floor.sortOrder,
          elevation: floor.elevation,
          sourceType,
          confidence: floor.confidence,
          notes: floor.notes || null,
          lastVerifiedAt: sourceType === "MANUAL" ? now : null,
        },
        update: {
          displayName: floor.displayName,
          shortName: floor.shortName || null,
          sortOrder: floor.sortOrder,
          elevation: floor.elevation,
          confidence: floor.confidence,
          notes: floor.notes || null,
        },
      });
    }
    const floorRecords = await transaction.mapFloor.findMany({
      where: { mapVersionId: versionId },
    });
    const floorIds = new Map(
      floorRecords.map((floor) => [floor.stableId, floor.id]),
    );

    await transaction.mapConnection.deleteMany({
      where: {
        mapVersionId: versionId,
        stableId: { notIn: document.connections.map((item) => item.stableId) },
      },
    });
    await transaction.mapBombSitePair.deleteMany({
      where: {
        mapVersionId: versionId,
        stableId: { notIn: document.bombSites.map((item) => item.stableId) },
      },
    });
    await transaction.mapElement.deleteMany({
      where: {
        mapVersionId: versionId,
        stableId: { notIn: document.elements.map((item) => item.stableId) },
      },
    });

    for (const element of document.elements) {
      const floorId = element.floorStableId
        ? floorIds.get(element.floorStableId)
        : null;
      const saved = await transaction.mapElement.upsert({
        where: { stableId: element.stableId },
        create: {
          stableId: element.stableId,
          mapVersionId: versionId,
          floorId,
          elementType: element.elementType,
          displayName: element.displayName,
          canonicalCallout: element.canonicalCallout || null,
          calloutKind: element.calloutKind,
          geometryType: element.geometryType,
          geometryJson: JSON.stringify(element.geometry),
          sourceType,
          confidence: element.confidence,
          notes: element.notes || null,
          commonAttackerApproach: element.commonAttackerApproach || null,
          commonDefenderHold: element.commonDefenderHold || null,
          commonFlankRisk: element.commonFlankRisk || null,
          captionName: element.captionName || null,
          voiceoverName: element.voiceoverName || null,
          lastVerifiedAt: sourceType === "MANUAL" ? now : null,
        },
        update: {
          floorId,
          elementType: element.elementType,
          displayName: element.displayName,
          canonicalCallout: element.canonicalCallout || null,
          calloutKind: element.calloutKind,
          geometryType: element.geometryType,
          geometryJson: JSON.stringify(element.geometry),
          confidence: element.confidence,
          notes: element.notes || null,
          commonAttackerApproach: element.commonAttackerApproach || null,
          commonDefenderHold: element.commonDefenderHold || null,
          commonFlankRisk: element.commonFlankRisk || null,
          captionName: element.captionName || null,
          voiceoverName: element.voiceoverName || null,
        },
      });
      await transaction.mapElementAlias.deleteMany({
        where: { elementId: saved.id },
      });
      if (element.aliases.length > 0) {
        await transaction.mapElementAlias.createMany({
          data: element.aliases.map((alias) => ({
            elementId: saved.id,
            displayName: alias.displayName,
            normalizedName: normalized(alias.displayName),
            calloutKind: alias.calloutKind,
            sourceType,
            confidence: alias.confidence,
            notes: alias.notes || null,
            lastVerifiedAt: sourceType === "MANUAL" ? now : null,
          })),
        });
      }
    }
    const elementRecords = await transaction.mapElement.findMany({
      where: { mapVersionId: versionId },
    });
    const elementIds = new Map(
      elementRecords.map((element) => [element.stableId, element.id]),
    );

    for (const connection of document.connections) {
      await transaction.mapConnection.upsert({
        where: { stableId: connection.stableId },
        create: {
          stableId: connection.stableId,
          mapVersionId: versionId,
          fromElementId: elementIds.get(connection.fromElementStableId)!,
          toElementId: elementIds.get(connection.toElementStableId)!,
          connectionType: connection.connectionType,
          isBidirectional: connection.isBidirectional,
          traversable: connection.traversable,
          destructible: connection.destructible,
          floorChange: connection.floorChange,
          requiredAction: connection.requiredAction || null,
          notes: connection.notes || null,
          sourceType,
          confidence: connection.confidence,
          lastVerifiedAt: sourceType === "MANUAL" ? now : null,
        },
        update: {
          fromElementId: elementIds.get(connection.fromElementStableId)!,
          toElementId: elementIds.get(connection.toElementStableId)!,
          connectionType: connection.connectionType,
          isBidirectional: connection.isBidirectional,
          traversable: connection.traversable,
          destructible: connection.destructible,
          floorChange: connection.floorChange,
          requiredAction: connection.requiredAction || null,
          notes: connection.notes || null,
          confidence: connection.confidence,
        },
      });
    }

    for (const bombSite of document.bombSites) {
      const saved = await transaction.mapBombSitePair.upsert({
        where: { stableId: bombSite.stableId },
        create: {
          stableId: bombSite.stableId,
          mapVersionId: versionId,
          floorId: bombSite.floorStableId
            ? floorIds.get(bombSite.floorStableId)
            : null,
          displayName: bombSite.displayName,
          siteAName: bombSite.siteAName,
          siteBName: bombSite.siteBName,
          tacticalNotes: bombSite.tacticalNotes || null,
          sourceType,
          confidence: bombSite.confidence,
          lastVerifiedAt: sourceType === "MANUAL" ? now : null,
        },
        update: {
          floorId: bombSite.floorStableId
            ? floorIds.get(bombSite.floorStableId)
            : null,
          displayName: bombSite.displayName,
          siteAName: bombSite.siteAName,
          siteBName: bombSite.siteBName,
          tacticalNotes: bombSite.tacticalNotes || null,
          confidence: bombSite.confidence,
        },
      });
      await transaction.mapBombSiteElement.deleteMany({
        where: { bombSiteId: saved.id },
      });
      if (bombSite.elementLinks.length > 0) {
        await transaction.mapBombSiteElement.createMany({
          data: bombSite.elementLinks.map((link) => ({
            bombSiteId: saved.id,
            elementId: elementIds.get(link.elementStableId)!,
            role: link.role,
            notes: link.notes || null,
          })),
        });
      }
    }
    const bombSiteRecords = await transaction.mapBombSitePair.findMany({
      where: { mapVersionId: versionId },
    });
    const bombSiteIds = new Map(
      bombSiteRecords.map((site) => [site.stableId, site.id]),
    );

    await transaction.mapSourceCitation.deleteMany({
      where: {
        mapVersionId: versionId,
        sourceType: { not: "OFFICIAL" },
        stableId: { notIn: document.citations.map((item) => item.stableId) },
      },
    });
    for (const citation of document.citations) {
      await transaction.mapSourceCitation.upsert({
        where: { stableId: citation.stableId },
        create: {
          stableId: citation.stableId,
          mapId: version.mapId,
          mapVersionId: versionId,
          floorId: citation.floorStableId
            ? floorIds.get(citation.floorStableId)
            : null,
          elementId: citation.elementStableId
            ? elementIds.get(citation.elementStableId)
            : null,
          bombSiteId: citation.bombSiteStableId
            ? bombSiteIds.get(citation.bombSiteStableId)
            : null,
          title: citation.title,
          url: citation.url,
          sourceType,
          retrievedAt: now,
          lastVerifiedAt: citation.lastVerifiedAt
            ? new Date(citation.lastVerifiedAt)
            : null,
          notes: citation.notes || null,
        },
        update: {
          floorId: citation.floorStableId
            ? floorIds.get(citation.floorStableId)
            : null,
          elementId: citation.elementStableId
            ? elementIds.get(citation.elementStableId)
            : null,
          bombSiteId: citation.bombSiteStableId
            ? bombSiteIds.get(citation.bombSiteStableId)
            : null,
          title: citation.title,
          url: citation.url,
          lastVerifiedAt: citation.lastVerifiedAt
            ? new Date(citation.lastVerifiedAt)
            : null,
          notes: citation.notes || null,
        },
      });
    }

    await transaction.mapFloor.deleteMany({
      where: {
        mapVersionId: versionId,
        stableId: { notIn: document.floors.map((item) => item.stableId) },
      },
    });
    await transaction.mapCalloutPreference.upsert({
      where: { mapId: version.mapId },
      create: {
        mapId: version.mapId,
        preferredKind: document.preferredCalloutKind,
        customNotes: document.preferredCalloutNotes || null,
      },
      update: {
        preferredKind: document.preferredCalloutKind,
        customNotes: document.preferredCalloutNotes || null,
      },
    });
    await transaction.mapEditHistory.create({
      data: {
        mapVersionId: versionId,
        operation: "SAVE_DOCUMENT",
        entityType: "MAP_VERSION",
        entityStableId: version.stableId,
        beforeJson: JSON.stringify(before),
        afterJson: JSON.stringify(document),
        undoGroup,
      },
    });
  });

  const saved = await findVersionWithEditorData(versionId);
  return serializeEditorDocument(
    saved!,
    document.preferredCalloutKind,
    document.preferredCalloutNotes,
  );
}

function remapDocumentStableIds(
  document: MapEditorDocument,
  versionStableId: string,
) {
  const floorMap = new Map(
    document.floors.map((floor, index) => [
      floor.stableId,
      `${versionStableId}:floor-${index + 1}`,
    ]),
  );
  const elementMap = new Map(
    document.elements.map((element, index) => [
      element.stableId,
      `${versionStableId}:element-${index + 1}`,
    ]),
  );
  const bombMap = new Map(
    document.bombSites.map((site, index) => [
      site.stableId,
      `${versionStableId}:bomb-${index + 1}`,
    ]),
  );
  return {
    ...document,
    versionStableId,
    floors: document.floors.map((floor) => ({
      ...floor,
      stableId: floorMap.get(floor.stableId)!,
    })),
    elements: document.elements.map((element) => ({
      ...element,
      stableId: elementMap.get(element.stableId)!,
      floorStableId: element.floorStableId
        ? floorMap.get(element.floorStableId)!
        : null,
    })),
    connections: document.connections.map((connection, index) => ({
      ...connection,
      stableId: `${versionStableId}:connection-${index + 1}`,
      fromElementStableId: elementMap.get(connection.fromElementStableId)!,
      toElementStableId: elementMap.get(connection.toElementStableId)!,
    })),
    bombSites: document.bombSites.map((site) => ({
      ...site,
      stableId: bombMap.get(site.stableId)!,
      floorStableId: site.floorStableId
        ? floorMap.get(site.floorStableId)!
        : null,
      elementLinks: site.elementLinks.map((link) => ({
        ...link,
        elementStableId: elementMap.get(link.elementStableId)!,
      })),
    })),
    citations: document.citations.map((citation, index) => ({
      ...citation,
      stableId: `${versionStableId}:citation-${index + 1}`,
      floorStableId: citation.floorStableId
        ? floorMap.get(citation.floorStableId)!
        : null,
      elementStableId: citation.elementStableId
        ? elementMap.get(citation.elementStableId)!
        : null,
      bombSiteStableId: citation.bombSiteStableId
        ? bombMap.get(citation.bombSiteStableId)!
        : null,
    })),
  } satisfies MapEditorDocument;
}

export async function duplicateMapVersion(versionId: string, input: unknown) {
  const fields = duplicateVersionSchema.parse(input);
  const source = await findVersionWithEditorData(versionId);
  if (!source) {
    throw new AppError(
      "That map version does not exist.",
      404,
      "MAP_VERSION_NOT_FOUND",
    );
  }
  const stableId = `${source.map.stableId}:${fields.versionKey}`;
  const existing = await db.mapVersion.findUnique({ where: { stableId } });
  if (existing) {
    throw new AppError(
      "That map already has a version with this key.",
      409,
      "MAP_VERSION_EXISTS",
    );
  }
  const version = await db.mapVersion.create({
    data: {
      stableId,
      mapId: source.mapId,
      parentVersionId: source.id,
      versionKey: fields.versionKey,
      versionName: fields.versionName,
      effectiveDate: new Date(),
      knowledgeStatus: "UNVERIFIED",
      sourceType: "MANUAL",
      sourceUrl: source.sourceUrl,
      sourceTitle: source.sourceTitle,
      confidence: source.confidence,
      notes: fields.notes || `Duplicated from ${source.versionName}.`,
      lastVerifiedAt: new Date(),
    },
  });
  const cloned = remapDocumentStableIds(
    serializeEditorDocument(source),
    stableId,
  );
  await saveMapEditorDocument(version.id, cloned, "MANUAL");
  return version;
}

export async function exportMapKnowledge(
  versionId: string,
  scope: MapExportDocument["exportScope"] = "COMPLETE_MAP",
  floorStableId?: string,
) {
  const version = await findVersionWithEditorData(versionId);
  if (!version) {
    throw new AppError(
      "That map version does not exist.",
      404,
      "MAP_VERSION_NOT_FOUND",
    );
  }
  let document = serializeEditorDocument(version);
  if (scope === "FLOOR") {
    if (
      !floorStableId ||
      !document.floors.some((floor) => floor.stableId === floorStableId)
    ) {
      throw new AppError(
        "Choose a valid floor for a floor-only export.",
        400,
        "MAP_EXPORT_FLOOR_REQUIRED",
      );
    }
    const elementIds = new Set(
      document.elements
        .filter((item) => item.floorStableId === floorStableId)
        .map((item) => item.stableId),
    );
    const bombSiteIds = new Set(
      document.bombSites
        .filter((site) => site.floorStableId === floorStableId)
        .map((site) => site.stableId),
    );
    document = filterMapDocument(document, {
      elementIds,
      bombSiteIds,
      floorIds: new Set([floorStableId]),
      includeConnections: true,
    });
  } else if (scope === "ROOMS") {
    const elementIds = new Set(
      document.elements
        .filter((item) =>
          ["ROOM", "OBJECTIVE_ROOM", "HALLWAY"].includes(item.elementType),
        )
        .map((item) => item.stableId),
    );
    document = filterMapDocument(document, {
      elementIds,
      bombSiteIds: new Set(),
      includeConnections: false,
    });
  } else if (scope === "BOMB_SITES") {
    document = { ...document, connections: [], citations: [] };
  } else if (scope === "CALLOUTS") {
    document = {
      ...document,
      connections: [],
      bombSites: [],
      elements: document.elements.map((item) => ({
        ...item,
        geometryType: "NONE",
        geometry: [],
      })),
    };
  } else if (scope === "TACTICAL_ANNOTATIONS") {
    const elementIds = new Set(
      document.elements
        .filter((item) =>
          [
            "COMMON_ROTATION",
            "COMMON_PLAYER_ROUTE",
            "DEFAULT_PLANT_LOCATION",
            "DEFAULT_DEFENSIVE_POSITION",
            "COMMON_ATTACKER_ENTRY_ROUTE",
            "COMMON_FLANK_ROUTE",
            "COMMON_UTILITY_POSITION",
          ].includes(item.elementType),
        )
        .map((item) => item.stableId),
    );
    document = filterMapDocument(document, {
      elementIds,
      bombSiteIds: new Set(),
      includeConnections: false,
    });
  } else if (scope === "CONNECTIVITY_GRAPH") {
    document = { ...document, bombSites: [], citations: [] };
  }
  return mapExportDocumentSchema.parse({
    schemaVersion: MAP_EXPORT_SCHEMA_VERSION,
    exportScope: scope,
    coordinateSystem: MAP_COORDINATE_SYSTEM,
    map: {
      stableId: version.map.stableId,
      name: version.map.name,
      versionStableId: version.stableId,
      versionName: version.versionName,
      knowledgeConfidence: version.confidence,
      source: {
        title: version.sourceTitle,
        url: version.sourceUrl,
        sourceType: version.sourceType,
        lastVerifiedAt: version.lastVerifiedAt.toISOString(),
      },
    },
    creationMetadata: {
      application: "R6 Creator AI",
      applicationVersion: MAP_APPLICATION_VERSION,
      createdAt: new Date().toISOString(),
    },
    document,
  });
}

function filterMapDocument(
  document: MapEditorDocument,
  options: {
    elementIds: Set<string>;
    bombSiteIds: Set<string>;
    floorIds?: Set<string>;
    includeConnections: boolean;
  },
): MapEditorDocument {
  const floors = options.floorIds
    ? document.floors.filter((floor) => options.floorIds?.has(floor.stableId))
    : document.floors;
  const floorIds = new Set(floors.map((floor) => floor.stableId));
  return {
    ...document,
    floors,
    elements: document.elements.filter((element) =>
      options.elementIds.has(element.stableId),
    ),
    connections: options.includeConnections
      ? document.connections.filter(
          (connection) =>
            options.elementIds.has(connection.fromElementStableId) &&
            options.elementIds.has(connection.toElementStableId),
        )
      : [],
    bombSites: document.bombSites
      .filter((site) => options.bombSiteIds.has(site.stableId))
      .map((site) => ({
        ...site,
        elementLinks: site.elementLinks.filter((link) =>
          options.elementIds.has(link.elementStableId),
        ),
      })),
    citations: document.citations.filter(
      (citation) =>
        (!citation.floorStableId || floorIds.has(citation.floorStableId)) &&
        (!citation.elementStableId ||
          options.elementIds.has(citation.elementStableId)) &&
        (!citation.bombSiteStableId ||
          options.bombSiteIds.has(citation.bombSiteStableId)),
    ),
  };
}

export async function importMapKnowledge(slug: string, input: unknown) {
  const imported = mapExportDocumentSchema.parse(input);
  const map = await db.siegeMap.findUnique({ where: { slug } });
  if (!map) {
    throw new AppError("That map does not exist.", 404, "MAP_NOT_FOUND");
  }
  if (imported.map.stableId !== map.stableId) {
    throw new AppError(
      "This map file belongs to a different map.",
      409,
      "MAP_IMPORT_MISMATCH",
    );
  }
  let version = await db.mapVersion.findUnique({
    where: { stableId: imported.map.versionStableId },
  });
  if (version && version.mapId !== map.id) {
    throw new AppError(
      "That version ID belongs to a different map.",
      409,
      "MAP_IMPORT_VERSION_MISMATCH",
    );
  }
  let createdVersionId: string | null = null;
  if (!version) {
    const versionKey = deriveImportedVersionKey(
      map.stableId,
      imported.map.versionStableId,
    );
    const existingKey = await db.mapVersion.findUnique({
      where: { mapId_versionKey: { mapId: map.id, versionKey } },
    });
    if (existingKey) {
      throw new AppError(
        "A saved version already uses this import key.",
        409,
        "MAP_IMPORT_VERSION_KEY_EXISTS",
      );
    }
    version = await db.mapVersion.create({
      data: {
        stableId: imported.map.versionStableId,
        mapId: map.id,
        parentVersionId:
          (
            await db.mapVersion.findFirst({
              where: { mapId: map.id, knowledgeStatus: "CURRENT" },
              orderBy: { effectiveDate: "desc" },
            })
          )?.id ?? null,
        versionKey,
        versionName: imported.map.versionName,
        effectiveDate: new Date(),
        knowledgeStatus: "UNVERIFIED",
        sourceType: "IMPORTED",
        sourceUrl: imported.map.source.url,
        sourceTitle: imported.map.source.title,
        confidence: imported.map.knowledgeConfidence,
        notes: "Restored from a validated R6 Creator AI map export.",
        lastVerifiedAt: new Date(imported.map.source.lastVerifiedAt),
      },
    });
    createdVersionId = version.id;
  }
  try {
    return await saveMapEditorDocument(
      version.id,
      imported.document,
      "IMPORTED",
    );
  } catch (error) {
    if (createdVersionId) {
      await db.mapVersion
        .delete({ where: { id: createdVersionId } })
        .catch(() => undefined);
    }
    throw error;
  }
}

export function deriveImportedVersionKey(
  mapStableId: string,
  versionStableId: string,
) {
  const prefix = `${mapStableId}:`;
  if (!versionStableId.startsWith(prefix)) {
    throw new AppError(
      "The imported version ID does not belong to this map.",
      409,
      "MAP_IMPORT_VERSION_ID_INVALID",
    );
  }
  return z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .parse(versionStableId.slice(prefix.length));
}

export async function searchMapKnowledge(queryText: string) {
  await ensureOfficialMapKnowledge();
  const search = normalized(z.string().trim().min(1).max(200).parse(queryText));
  const maps = await db.siegeMap.findMany({
    include: {
      aliases: true,
      versions: {
        include: {
          floors: true,
          elements: { include: { aliases: true } },
          bombSites: true,
          connections: true,
          citations: true,
        },
      },
    },
  });
  const results: Array<Record<string, unknown>> = [];
  for (const map of maps) {
    for (const version of map.versions) {
      const floorById = new Map(
        version.floors.map((floor) => [floor.id, floor.displayName]),
      );
      const elementById = new Map(
        version.elements.map((element) => [element.id, element]),
      );
      const candidates = [
        {
          kind: "MAP",
          name: map.name,
          floor: null,
          text: [
            map.name,
            map.location,
            map.officialDescription,
            ...map.aliases.map((alias) => alias.displayName),
          ].join(" "),
          source: map.officialSourceUrl,
          confidence: 1,
        },
        ...version.floors.map((floor) => ({
          kind: "FLOOR",
          name: floor.displayName,
          floor: floor.displayName,
          text: `${map.name} ${floor.displayName} ${floor.notes ?? ""}`,
          source: version.sourceUrl,
          confidence: floor.confidence,
        })),
        ...version.elements.map((element) => ({
          kind: element.elementType,
          name: element.displayName,
          floor: (element.floorId && floorById.get(element.floorId)) ?? null,
          text: [
            map.name,
            (element.floorId && floorById.get(element.floorId)) ?? "",
            element.elementType.replaceAll("_", " "),
            element.displayName,
            element.canonicalCallout,
            element.notes,
            element.commonAttackerApproach,
            element.commonDefenderHold,
            element.commonFlankRisk,
            ...element.aliases.map((alias) => alias.displayName),
          ].join(" "),
          source: version.sourceUrl,
          confidence: element.confidence,
        })),
        ...version.bombSites.map((site) => ({
          kind: "BOMB_SITE",
          name: site.displayName,
          floor: (site.floorId && floorById.get(site.floorId)) ?? null,
          text: `${map.name} ${(site.floorId && floorById.get(site.floorId)) ?? ""} bomb site objective rooms ${site.displayName} ${site.siteAName} ${site.siteBName} ${site.tacticalNotes ?? ""}`,
          source: version.sourceUrl,
          confidence: site.confidence,
        })),
        ...version.connections.flatMap((connection) => {
          const from = elementById.get(connection.fromElementId);
          const to = elementById.get(connection.toElementId);
          if (!from || !to) return [];
          const isVertical =
            connection.floorChange ||
            ["STAIRCASE", "LADDER", "HATCH", "VERTICAL_DESTRUCTION"].includes(
              connection.connectionType,
            );
          const fromFloor =
            (from.floorId && floorById.get(from.floorId)) ?? null;
          const toFloor = (to.floorId && floorById.get(to.floorId)) ?? null;
          return [
            {
              kind: "CONNECTION",
              name: `${from.displayName} to ${to.displayName}`,
              floor: fromFloor ?? toFloor,
              text: [
                map.name,
                "possible routes connected rooms",
                from.displayName,
                to.displayName,
                fromFloor,
                toFloor,
                connection.connectionType.replaceAll("_", " "),
                isVertical ? "vertical above below" : "",
                connection.requiredAction,
                connection.notes,
              ].join(" "),
              source: version.sourceUrl,
              confidence: connection.confidence,
            },
          ];
        }),
      ];
      for (const candidate of candidates) {
        if (mapSearchTextMatches(candidate.text, search)) {
          results.push({
            map: map.name,
            mapSlug: map.slug,
            mapVersion: version.versionName,
            lastVerifiedAt: version.lastVerifiedAt.toISOString(),
            ...candidate,
          });
        }
      }
    }
  }
  return results.slice(0, 100);
}

export async function queryMapGraph(elementId: string) {
  const element = await db.mapElement.findUnique({
    where: { id: elementId },
    include: { floor: true, mapVersion: { include: { map: true } } },
  });
  if (!element) {
    throw new AppError(
      "That map element does not exist.",
      404,
      "MAP_ELEMENT_NOT_FOUND",
    );
  }
  const connections = await db.mapConnection.findMany({
    where: {
      mapVersionId: element.mapVersionId,
      OR: [{ fromElementId: element.id }, { toElementId: element.id }],
    },
    include: {
      fromElement: { include: { floor: true } },
      toElement: { include: { floor: true } },
    },
  });
  return {
    map: element.mapVersion.map.name,
    version: element.mapVersion.versionName,
    element: element.displayName,
    floor: element.floor?.displayName ?? null,
    connections: connections.map((connection) => {
      const neighbor =
        connection.fromElementId === element.id
          ? connection.toElement
          : connection.fromElement;
      return {
        elementId: neighbor.id,
        name: neighbor.displayName,
        type: neighbor.elementType,
        floor: neighbor.floor?.displayName ?? null,
        connectionType: connection.connectionType,
        direction:
          connection.isBidirectional || connection.fromElementId === element.id
            ? "REACHABLE_FROM_SELECTED"
            : "LEADS_TO_SELECTED_ONLY",
        traversable: connection.traversable,
        destructible: connection.destructible,
        floorChange: connection.floorChange,
        requiredAction: connection.requiredAction,
        notes: connection.notes,
        confidence: connection.confidence,
      };
    }),
  };
}

export async function findMapRoutes(
  versionId: string,
  fromElementId: string,
  toElementId: string,
  maxDepth = 8,
) {
  const [elements, connections] = await Promise.all([
    db.mapElement.findMany({ where: { mapVersionId: versionId } }),
    db.mapConnection.findMany({
      where: { mapVersionId: versionId, traversable: true },
    }),
  ]);
  return findPossibleGraphRoutes(
    elements,
    connections,
    fromElementId,
    toElementId,
    maxDepth,
  );
}

export async function getProjectMapContextState(projectId: string) {
  await ensureOfficialMapKnowledge();
  const [project, maps, context] = await Promise.all([
    db.project.findUnique({ where: { id: projectId }, select: { id: true } }),
    db.siegeMap.findMany({
      orderBy: { name: "asc" },
      include: {
        versions: {
          orderBy: { effectiveDate: "desc" },
          include: {
            floors: true,
            elements: {
              where: { elementType: { in: ["ROOM", "OBJECTIVE_ROOM"] } },
              orderBy: { displayName: "asc" },
            },
            bombSites: { orderBy: { displayName: "asc" } },
          },
        },
      },
    }),
    db.projectMapContext.findUnique({ where: { projectId } }),
  ]);
  if (!project)
    throw new AppError(
      "That project does not exist.",
      404,
      "PROJECT_NOT_FOUND",
    );
  return {
    context: context
      ? {
          mapId: context.mapId,
          mapVersionId: context.mapVersionId,
          bombSiteId: context.bombSiteId,
          side: context.side,
          startingRoomId: context.startingRoomId,
          importantRoomIds: parseJson<string[]>(
            context.importantRoomIdsJson,
            [],
          ),
          operator: context.operator ?? "",
          roundResult: context.roundResult ?? "",
          userConfirmed: context.userConfirmed,
          notes: context.notes ?? "",
        }
      : null,
    maps: maps.map((map) => ({
      id: map.id,
      name: map.name,
      versions: map.versions.map((version) => ({
        id: version.id,
        name: version.versionName,
        status: version.knowledgeStatus,
        rooms: version.elements.map((element) => ({
          id: element.id,
          name: element.displayName,
          floorId: element.floorId,
        })),
        floors: version.floors.map((floor) => ({
          id: floor.id,
          name: floor.displayName,
        })),
        bombSites: version.bombSites.map((site) => ({
          id: site.id,
          name: site.displayName,
        })),
      })),
    })),
  };
}

export type ProjectMapContextState = Awaited<
  ReturnType<typeof getProjectMapContextState>
>;

export async function saveProjectMapContext(projectId: string, input: unknown) {
  const fields = projectMapContextInputSchema.parse(input);
  if (!fields.userConfirmed) {
    throw new AppError(
      "Confirm the map context before it can be used in writing.",
      400,
      "MAP_CONTEXT_CONFIRMATION_REQUIRED",
    );
  }
  await validateProjectContextReferences(fields);
  await db.projectMapContext.upsert({
    where: { projectId },
    create: {
      projectId,
      mapId: fields.mapId,
      mapVersionId: fields.mapVersionId,
      bombSiteId: fields.bombSiteId,
      side: fields.side,
      startingRoomId: fields.startingRoomId,
      importantRoomIdsJson: JSON.stringify(fields.importantRoomIds),
      operator: fields.operator || null,
      roundResult: fields.roundResult || null,
      userConfirmed: true,
      confidence: 1,
      sourceType: "MANUAL",
      notes: fields.notes || null,
    },
    update: {
      mapId: fields.mapId,
      mapVersionId: fields.mapVersionId,
      bombSiteId: fields.bombSiteId,
      side: fields.side,
      startingRoomId: fields.startingRoomId,
      importantRoomIdsJson: JSON.stringify(fields.importantRoomIds),
      operator: fields.operator || null,
      roundResult: fields.roundResult || null,
      userConfirmed: true,
      confidence: 1,
      sourceType: "MANUAL",
      notes: fields.notes || null,
    },
  });
  return getProjectMapContextState(projectId);
}

async function validateProjectContextReferences(
  fields: ProjectMapContextInput,
) {
  if (!fields.mapId || !fields.mapVersionId) {
    throw new AppError(
      "Choose a map and map version.",
      400,
      "MAP_CONTEXT_REQUIRED",
    );
  }
  const version = await db.mapVersion.findUnique({
    where: { id: fields.mapVersionId },
    include: { elements: true, bombSites: true },
  });
  if (!version || version.mapId !== fields.mapId) {
    throw new AppError(
      "The selected map version does not belong to that map.",
      400,
      "MAP_CONTEXT_VERSION_MISMATCH",
    );
  }
  const elementIds = new Set(version.elements.map((element) => element.id));
  if (
    (fields.startingRoomId && !elementIds.has(fields.startingRoomId)) ||
    fields.importantRoomIds.some((id) => !elementIds.has(id))
  ) {
    throw new AppError(
      "One or more selected rooms do not belong to this map version.",
      400,
      "MAP_CONTEXT_ROOM_MISMATCH",
    );
  }
  if (
    fields.bombSiteId &&
    !version.bombSites.some((site) => site.id === fields.bombSiteId)
  ) {
    throw new AppError(
      "The selected bomb site does not belong to this map version.",
      400,
      "MAP_CONTEXT_SITE_MISMATCH",
    );
  }
}

export async function getWritingMapContext(
  projectId: string,
): Promise<WritingMapContext | null> {
  const context = await db.projectMapContext.findUnique({
    where: { projectId },
    include: {
      map: true,
      mapVersion: { include: { floors: true, elements: true } },
      bombSite: true,
      startingRoom: true,
    },
  });
  if (!context?.userConfirmed || !context.map || !context.mapVersion)
    return null;
  const importantIds = new Set(
    parseJson<string[]>(context.importantRoomIdsJson, []),
  );
  const important = context.mapVersion.elements.filter((element) =>
    importantIds.has(element.id),
  );
  const floor = context.startingRoom?.floorId
    ? context.mapVersion.floors.find(
        (item) => item.id === context.startingRoom?.floorId,
      )
    : null;
  return {
    map: context.map.name,
    version: context.mapVersion.versionName,
    floor: floor?.displayName ?? null,
    objective: context.bombSite?.displayName ?? null,
    startingRoom: context.startingRoom?.displayName ?? null,
    importantRooms: important.map((element) => element.displayName),
    side: context.side,
    operator: context.operator,
    roundResult: context.roundResult,
    confidence: "USER_CONFIRMED",
    source: "LOCAL_MAP_KNOWLEDGE",
  };
}

export async function createMapUpdateCheck() {
  const gameDataVersion = await ensureOfficialMapKnowledge();
  return db.mapUpdateCheck.create({
    data: {
      gameDataVersionId: gameDataVersion.id,
      status: "READY_FOR_MANUAL_REVIEW",
      sourceUrlsJson: JSON.stringify([
        OFFICIAL_MAP_INDEX_URL,
        CURRENT_GAME_DATA_VERSION.sourceUrl,
      ]),
      notes:
        "Prepared for manual official-source review. No records were fetched or overwritten.",
    },
  });
}

export function parseMapExport(input: unknown) {
  return mapExportDocumentSchema.parse(input);
}
