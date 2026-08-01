# Session Handoff

## Resume point

Branch `codex/phase-3` preserves the replay R2 foundation at tag
`replay-r2-foundation-stable` (`0730820`) and the verified real-parser
correction at tag `real-replay-foundation-stable` (commit `93d1b62`). The
authoritative active sequence is now U1–U8 for one unified Creator Studio and
Coaching Lab. U1 is verified. U2 replay/video synchronization is the active
stage.

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

## Exact next action

Begin U4 long-form Creator Studio from the verified U3 checkpoint. Reuse the
immutable short-form story, timeline, local audio, proxy, and export
infrastructure where the model fits, but keep long-form plans and renders in
separate versioned records. Support 20-, 25-, 30-minute, and custom targets from
one or more real recordings. Never fill missing source coverage with invented
gameplay, replay pixels, or unsupported match facts.

U3 is verified through a real 1080×1920 H.264/AAC browser export from the
existing 20-minute recording, a generated 1920×1080 export, 207 tests across 45
files, the production build, cancellation, restart recovery, cleanup, and clean
browser diagnostics. Commits `2632cec`, `f79eafa`, `688738c`, `945061b`, and
`7248689` preserve its focused substages.
