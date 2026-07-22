import { z } from "zod";

export const MAP_EDITOR_SCHEMA_VERSION = "r6-map-knowledge-editor/v1";
export const MAP_EXPORT_SCHEMA_VERSION = "r6-map-knowledge/v1";
export const MAP_COORDINATE_SYSTEM = "normalized-top-left-0-to-1";

export const MAP_ELEMENT_TYPES = [
  "ROOM",
  "HALLWAY",
  "STAIR",
  "LADDER",
  "HATCH",
  "DOOR",
  "WINDOW",
  "EXTERIOR_ENTRY",
  "EXTERIOR_AREA",
  "SPAWN_LOCATION",
  "OBJECTIVE_ROOM",
  "OBJECTIVE_LOCATION",
  "CAMERA",
  "DRONE_ROUTE",
  "SOFT_WALL",
  "REINFORCEABLE_WALL",
  "INDESTRUCTIBLE_WALL",
  "SOFT_FLOOR",
  "SOFT_CEILING",
  "VERTICAL_SIGHTLINE",
  "COMMON_ROTATION",
  "COMMON_CALLOUT",
  "COMMON_PLAYER_ROUTE",
  "DEFAULT_PLANT_LOCATION",
  "DEFAULT_DEFENSIVE_POSITION",
  "COMMON_ATTACKER_ENTRY_ROUTE",
  "COMMON_FLANK_ROUTE",
  "COMMON_UTILITY_POSITION",
  "OPEN_PASSAGE",
] as const;

export const MAP_CONNECTION_TYPES = [
  "DOOR",
  "WINDOW",
  "BREACHABLE_WALL",
  "OPEN_PASSAGE",
  "STAIRCASE",
  "LADDER",
  "HATCH",
  "EXTERIOR_ENTRY",
  "VERTICAL_DESTRUCTION",
] as const;

export const MAP_CALLOUT_KINDS = [
  "OFFICIAL",
  "COMMUNITY",
  "PERSONAL",
  "IMPORTED",
  "UNVERIFIED",
] as const;

export const MAP_GEOMETRY_TYPES = [
  "NONE",
  "POINT",
  "LINE",
  "POLYGON",
  "PATH",
] as const;

export const BOMB_SITE_ELEMENT_ROLES = [
  "OBJECTIVE_ROOM",
  "ADJACENT_ROOM",
  "DEFAULT_PLANT",
  "COMMON_BREACH_WALL",
  "COMMON_HATCH",
  "ATTACKER_ENTRY",
  "DEFENDER_POSITION",
  "RETAKE_ROUTE",
  "VERTICAL_CONTROL_ROOM",
] as const;

const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/,
    "Stable IDs may use letters, numbers, periods, underscores, colons, and dashes.",
  );
const requiredText = (label: string, maximum = 160) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(maximum, `${label} must be ${maximum} characters or fewer.`);
const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).optional().default("");
const confidenceSchema = z.number().finite().min(0).max(1);

export const normalizedPointSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

export const mapFloorInputSchema = z.object({
  stableId: stableIdSchema,
  displayName: requiredText("Floor name", 100),
  shortName: optionalText(30),
  sortOrder: z.number().int().min(-100).max(100),
  elevation: z.number().int().min(-20).max(20).default(0),
  confidence: confidenceSchema.default(1),
  notes: optionalText(2_000),
});

export const mapElementAliasInputSchema = z.object({
  displayName: requiredText("Alternate callout", 120),
  calloutKind: z.enum(MAP_CALLOUT_KINDS),
  confidence: confidenceSchema.default(1),
  notes: optionalText(500),
});

export const mapElementInputSchema = z
  .object({
    stableId: stableIdSchema,
    floorStableId: stableIdSchema.nullable(),
    elementType: z.enum(MAP_ELEMENT_TYPES),
    displayName: requiredText("Element name", 160),
    canonicalCallout: optionalText(120),
    calloutKind: z.enum(MAP_CALLOUT_KINDS).default("UNVERIFIED"),
    geometryType: z.enum(MAP_GEOMETRY_TYPES).default("NONE"),
    geometry: z.array(normalizedPointSchema).max(256).default([]),
    confidence: confidenceSchema.default(1),
    notes: optionalText(4_000),
    commonAttackerApproach: optionalText(1_000),
    commonDefenderHold: optionalText(1_000),
    commonFlankRisk: optionalText(1_000),
    captionName: optionalText(80),
    voiceoverName: optionalText(120),
    aliases: z.array(mapElementAliasInputSchema).max(30).default([]),
  })
  .superRefine((value, context) => {
    const points = value.geometry.length;
    const required =
      value.geometryType === "POINT"
        ? 1
        : value.geometryType === "LINE"
          ? 2
          : value.geometryType === "POLYGON"
            ? 3
            : value.geometryType === "PATH"
              ? 2
              : 0;
    if (points < required || (value.geometryType === "NONE" && points > 0)) {
      context.addIssue({
        code: "custom",
        path: ["geometry"],
        message: `${value.geometryType} geometry has an invalid number of points.`,
      });
    }
  });

