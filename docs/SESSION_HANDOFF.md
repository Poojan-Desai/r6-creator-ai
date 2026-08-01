# Session Handoff

## Resume point

Branch `codex/phase-3` preserves the replay R2 foundation at tag
`replay-r2-foundation-stable` (`0730820`) and the verified real-parser
correction at tag `real-replay-foundation-stable` (commit `93d1b62`). The
authoritative active sequence is U1–U8 for one unified Creator Studio and
Coaching Lab. U1 through U7 are verified. U8 retained real-media and release
verification is the active stage.

A consistent pre-U1 migration backup exists at
`data/backups/r6-creator.pre-unified-u1-20260731.db`. It passed SQLite integrity
and foreign-key checks. It is private runtime data and must not be committed.
The private pre-U2 backup is
`data/backups/r6-creator.pre-u2-20260731.db`; it also passed integrity and
foreign-key checks.

## Completed in this correction

- Located the genuine imported nine-round package using only the application
  database and managed replay storage; no original file was touched.
- Reproduced the old pinned provider failure with a disposable copy and captured
  the previously discarded sanitized stderr.
- Proved exit code 2 came from a Go panic on unknown operator ID
  `444310693746`, not bad arguments, path spacing, folder/file selection,
  permissions, Apple Silicon, or a missing dependency.
- Audited the pinned CLI/source and confirmed both file and folder input
  support.
- Tested the other reviewed provider on current rounds but kept it audit-only
  because its repository has no top-level license.
- Added a minimal versioned MIT compatibility patch to the reproducible local
  build and recorded source, patch, and binary fingerprints.
- Changed the integrated adapter to explicit `--format json <round>`, parsing
  each round independently.
- Added safe process and per-round diagnostics, failure classification, partial
  results, provider fallback structure, cancellation cleanup, and restart
  recovery that preserves an existing valid canonical match.
- Applied additive migration
  `20260731010500_real_replay_provider_diagnostics` after a private backup; all
  legacy rows and foreign keys remained valid.
- Parsed all nine real rounds through the application route with the corrected
  provider.

## Completed in U1

- Updated the authoritative roadmap from replay-first to one recording-first
  Creator Studio and Coaching Lab with optional structured replay evidence.
- Added checked-in additive migration
  `20260731075246_unified_project_foundation`.
- Added `StudioProject` plus typed recording, replay, and reference input links
  without making existing required-video `Project` fields nullable.
- Added strict recording-only, replay-only, combined-mode, reference-type,
  permission, player, audio, map/version/site, and operator/version validation.
- Added guided create/edit/delete APIs and screens plus a unified project
  library and dashboard.
- Made Creator Studio the primary navigation and home workflow while preserving
  all source libraries and legacy workspaces.
- Created a combined project through the browser with a real existing recording
  and parsed replay, reopened the saved settings, restarted the server, and
  confirmed the project persisted with no console warnings or errors.
- Verified recording-only and replay-only persistence through the API and
  removed all temporary U1 verification records afterward. No source record or
  file was deleted.
- Verified SQLite integrity and foreign keys before and after the migration and
  restart. Legacy row counts matched the private pre-U1 backup.
- Passed formatting, ESLint, strict TypeScript, 169 tests across 33 files, the
  production build, and final browser regressions with no console warnings or
  errors.

## Implemented in U2

- Added checked-in additive migration
  `20260731083310_replay_video_synchronization`.
- Added versioned synchronization records, matched anchors, per-round
  adjustments, conservative automatic offset candidates, confidence,
  residuals, and separate observation/replay-fact/inference evidence.
- Added the explicit linear mapping
  `video = offset + replay × slope + round adjustment`.
- One anchor produces only a low-confidence offset. Verification requires at
  least two user-confirmed anchors at distinct replay times and rejects
  excessive drift, large residual error, or out-of-recording mappings.
- Verified versions are read-only. A correction copies the evidence into a new
  editable version without changing either source or the earlier version.
- Automatic discovery uses only compatible completed local detector events and
  genuine replay-relative event/round timestamps. The current real packages
  contain no replay-relative timestamps, so the UI reports discovery
  unavailable rather than manufacturing candidates.
- Added a real recording/replay workspace with source-video seeking, current
  time capture, replay round/event selection, two timelines, manual correction,
  per-round adjustment, evidence inspection, verification notes, and saved
  versions.
- Browser verification created a combined project using the existing
  20-minute recording and nine-round replay, rejected verification with one
  anchor, saved and corrected two anchors, measured drift, saved a round
  adjustment and notes, verified/froze version 1, and created editable
  correction version 2.

## Verified real result

- Provider version `source-e6c2ca80+compat-1-2026-07-31`
- 9 successful rounds, 0 failed
- approximately 1.94 seconds of provider runtime
- `Y11S2_Alpha04` / code `9803520`
- `LairY10`, `Bomb`, `Ranked`
- 10 privacy-safe players
- 67 canonical events
- 62 direct kill feedback records
- 32 direct headshot flags
- 4 defuser feedback records
- `VALIDATED`, `HIGH` canonical result

A real cancellation removed partial rows/output without replacing prior valid
canonical data. A real run interrupted by server restart became an honest
recoverable error and also cleaned its partial output. The final retry cleared
the package error and retained nine successful per-round records.

