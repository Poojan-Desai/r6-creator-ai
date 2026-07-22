# ADR-005 — Versioned Rainbow Six Siege map knowledge

- **Status:** Accepted for Phase 3B.2-M
- **Date:** July 22, 2026
- **Official data version:** `r6-y11s2.2-2026-07-22`

## Context

Later detector explanations and writing may benefit from map facts, but a map
name is not enough to justify a room, route, bomb site, or tactical claim. Map
layouts and playlist rotations also change independently. The application must
preserve old layouts and distinguish official records from community,
personal, imported, inferred, or unverified annotations.

The official Ubisoft map index retrieved July 22, 2026 lists 27 map-guide
pages: Calypso Casino, Chalet, Clubhouse, Border, Bank, Kafe Dostoyevsky,
Stadium Alpha, Stadium Bravo, Lair, Nighthaven Labs, Close Quarter, Emerald
Plains, Coastline, Consulate, Favela, Fortress, Hereford Base, House, Kanal,
Oregon, Outback, Presidential Plane, Skyscraper, Theme Park, Tower, Villa, and
Yacht. Ubisoft's Daybreak page separately identifies District as a Dual
Front-only map, so the seed contains 28 map records while keeping District's
lifecycle separate from normal playlists.

Operation System Override launched June 2, 2026 with Calypso Casino and map
modernizations. Ubisoft's July 16 mid-season post changed the current Ranked
rotation. The newer rotation is recorded as source-backed playlist evidence; it
does not erase a map or rewrite the map-page record.

Primary sources:

- [Official Ubisoft map index](https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/maps)
- [Operation System Override](https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/systemoverride)
- [Operation System Override mid-season update](https://news.ubisoft.com/en-us/article/6Cs9lXypzDo1pQSE43KDH4/rainbow-six-siege-operation-system-override-midseason-update-everything-you-need-to-know)
- [Operation Daybreak](https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons/daybreak)
- [Year 11 seasonal cadence](https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/53u8tljBb6TCQxKnGxR2pp/y11-seasonal-cadence-and-community-priorities-update)

Every seeded map retains its individual official Ubisoft map-page citation,
retrieval date, verification date, release/modernization labels, official
blueprint availability, and current known playlist records.

## Decision

1. Store `GameDataVersion`, `SiegeMap`, immutable-by-default `MapVersion`, and
   source-specific `MapPlaylistStatus` records separately. A rework or major
   user edit creates a child map version instead of overwriting history.
2. Use one normalized, typed `MapElement` model for rooms, hallways, doors,
   windows, hatches, surfaces, objectives, cameras, routes, positions, and
   tactical annotations. These entities share geometry, provenance,
   confidence, notes, and verification fields; separate nearly identical tables
   would increase migration and integrity risk without adding meaning.
3. Store geometry as validated normalized coordinates from zero to one. The
   editor document is the transactional boundary for floors, elements, aliases,
   graph edges, bomb-site relationships, and citations.
4. Preserve source and confidence for every annotation. Official, common
   community, personal, imported, and unverified callouts remain visibly
   distinct. A preferred terminology setting does not change provenance.
5. Import blueprint ZIPs or images only after a visible user file-selection
   action. Stream uploads, cap compressed and expanded sizes, reject absolute
   paths, traversal, links, misleading image types, excessive entries, and
   compression bombs, preserve the original, and generate local previews.
   `yauzl` 3.4.0 provides lazy-entry ZIP streaming with bounded extraction and
   no native runtime dependency; its patched version is pinned after an npm
   advisory was found in the initially evaluated 3.2.0 release.
6. The portable schema is `r6-map-knowledge/v1`. It rejects future versions,
   coordinates outside zero-to-one, duplicate global stable IDs, duplicate
   aliases, and broken floor/element/site references. It exports no local path.
7. Project writing context is exposed only when the user explicitly confirms
   map, version, and any selected details. A future location detector has an
   interface but no implementation in this phase.

## Consequences

- The application can answer inspectable local graph/search questions and use
  confirmed context later without claiming visual location recognition.
- “Map listed,” “blueprint imported,” “rooms partially annotated,” “bomb sites
  entered,” “connectivity entered,” “tactics entered,” “fully verified,” and
  “historical” remain different states.
- Official metadata can be refreshed by a later review workflow, but updates
  never silently overwrite user knowledge or prior layouts.
- The seed does not claim that all 28 maps have room geometry, bomb sites, graph
  edges, or tactical annotations.

## Explicit non-decisions

- No map, floor, or room is inferred from gameplay footage in Phase 3B.2-M.
- No blueprint is automatically downloaded or scraped.
- No graph path is called the “best route” without gameplay context.
- No disputed community callout or tactical idea is presented as an official
  Ubisoft fact.