export const mapConnectionInputSchema = z.object({
  stableId: stableIdSchema,
  fromElementStableId: stableIdSchema,
  toElementStableId: stableIdSchema,
  connectionType: z.enum(MAP_CONNECTION_TYPES),
  isBidirectional: z.boolean().default(true),
  traversable: z.boolean().default(true),
  destructible: z.boolean().default(false),
  floorChange: z.boolean().default(false),
  requiredAction: optionalText(300),
  notes: optionalText(1_000),
  confidence: confidenceSchema.default(1),
});

export const mapBombSiteInputSchema = z.object({
  stableId: stableIdSchema,
  floorStableId: stableIdSchema.nullable(),
  displayName: requiredText("Bomb-site pair name", 160),
  siteAName: requiredText("Site A", 100),
  siteBName: requiredText("Site B", 100),
  tacticalNotes: optionalText(4_000),
  confidence: confidenceSchema.default(1),
  elementLinks: z
    .array(
      z.object({
        elementStableId: stableIdSchema,
        role: z.enum(BOMB_SITE_ELEMENT_ROLES),
        notes: optionalText(500),
      }),
    )
    .max(100)
    .default([]),
});

export const mapCitationInputSchema = z.object({
  stableId: stableIdSchema,
  floorStableId: stableIdSchema.nullable().default(null),
  elementStableId: stableIdSchema.nullable().default(null),
  bombSiteStableId: stableIdSchema.nullable().default(null),
  title: requiredText("Source title", 240),
  url: z.string().trim().url().max(2_000),
  notes: optionalText(2_000),
  lastVerifiedAt: z.string().datetime().nullable().default(null),
});

export const mapEditorDocumentSchema = z
  .object({
    schemaVersion: z.literal(MAP_EDITOR_SCHEMA_VERSION),
    versionStableId: stableIdSchema,
    preferredCalloutKind: z.enum(MAP_CALLOUT_KINDS).default("OFFICIAL"),
    preferredCalloutNotes: optionalText(1_000),
    floors: z.array(mapFloorInputSchema).max(30),
    elements: z.array(mapElementInputSchema).max(2_000),
    connections: z.array(mapConnectionInputSchema).max(4_000),
    bombSites: z.array(mapBombSiteInputSchema).max(100),
    citations: z.array(mapCitationInputSchema).max(500),
    saveReason: optionalText(300),
  })
  .superRefine((document, context) => {
    const globalStableIds = new Set<string>();
    const unique = <T extends { stableId: string }>(
      values: T[],
      path: string,
    ) => {
      const seen = new Set<string>();
      for (const value of values) {
        if (seen.has(value.stableId) || globalStableIds.has(value.stableId)) {
          context.addIssue({
            code: "custom",
            path: [path],
            message: `Duplicate stable ID: ${value.stableId}`,
          });
        }
        seen.add(value.stableId);
        globalStableIds.add(value.stableId);
      }
      return seen;
    };
    const floors = unique(document.floors, "floors");
    const elements = unique(document.elements, "elements");
    unique(document.connections, "connections");
    unique(document.bombSites, "bombSites");
    unique(document.citations, "citations");
    for (const element of document.elements) {
      if (element.floorStableId && !floors.has(element.floorStableId)) {
        context.addIssue({
          code: "custom",
          path: ["elements"],
          message: `${element.stableId} references a missing floor.`,
        });
      }
      const aliases = new Set<string>();
      for (const alias of element.aliases) {
        const normalized = alias.displayName.toLocaleLowerCase().trim();
        if (aliases.has(normalized)) {
          context.addIssue({
            code: "custom",
            path: ["elements"],
            message: `${element.stableId} contains a duplicate alternate callout.`,
          });
        }
        aliases.add(normalized);
      }
    }
    for (const connection of document.connections) {
      if (
        !elements.has(connection.fromElementStableId) ||
        !elements.has(connection.toElementStableId) ||
        connection.fromElementStableId === connection.toElementStableId
      ) {
        context.addIssue({
          code: "custom",
          path: ["connections"],
          message: `${connection.stableId} has a broken or self-referencing connection.`,
        });
      }
    }
    for (const bombSite of document.bombSites) {
      if (bombSite.floorStableId && !floors.has(bombSite.floorStableId)) {
        context.addIssue({
          code: "custom",
          path: ["bombSites"],
          message: `${bombSite.stableId} references a missing floor.`,
        });
      }
      for (const link of bombSite.elementLinks) {
        if (!elements.has(link.elementStableId)) {
          context.addIssue({
            code: "custom",
            path: ["bombSites"],
            message: `${bombSite.stableId} references a missing element.`,
          });
        }
      }
    }
    const bombSites = new Set(
      document.bombSites.map((bombSite) => bombSite.stableId),
    );
    for (const citation of document.citations) {
      if (citation.floorStableId && !floors.has(citation.floorStableId)) {
        context.addIssue({
          code: "custom",
          path: ["citations"],
          message: `${citation.stableId} references a missing floor.`,
        });
      }
      if (citation.elementStableId && !elements.has(citation.elementStableId)) {
        context.addIssue({
          code: "custom",
          path: ["citations"],
          message: `${citation.stableId} references a missing element.`,
        });
      }
      if (
        citation.bombSiteStableId &&
        !bombSites.has(citation.bombSiteStableId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["citations"],
          message: `${citation.stableId} references a missing bomb site.`,
        });
      }
    }
  });

