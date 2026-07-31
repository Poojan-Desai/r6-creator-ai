# Replay Capability Matrix

This matrix records actual output from one user-approved nine-round
`Y11S2_Alpha04` package parsed on July 31, 2026 with
`redraskal.r6-dissect` version
`source-e6c2ca80+compat-1-2026-07-31`.

It is exact-package evidence, not a promise for every replay and not a
candidate-moment accuracy result.

| Capability                       | Real result           | Application treatment                                              |
| -------------------------------- | --------------------- | ------------------------------------------------------------------ |
| Map                              | `LairY10`             | Direct replay header; verified                                     |
| Game mode / match type           | `Bomb` / `Ranked`     | Direct replay header; verified                                     |
| Rounds                           | 9 of 9                | Parsed separately; complete for this package                       |
| Players / teams / operators      | 10 / 2 / 10           | Direct schema-validated records; identities privacy aliased        |
| Kill feedback                    | 62 records            | Direct match-feedback records; verified                            |
| Deaths                           | 62 candidates         | Unverified inference from direct kill targets; no death-state feed |
| Headshots                        | 32 flags              | Direct flag on kill feedback; verified                             |
| DBNO                             | 0 records             | Provider field supported but empty in this replay                  |
| Objective events                 | 0 records             | Provider field supported but empty in this replay                  |
| Defuser events                   | 4 records             | Direct match feedback; verified                                    |
| Score                            | 2 team values         | Partial until cross-round semantics receive further validation     |
| Timer                            | 67 observations       | Partial event-attached round-clock values; no continuous stream    |
| Positions / position timestamps  | Not exposed           | Unsupported; movement is never invented                            |
| Orientation / yaw / pitch/stance | Not exposed           | Unsupported                                                        |
| Health / weapons / ammunition    | Not exposed           | Unsupported                                                        |
| Shots / damage                   | Not exposed           | Unsupported                                                        |
| Gadgets / destruction / drones   | Not exposed           | Unsupported                                                        |
| Camera target / virtual POV      | Not exposed           | Unsupported                                                        |
| Original gameplay pixels         | Not present in `.rec` | Optional MP4 required                                              |
| Original game/microphone audio   | Not present in `.rec` | Optional MP4 required                                              |

## State vocabulary

The application displays `AVAILABLE VERIFIED`, `AVAILABLE UNVERIFIED`,
`PARTIALLY AVAILABLE`, `EMPTY IN REPLAY`, and `UNSUPPORTED PROVIDER`
separately. A provider-supported field with no records is not described as
unsupported, and an unsupported field never receives an invented estimate.

## Audit-only comparison

The WNC provider at commit
`dd535f6499069c8268841fda76c68a04b19ba104` read current rounds during the root
cause investigation and exposed additional experimental fields. It remains
audit-only because the checkout has no top-level license. None of those fields
is integrated or represented as available in the application.