## Honest limits

This proves the exact current package/provider combination, not universal
current-version compatibility. Deaths remain unverified kill-target inferences.
Round clocks are partial event observations. Positions, orientation, health,
weapons, shots, damage, gadgets, camera target, original pixels/audio, and
virtual POV remain unavailable. No candidate detection, review-time reduction,
views, or virality claim follows from replay parsing.

## Completed in U4

- Added versioned 20/25/30/custom long-form settings and deterministic,
  evidence-bounded plans across one or more linked recordings.
- Added separate immutable long-form timeline revisions, section locks,
  source-boundary editing, reorder/duplicate/delete, cards, captions,
  explanations, speed, freeze, framing, local audio, undo, visible duration
  metrics, and exact fitting of unlocked ranges.
- Added bounded local preview and final render jobs with cancellation, child
  process termination, restart reconciliation, cleanup, byte-range playback,
  safe downloads, history, deletion, and Apple Silicon VideoToolbox with a
  deterministic software fallback.
- Real browser verification produced a 1,200.022-second 640×360 preview and a
  1,200.019-second 1920×1080 H.264/AAC final file of 1,189,420,042 bytes.
  Playback, seeking, download, HTTP 206, source preservation, and clean console
  diagnostics passed.
- A three-recording 20:00 plan crossed local source boundaries and retained
  separate chronological and reordered planner revisions. A server restart
  during segment 7 of 17 turned the active job into an honest interrupted
  error, removed all partial segments, and preserved the plan/timeline.
- The restart exercise exposed a later-recording zero-source-offset bug. The
  fix uses an explicit item-local segment offset, is covered by a deterministic
  regression, and is versioned as `u4-segmented-ffmpeg-v2`.
- The temporary multi-recording verification wrapper and one cancelled render
  history row were removed. No source video, replay, reference, completed
  output, or historical workflow was removed.
- Formatting, ESLint, strict TypeScript, 226 tests across 52 files, the
  production build, 23 migrations, SQLite integrity, and foreign-key checks
  passed.

## Completed in U5

- Added evidence-bounded script and Facts Review revisions, local browser
  recording/streamed narration import, named section takes, active selection,
  byte-range playback, and app-owned deletion.
- Added non-destructive trim, normalization, conservative denoise, gain,
  versioned processed outputs, editable local captions, section replacement,
  timeline alignment, and automatic gameplay-audio ducking.
- A real owned narration source and 20-minute gameplay project produced a
  persisted captioned mixed preview. Cancellation, interrupted-job recovery,
  cleanup, playback, and a clean browser console were verified.

## Completed in U6

- Added additive coaching calibration, analysis, finding, evidence, correction,
  measurement, drill, review-clip, report, and export records.
- Added recording-only, replay-only, and combined capability disclosures plus
  conservative local measurement and replay rules. One rule failure is isolated
  and cannot discard other results.
- A real combined project produced 26 bounded findings across five completed
  rules. A cancelled run and a deliberately interrupted run retained zero
  partial findings.
- The browser persisted one accepted finding, one rejected semantic false
  positive, a corrected timestamp, one evidence-first drill, and a playable
  14-second review clip.
- One immutable report reopened after a full server restart with checksummed
  JSON, Markdown, and PDF exports. The report says “AI-assisted replay and POV
  review,” does not replace a professional coach, and does not invent missing
  geometry or intent.
- Formatting, ESLint, strict TypeScript, 259 tests across 61 files, a
  warning-free production build, current migrations, SQLite integrity, clean
  foreign keys, and an empty browser console passed.

## Completed in U7

- Added a seven-class shared evidence contract and project Evidence Inspector
  with source links, timestamps, confidence, corrections, versions, capability
  boundaries, workflow readiness, filtering, and search.
- Added additive local player profiles, immutable progress snapshots, snapshot
  project links, transparent metrics, user notes, and measurable practice goals.
- Progress metrics isolate the selected player and use only validated or
  user-confirmed replay events. Direct kill/headshot/defuser feedback stays
  separate from likely-death inference and unavailable side/geometry/timing.
- Real browser verification saved an all-project snapshot and a filtered
  combined Lair/Ash snapshot, one evidence-based note, and one completed goal.
  The one-match first/latest comparison correctly remained insufficient.
- All records and 88 shared evidence statements survived a full restart. The
  clean browser session had no warnings or errors.
- Formatting, ESLint, strict TypeScript, 266 tests across 64 files, the
  production build, all 29 migrations, SQLite integrity, and foreign keys
  passed.

## Exact next action

Run U8 from the stable U7 checkpoint: extend the benchmark/claim audit, reopen
retained real short/long/replay/voiceover/coaching/progress outputs, verify
playback and persistence through another full restart, audit cleanup and source
preservation, add beginner release walkthroughs, and run the complete release
gate. Do not claim the combined synchronization proof is current unless a
matching recording/replay pair with usable timing is actually available.

U7 is preserved by focused commits `cf2b7ed` and `003aeef`; add the final
documentation checkpoint and `unified-u7-progress-stable` tag after the U7
release-documentation gate passes.
