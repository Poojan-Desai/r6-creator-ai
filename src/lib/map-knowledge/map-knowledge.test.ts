import { describe, expect, it } from "vitest";

import { validateZipEntry } from "@/lib/map-knowledge/blueprints";
import {
  createEditorHistory,
  pushEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
} from "@/lib/map-knowledge/editor-history";
import { findPossibleGraphRoutes } from "@/lib/map-knowledge/graph";
import {
  CURRENT_GAME_DATA_VERSION,
  OFFICIAL_MAPS,
} from "@/lib/map-knowledge/official-data";
import {
  MAP_COORDINATE_SYSTEM,
  MAP_EDITOR_SCHEMA_VERSION,
  MAP_EXPORT_SCHEMA_VERSION,
  mapEditorDocumentSchema,
  mapExportDocumentSchema,
  type MapEditorDocument,
} from "@/lib/map-knowledge/types";
import {
  deriveImportedVersionKey,
  mapSearchTextMatches,
} from "@/lib/map-knowledge/service";

function documentFixture(): MapEditorDocument {
  return {
    schemaVersion: MAP_EDITOR_SCHEMA_VERSION,
    versionStableId: "oregon:march-2026",
    preferredCalloutKind: "COMMUNITY",
    preferredCalloutNotes: "Prefer concise local callouts.",
    floors: [
      {
        stableId: "oregon:march-2026:basement",
        displayName: "Basement",
        shortName: "B",
        sortOrder: 0,
        elevation: -1,
        confidence: 1,
        notes: "User-created fixture.",
      },
      {
        stableId: "oregon:march-2026:first-floor",
        displayName: "First Floor",
        shortName: "1F",
        sortOrder: 1,
        elevation: 0,
        confidence: 1,
        notes: "",
      },
    ],
    elements: [
      {
        stableId: "oregon:march-2026:laundry",
        floorStableId: "oregon:march-2026:basement",
        elementType: "OBJECTIVE_ROOM",
        displayName: "Laundry",
        canonicalCallout: "Laundry",
        calloutKind: "COMMUNITY",
        geometryType: "POLYGON",
        geometry: [
          { x: 0.1, y: 0.1 },
          { x: 0.35, y: 0.1 },
          { x: 0.35, y: 0.35 },
        ],
        confidence: 0.9,
        notes: "Fixture room, not a tactical claim.",
        commonAttackerApproach: "",
        commonDefenderHold: "",
        commonFlankRisk: "",
        captionName: "Laundry",
        voiceoverName: "Laundry",
        aliases: [
          {
            displayName: "Laundry Room",
            calloutKind: "COMMUNITY",
            confidence: 0.8,
            notes: "",
          },
        ],
      },
      {
        stableId: "oregon:march-2026:meeting",
        floorStableId: "oregon:march-2026:first-floor",
        elementType: "ROOM",
        displayName: "Meeting",
        canonicalCallout: "Meeting",
        calloutKind: "COMMUNITY",
        geometryType: "POLYGON",
        geometry: [
          { x: 0.1, y: 0.5 },
          { x: 0.3, y: 0.5 },
          { x: 0.3, y: 0.8 },
        ],
        confidence: 0.8,
        notes: "",
        commonAttackerApproach: "",
        commonDefenderHold: "",
        commonFlankRisk: "",
        captionName: "Meeting",
        voiceoverName: "Meeting",
        aliases: [],
      },
      {
        stableId: "oregon:march-2026:laundry-hatch",
        floorStableId: "oregon:march-2026:first-floor",
        elementType: "HATCH",
        displayName: "Laundry Hatch",
        canonicalCallout: "",
        calloutKind: "UNVERIFIED",
        geometryType: "POINT",
        geometry: [{ x: 0.22, y: 0.72 }],
        confidence: 0.6,
        notes: "Fixture vertical connection.",
        commonAttackerApproach: "",
        commonDefenderHold: "",
        commonFlankRisk: "",
        captionName: "",
        voiceoverName: "",
        aliases: [],
      },
    ],
    connections: [
      {
        stableId: "oregon:march-2026:meeting-to-laundry",
        fromElementStableId: "oregon:march-2026:meeting",
        toElementStableId: "oregon:march-2026:laundry",
        connectionType: "VERTICAL_DESTRUCTION",
        isBidirectional: false,
        traversable: false,
        destructible: true,
        floorChange: true,
        requiredAction: "Open a destructible surface.",
        notes: "Fixture connection.",
        confidence: 0.6,
      },
    ],
    bombSites: [
      {
        stableId: "oregon:march-2026:laundry-supply",
        floorStableId: "oregon:march-2026:basement",
        displayName: "Laundry and Supply",
        siteAName: "Laundry",
        siteBName: "Supply",
        tacticalNotes: "Fixture only.",
        confidence: 0.8,
        elementLinks: [
          {
            elementStableId: "oregon:march-2026:laundry",
            role: "OBJECTIVE_ROOM",
            notes: "",
          },
        ],
      },
    ],
    citations: [
      {
        stableId: "oregon:march-2026:fixture-source",
        floorStableId: "oregon:march-2026:basement",
        elementStableId: "oregon:march-2026:laundry",
        bombSiteStableId: "oregon:march-2026:laundry-supply",
        title: "Local permitted fixture",
        url: "https://example.com/permitted-fixture",
        notes: "Automated test source.",
        lastVerifiedAt: "2026-07-22T12:00:00.000Z",
      },
    ],
    saveReason: "Automated test",
  };
}