export type MapEditorDocument = z.infer<typeof mapEditorDocumentSchema>;

export const mapExportDocumentSchema = z.object({
  schemaVersion: z.literal(MAP_EXPORT_SCHEMA_VERSION),
  exportScope: z.enum([
    "COMPLETE_MAP",
    "FLOOR",
    "ROOMS",
    "BOMB_SITES",
    "CALLOUTS",
    "TACTICAL_ANNOTATIONS",
    "CONNECTIVITY_GRAPH",
  ]),
  coordinateSystem: z.literal(MAP_COORDINATE_SYSTEM),
  map: z.object({
    stableId: stableIdSchema,
    name: requiredText("Map name", 160),
    versionStableId: stableIdSchema,
    versionName: requiredText("Map version", 160),
    knowledgeConfidence: confidenceSchema,
    source: z.object({
      title: requiredText("Source title", 240),
      url: z.string().url().max(2_000),
      sourceType: z.enum(["OFFICIAL", "MANUAL", "IMPORTED", "INFERRED"]),
      lastVerifiedAt: z.string().datetime(),
    }),
  }),
  creationMetadata: z.object({
    application: z.literal("R6 Creator AI"),
    applicationVersion: z.string().max(80),
    createdAt: z.string().datetime(),
  }),
  document: mapEditorDocumentSchema,
});

export type MapExportDocument = z.infer<typeof mapExportDocumentSchema>;

export const projectMapContextInputSchema = z.object({
  mapId: z.string().cuid().nullable(),
  mapVersionId: z.string().cuid().nullable(),
  bombSiteId: z.string().cuid().nullable(),
  side: z.enum(["UNKNOWN", "ATTACK", "DEFENSE"]),
  startingRoomId: z.string().cuid().nullable(),
  importantRoomIds: z.array(z.string().cuid()).max(30),
  operator: optionalText(80),
  roundResult: optionalText(120),
  userConfirmed: z.boolean(),
  notes: optionalText(2_000),
});

export type ProjectMapContextInput = z.infer<
  typeof projectMapContextInputSchema
>;

export type WritingMapContext = {
  map: string;
  version: string;
  floor: string | null;
  objective: string | null;
  startingRoom: string | null;
  importantRooms: string[];
  side: "UNKNOWN" | "ATTACK" | "DEFENSE";
  operator: string | null;
  roundResult: string | null;
  confidence: "USER_CONFIRMED";
  source: "LOCAL_MAP_KNOWLEDGE";
};

export type FutureMapLocationInput = {
  userSelectedMapId?: string;
  hudMapName?: string;
  loadingScreenText?: string;
  ocrEvidence?: string[];
  landmarkIds?: string[];
  compassDirection?: number;
  floorIndicator?: string;
  telemetry?: Record<string, unknown>;
};

export type FutureMapLocationResult = {
  label:
    | "USER_SELECTED_MAP"
    | "POSSIBLE_MAP"
    | "POSSIBLE_FLOOR"
    | "POSSIBLE_ROOM"
    | "LOCATION_UNCERTAIN";
  possibleMap: string | null;
  possibleFloor: string | null;
  possibleRoom: string | null;
  confidence: number;
  supportingLandmarks: string[];
  conflictingLandmarks: string[];
  alternativeRooms: string[];
  mapVersionCompatibility: string[];
};

export interface FutureMapLocationDetector {
  readonly stableId: string;
  readonly version: string;
  analyze(input: FutureMapLocationInput): Promise<FutureMapLocationResult>;
}
