# ADR-007: Versioned, provenance-labeled operator knowledge

- Status: Accepted
- Date: 2026-07-22

## Context

Rainbow Six Siege operator abilities, loadouts, specialties, and balance state
change between seasons. Community tactical roles and counter advice are useful,
but they are not official Ubisoft facts and often depend on timing, position,
map layout, and the active operator version. A documented operator fact also
does not establish that the operator appeared in an uploaded recording.

## Decision

Store operators, operator versions, ability versions, versioned loadouts,
provenance-labeled roles, conditional interactions, citations, and optional
map-version links in normalized SQLite records. Preserve old versions. Official,
community-derived, user-entered, inferred, and unverified knowledge remain
separate. Imports use stable IDs, reject broken references/private paths, and
never silently replace historical records.

The packaged roster was retrieved on July 22, 2026 from Ubisoft's official
operator directory for Year 11 Season 2, Operation System Override. The catalog
stores all 77 directory entries, but detailed ability/loadout transcription is
limited to the representative records actually checked against official detail
pages. Other records visibly say that detail needs verification.

Only a user-confirmed project operator selection may feed current content
writing. The future-detection contract requires supporting/conflicting evidence,
alternatives, missing evidence, confidence, and version compatibility, but no
Phase 3B.2 code produces a detection result.

## Consequences

- Balance changes can create new versions without destroying old knowledge.
- Tactical interpretation remains inspectable and conditional.
- Search can return “Insufficient verified operator knowledge” instead of
  inventing an answer.
- The application can explain verified operator context supplied by the user;
  it cannot identify operators, weapons, gadgets, or ability use from footage.
- No copyrighted operator artwork, audio, or video is stored in the repository.

## Official sources

- [Ubisoft operator directory](https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/operators)
- [Ubisoft seasons directory](https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/seasons)
- [Operation System Override](https://www.ubisoft.com/en-us/game/rainbow-six/siege/game-info/seasons/systemoverride)