describe("official R6 map catalog", () => {
  it("contains the current official index plus the separately sourced Dual Front map", () => {
    expect(OFFICIAL_MAPS).toHaveLength(28);
    expect(new Set(OFFICIAL_MAPS.map((map) => map.stableId)).size).toBe(28);
    expect(
      OFFICIAL_MAPS.find((map) => map.name === "Calypso Casino"),
    ).toMatchObject({
      releaseDate: "2026-06-02T00:00:00.000Z",
      blueprintAvailable: true,
    });
    expect(OFFICIAL_MAPS.find((map) => map.name === "District")).toMatchObject({
      lifecycleStatus: "DUAL_FRONT_ONLY",
    });
    for (const name of [
      "Oregon",
      "Clubhouse",
      "Chalet",
      "Border",
      "Lair",
      "Fortress",
      "Villa",
      "Calypso Casino",
    ]) {
      expect(OFFICIAL_MAPS.some((map) => map.name === name)).toBe(true);
    }
    expect(CURRENT_GAME_DATA_VERSION).toMatchObject({
      year: 11,
      seasonNumber: 2,
      seasonName: "Operation System Override",
    });
  });

  it("keeps current playlist status separate from map existence", () => {
    const coastline = OFFICIAL_MAPS.find((map) => map.name === "Coastline");
    expect(coastline).toBeDefined();
    expect(
      coastline?.playlists.find((playlist) => playlist.playlist === "RANKED"),
    ).toMatchObject({ availability: "TEMPORARILY_OUTSIDE" });
    expect(
      coastline?.playlists.some(
        (playlist) => playlist.playlist === "QUICK_MATCH",
      ),
    ).toBe(true);
  });
});

