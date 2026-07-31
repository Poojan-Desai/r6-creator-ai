# R6 Creator AI — Personal Version 1 Master Roadmap

## Product direction

Match Replay is the primary Version 1 input. A gameplay MP4 remains fully
supported and becomes optional supporting evidence for original pixels, audio,
transcription, manual clips, and video-based analysis. The application remains
local-first, single-user, and inspectable.

The project never fills missing replay data with plausible-looking animation.
Direct observations, experimental fields, derived inferences, user-confirmed
facts, conflicts, and unknowns remain separate.

## Stable base

- Phase 1: streamed MP4 upload, metadata, playback, clipping, and local storage
- Phase 2: local selected-track transcription and provider-neutral writing
- Phase 3A: permitted references and Creator Style Profiles
- Phase 3B.1: benchmark labels and cancellable detector jobs
- Phase 3B.2: general local video, audio, and transcript signals
- Phase 3B.2-M: versioned map knowledge
- Phase 3B.2-O: versioned operator knowledge
- Stable checkpoint tag: `phase-3b2o-stable`

## Replay-first execution sequence

| Phase | Purpose                                                                                                                           | Status                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 0     | Audit repository, preserve a checkpoint, rerun regressions, and make replay navigation primary                                    | Verified in this work session                                                                                        |
| R1    | Audit and build replay parsers; execute them against a real user replay; publish a measured capability matrix                     | Provider audit/build and fixture proof complete; real-user replay proof blocked because no approved replay was found |
| R2    | Secure `.rec`/folder/ZIP import, app-owned canonical evidence, privacy, cancellation, restart recovery, persistence, and deletion | Implemented; final full-gate verification in progress                                                                |
| R3    | Ten-player timeline, stable event reconstruction, validated positions/orientation, and virtual POV only where supported           | Not started; blocked by the R1 real-replay gate and current provider capability                                      |
| R4    | Blueprint calibration, tactical map rendering, visibility/support relationships, and conservative tactical review                 | Not started                                                                                                          |
| R5    | Replay-only candidate moments and multi-perspective content-story construction                                                    | Not started                                                                                                          |
| V1    | Optional video synchronization, HUD fallback, and replay/video parity benchmark                                                   | Not started                                                                                                          |
| C1    | Explicit personal feedback and transparent ranking                                                                                | Not started                                                                                                          |
| W1    | Facts Review, evidence-based local writing, and optional budgeted OpenAI provider                                                 | Not started                                                                                                          |
| A1    | Local voiceover recording, transcription, and subtitle source                                                                     | Not started                                                                                                          |
| E1    | Replay-only tactical rendering and optional original-footage editing                                                              | Not started                                                                                                          |
| P1    | Personal creator dashboard, presets, calendar, storage, and manually entered performance tracking                                 | Not started                                                                                                          |
| Q1    | End-to-end QA, honest benchmarks, portfolio documentation, and Personal Version 1 release                                         | Not started                                                                                                          |

## Current checkpoint boundary

The integrated MIT provider recovers stable header, team, player, operator,
score, and match-feedback fields on its public Y9S1 fixture. It does not expose
validated positions, orientation, stance, health, weapons, ammunition, shots,
damage, gadgets, reinforcements, drones, destruction, or a player-view camera.
Match Replay files also do not contain original gameplay pixels or audio.

The second audited parser compiles and produces richer output on that fixture,
but its checkout has no license file. It remains audit-only and is not copied,
integrated, or distributed.

R3 must not start until an approved real replay is supplied through the
application and R1’s execution/validation gate is met. Unsupported rich fields
remain visibly unavailable instead of blocking the safe R2 import foundation.

## Definition of Personal Version 1

Version 1 requires the complete gates in the authoritative execution prompt:
real replay proof, persistent canonical match/round/player/event data,
capability-honest reconstruction, replay-only candidates and content workflow,
local narration and rendering, safe storage/deletion, cancellation/retry/restart
recovery, passing automated/build/browser verification, clean Git state, and a
verified release tag. An interface or fixture alone is not completion evidence.
