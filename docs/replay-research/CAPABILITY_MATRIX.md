# Replay Capability Matrix

This matrix records actual output from the same public MIT Y9S1 fixture. It is
not a current-season result and not a real-user replay proof.

| Capability                                | Integrated r6-dissect                     | WNC audit run                                     | Application treatment                                                |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| Match/map/mode/version metadata           | Populated                                 | Populated                                         | Direct, schema-validated field                                       |
| Round/site/team/result metadata           | Partly populated                          | Partly populated                                  | Direct but version-scoped; missing elapsed boundaries remain unknown |
| Players/teams/operators                   | 10 players populated                      | Entities present but some mapping uncertain       | Privacy aliases and profile hashes                                   |
| Recording player                          | Populated                                 | Unknown on this fixture                           | Direct only when populated                                           |
| Kill feedback                             | Populated                                 | Game events present                               | Direct match feedback; does not create an elapsed match timestamp    |
| Headshot flag                             | Populated on relevant feedback            | Event semantics need validation                   | Direct provider field                                                |
| Death                                     | No independent stream                     | Claimed event support                             | Inference from a kill target, visibly marked unverified              |
| Objective/defuser                         | Supported but empty in fixture            | Claimed event support                             | Empty is different from unsupported                                  |
| Scores                                    | Populated but cross-round meaning partial | Populated metadata                                | Partial until a real multi-round package is validated                |
| Timer                                     | Unsupported                               | 175 ticks                                         | Unsupported by active provider                                       |
| Player positions                          | Unsupported                               | Empty mapped player samples                       | Unsupported; never invent movement                                   |
| Position timestamps                       | Unsupported                               | No validated mapped positions                     | Unsupported                                                          |
| View yaw/pitch/stance                     | Unsupported                               | Claimed/experimental, not populated reliably here | Unsupported                                                          |
| Health/weapons/ammo/shots/damage          | Unsupported                               | Claimed; empty or unvalidated here                | Unsupported                                                          |
| Gadgets/reinforcements/drones/destruction | Unsupported                               | Claimed/experimental                              | Unsupported                                                          |
| Camera target/virtual POV                 | Unsupported                               | 34 camera records, meaning not validated          | Unsupported                                                          |
| Original gameplay pixels                  | Not present in `.rec`                     | Not present in `.rec`                             | Add optional MP4                                                     |
| Original game/microphone audio            | Not present in `.rec`                     | Not present in `.rec`                             | Add optional MP4                                                     |

The application displays `AVAILABLE VERIFIED`, `AVAILABLE UNVERIFIED`,
`PARTIALLY AVAILABLE`, `EMPTY IN REPLAY`, and `UNSUPPORTED PROVIDER`
separately for each imported replay.