describe("map knowledge contracts", () => {
  it("matches floor-aware, plural, and vertical graph search phrases", () => {
    expect(
      mapSearchTextMatches(
        "Oregon Basement hatch Laundry Hatch",
        "Oregon basement hatches",
      ),
    ).toBe(true);
    expect(
      mapSearchTextMatches(
        "Oregon possible routes connected rooms vertical above below Laundry Meeting",
        "rooms above Laundry",
      ),
    ).toBe(true);
    expect(
      mapSearchTextMatches(
        "Calypso Casino bomb site objective rooms",
        "Calypso Casino bomb sites",
      ),
    ).toBe(true);
    expect(mapSearchTextMatches("Oregon Basement", "Clubhouse CCTV")).toBe(
      false,
    );
  });

  it("derives safe version keys for delete-and-restore imports", () => {
    expect(
      deriveImportedVersionKey("oregon", "oregon:browser-verified-2026"),
    ).toBe("browser-verified-2026");
    expect(() =>
      deriveImportedVersionKey("oregon", "clubhouse:browser-verified-2026"),
    ).toThrow(/does not belong/);
    expect(() =>
      deriveImportedVersionKey("oregon", "oregon:../unsafe"),
    ).toThrow();
  });

  it("accepts floors, normalized room polygons, callouts, sites, and vertical connections", () => {
    expect(mapEditorDocumentSchema.parse(documentFixture())).toEqual(
      documentFixture(),
    );
  });

  it("rejects coordinates outside the normalized range", () => {
    const document = documentFixture();
    document.elements[0]!.geometry[0]!.x = 1.1;
    expect(() => mapEditorDocumentSchema.parse(document)).toThrow();
  });

  it("rejects broken references, duplicate stable IDs, and duplicate callouts", () => {
    const broken = documentFixture();
    broken.connections[0]!.toElementStableId = "missing-room";
    expect(() => mapEditorDocumentSchema.parse(broken)).toThrow(/broken/);

    const duplicate = documentFixture();
    duplicate.elements[0]!.stableId = duplicate.floors[0]!.stableId;
    expect(() => mapEditorDocumentSchema.parse(duplicate)).toThrow(/Duplicate/);

    const callout = documentFixture();
    callout.elements[0]!.aliases.push({
      displayName: "laundry room",
      calloutKind: "PERSONAL",
      confidence: 1,
      notes: "",
    });
    expect(() => mapEditorDocumentSchema.parse(callout)).toThrow(
      /duplicate alternate/,
    );
  });

  it("exports a versioned, path-free document and rejects future schemas", () => {
    const exported = {
      schemaVersion: MAP_EXPORT_SCHEMA_VERSION,
      exportScope: "COMPLETE_MAP",
      coordinateSystem: MAP_COORDINATE_SYSTEM,
      map: {
        stableId: "oregon",
        name: "Oregon",
        versionStableId: "oregon:march-2026",
        versionName: "March 2026 modernization",
        knowledgeConfidence: 0.8,
        source: {
          title: "Official source",
          url: "https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/maps/oregon",
          sourceType: "OFFICIAL",
          lastVerifiedAt: "2026-07-22T12:00:00.000Z",
        },
      },
      creationMetadata: {
        application: "R6 Creator AI",
        applicationVersion: "test",
        createdAt: "2026-07-22T12:00:00.000Z",
      },
      document: documentFixture(),
    } as const;
    expect(() => mapExportDocumentSchema.parse(exported)).not.toThrow();
    expect(JSON.stringify(exported)).not.toContain("/Users/");
    expect(() =>
      mapExportDocumentSchema.parse({
        ...exported,
        schemaVersion: "r6-map-knowledge/v99",
      }),
    ).toThrow();
  });
});

describe("map editing and connectivity", () => {
  it("supports bounded undo and redo and clears redo after a new edit", () => {
    let history = createEditorHistory({ value: 1 });
    history = pushEditorHistory(history, { value: 2 });
    history = pushEditorHistory(history, { value: 3 });
    history = undoEditorHistory(history);
    expect(history.present.value).toBe(2);
    history = redoEditorHistory(history);
    expect(history.present.value).toBe(3);
    history = undoEditorHistory(history);
    history = pushEditorHistory(history, { value: 4 });
    expect(history.future).toHaveLength(0);
  });

  it("returns possible graph paths while respecting direction and traversability", () => {
    const elements = [
      { id: "blue", displayName: "Blue Stairs" },
      { id: "hall", displayName: "Basement Hall" },
      { id: "site", displayName: "Laundry" },
    ];
    const connections = [
      {
        fromElementId: "blue",
        toElementId: "hall",
        isBidirectional: true,
        traversable: true,
      },
      {
        fromElementId: "hall",
        toElementId: "site",
        isBidirectional: false,
        traversable: true,
      },
      {
        fromElementId: "blue",
        toElementId: "site",
        isBidirectional: true,
        traversable: false,
      },
    ];
    expect(
      findPossibleGraphRoutes(elements, connections, "blue", "site"),
    ).toEqual([["Blue Stairs", "Basement Hall", "Laundry"]]);
    expect(
      findPossibleGraphRoutes(elements, connections, "site", "blue"),
    ).toEqual([]);
  });
});

describe("blueprint archive safety", () => {
  it("accepts nested image entries and rejects traversal, absolute paths, links, and zip bombs", () => {
    expect(
      validateZipEntry({
        fileName: "oregon/basement.png",
        compressedSize: 500,
        uncompressedSize: 1_000,
      }),
    ).toBe("oregon/basement.png");
    for (const fileName of ["../private.txt", "/etc/passwd", "C:\\secret.png"])
      expect(() =>
        validateZipEntry({ fileName, compressedSize: 1, uncompressedSize: 1 }),
      ).toThrow(/unsafe/);
    expect(() =>
      validateZipEntry({
        fileName: "link.png",
        compressedSize: 10,
        uncompressedSize: 10,
        externalFileAttributes: 0o120777 << 16,
      }),
    ).toThrow(/unsafe/);
    expect(() =>
      validateZipEntry({
        fileName: "huge.png",
        compressedSize: 1,
        uncompressedSize: 10_000,
      }),
    ).toThrow(/unexpectedly large/);
  });
});
