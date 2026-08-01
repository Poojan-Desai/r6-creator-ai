# R6 Creator AI — Current Status

- **Current branch:** `codex/phase-3`
- **Preserved replay checkpoints:** `replay-r2-foundation-stable` at `0730820`
  and `real-replay-foundation-stable` at parser-correction commit `93d1b62`
- **Current phase:** U6 verified; U7 evidence fusion and progress tracking is
  active
- **Completed phases:** Phase 1, Phase 2, Phase 3A, Phase 3B.1, Phase 3B.2,
  Phase 3B.2-M, Phase 3B.2-O, replay Phase 0, and the real-replay R1 execution
  gate, U1 unified projects, U2 synchronization, U3 short-form Creator Studio,
  U4 long-form Creator Studio, U5 Voiceover Studio, and U6 Coaching Lab
- **Current active task:** Implement U7.1 shared evidence inspection and U7.2
  versioned local player-progress snapshots without turning inference or
  correlation into fact
- **Active parser provider:** `redraskal/r6-dissect` (MIT), built locally from
  reviewed source commit `e6c2ca80f7f895e320ca0f8ded0f30136888ffac`
  plus the reviewed `compat-1` operator-roster patch
- **Provider version:** `source-e6c2ca80+compat-1-2026-07-31`
- **Audit-only provider:** `wnc-replay/replay-tool` commit
  `dd535f6499069c8268841fda76c68a04b19ba104`; it remains unintegrated because
  the repository has no top-level license
- **Migration version:** `20260801185541_coaching_measurements`, applied
  additively after private pre-U1 through pre-U3.4 SQLite backups with matching
  legacy row counts, integrity `ok`, and clean foreign keys
- **Current real-replay compatibility:** One user-approved nine-round
  `Y11S2_Alpha04` package parsed successfully. This is evidence for that exact
  package and provider version, not a promise that every current or future
  replay will parse.
- **Known correction:** Upstream `r6-dissect` panicked with exit code 2 on
  operator ID `444310693746`. Source inspection proved the exit was a Go panic,
  not a CLI-use error. The local setup now applies a minimal versioned MIT
  compatibility patch before building.
- **Current capability result:** Map, game mode, players, teams, operators,
  direct kill feedback, headshot flags, and defuser feedback populated. Deaths
  remain an unverified inference from direct kill targets. Round metadata,
  scores, and timer observations remain partial. DBNO/objective-event fields
  were supported but empty. Positions, orientation, health, weapons, shots,
  damage, gadgets, camera target, original pixels/audio, and virtual POV remain
  unavailable.
- **Parser diagnostics:** Provider/version, safe invocation template, input
  fingerprints, per-round results, exit/signal/timeout/read-start state,
  classified failure, safe error code, and sanitized stderr are persisted and
  inspectable.
- **Cancellation/restart:** Real cancellation removed partial rows/output and
  preserved the prior valid canonical match. A deliberately interrupted real
  run became a recoverable error after restart, leaked no temporary output, and
  also preserved the prior match.
- **Automated validation:** Formatting, ESLint, strict TypeScript, 259 tests
  across 61 files, and the warning-free production build passed on August 1, 2026.
- **Pre-U1 safety:** The Git tree was clean before work. A consistent private
  SQLite backup was created at
  `data/backups/r6-creator.pre-unified-u1-20260731.db`; integrity was `ok` and
  the foreign-key check returned no violations.
- **Authoritative direction:** The gameplay screen recording is the primary
  visual source, Match Replay is optional structured evidence, and a permitted
  reference is optional structural guidance. Replay-only workspaces remain
  supported without pretending that replay data contains gameplay pixels or
  audio.
- **U1 implementation:** `StudioProject` and typed input links preserve the
  required-video legacy model while supporting recording-only, replay-only, and
  combined workspaces. The guided form saves goals, inputs, reference choice,
  focus, instructions, coaching goals, privacy-safe player selection, explicit
  audio selection, and user-confirmed map/operator context.
- **U1 browser proof:** A combined project was created through the real browser
  using an existing 20-minute recording, the verified nine-round replay, and a
  Creator Style Profile. It reopened with all selections and instructions,
  persisted across a complete server restart, and showed a clean browser
  console. Recording-only and replay-only projects also returned their exact
  typed inputs after restart. Temporary U1 verification projects were deleted;
  all five video projects, three replay packages, and four references remain.
- **U1 final gate:** Production routes include `/studio`, `/studio/new`,
  `/studio/[id]`, edit screens, and typed APIs. Home, Creator Studio, the
  20-minute video workspace, replay library, and reference library passed final
  browser checks after the production build. SQLite integrity was `ok`, foreign
  keys were clean, invalid combined input returned a readable 400 error, and
  the development server is running at `http://localhost:3000`.
- **U2 implementation:** Combined projects now have a local synchronization
  workspace with explicit manual anchors, round/event selection, a visible
  linear offset/drift formula, per-round adjustments, conservative automatic
  candidate offsets, separate observation/fact/inference records, confidence,
  notes, and immutable verified versions.
- **U2 honesty boundary:** The current imported replays contain 160 canonical
  events across 21 rounds but zero replay-relative event or round timestamps.
  Automatic offset discovery therefore reports unavailable. User-entered
  replay times remain labeled user-entered and visible as missing parser
  evidence.
- **U2 browser proof:** A real combined project used the existing 20-minute
  MP4 and nine-round replay. One-anchor verification returned a readable 409.
  Two confirmed anchors fitted offset and drift; a saved correction, round
  adjustment, notes, verified version, and editable correction version all
  survived a full restart. The source route returned HTTP 206, the UI rendered
  no error overlay, and five video projects, three replay packages, and four
  references remained after deleting only the temporary wrapper.
- **U3 implementation:** Evidence-backed candidate review, separate Event
  Confidence/Content Potential/Style Similarity, immutable local story and
  writing revisions, a non-destructive edit timeline, permission-gated local
  voiceover/music, low-resolution preview proxies, and deterministic
  full-resolution H.264/AAC exports are available in one short-form workspace.
- **U3 browser proof:** The real 20-minute recording produced reviewed
  candidates, an original facts-bounded writing package, a multi-item vertical
  edit, a 360×640 proxy, and a 1080×1920 12.667-second H.264/AAC export. The
  final file was 4,510,228 bytes, reached browser media ready-state 4, streamed
  with HTTP 206, and downloaded with a safe filename. Real cancellation and
  restart recovery removed partial files while preserving history. A generated
  fixture also produced a 1920×1080 export.
- **U3 cleanup:** Temporary unified projects, uploaded synthetic audio, proxies,
  and exports were deleted through app-owned controls after verification. All
  five source projects, ten historical analysis jobs, and four references
  remain.
- **U4 implementation:** Long-form projects support evidence-bounded
  20/25/30/custom planning across multiple recordings, chronological/reordered
  preferences, immutable planner history, a separate lockable timeline,
  deterministic duration fitting, local audio, segmented preview rendering,
  and 1920×1080 H.264/AAC exports.
- **U4 real-media proof:** The owned 20:38 recording produced a 1,200.022-second
  640×360 preview and a 1,200.019-second 1920×1080 H.264/AAC export. The final
  file is 1,189,420,042 bytes, loads and seeks in the browser, downloads safely,
  and returns HTTP 206 ranges. A locked section survived exact 20:00 fitting,
  and the source SHA-256 remained unchanged.
- **U4 multi-recording proof:** A real 20:00 planner revision crossed three
  owned recordings and saved separate chronological and reordered revisions.
  A render interrupted during segment 7 of 17 recovered as an honest error
  after restart, removed every partial segment, and retained its plan and
  timeline. The exercise found and fixed the later-recording zero-offset edge
  case in versioned pipeline `u4-segmented-ffmpeg-v2`.
- **U4 cleanup and persistence:** A cancelled history row and the temporary
  multi-recording wrapper were deleted without deleting source records. The
  completed preview/export, locked timeline, planner history, five source
  projects, and all prior references/replays remain. Render temporary storage
  is empty.
- **U5 implementation:** Voiceover Studio now separates reviewed facts,
  inferences, and unknowns before local script generation; saves immutable
  script revisions; records or streams owned narration; manages multiple named
  section takes; preserves originals; creates versioned processed copies; saves
  editable local Whisper captions; and places active narration/captions into
  short- or long-form timelines with explicit gameplay-audio ducking.
- **U5 real-media proof:** The owned 10.944-second creator-microphone source was
  trimmed, normalized, conservatively denoised, raised 1 dB, captioned, edited,
  aligned at 1.5 seconds, and rendered into a 1,200.022-second 640×360 H.264/AAC
  preview. Version `u5-segmented-ffmpeg-v5` produced a 67,707,935-byte playable
  file with centered multi-line captions; the untouched source retained
  SHA-256
  `bad3d63c2aac34fbfd699c2b442d754900748edc60e5a38980be74c75bfbc610`.
- **U5 recovery and persistence:** Cancellation removed partial narration
  files. A deliberately interrupted job became an honest restart error and
  removed its temporary directory without losing the completed take, processed
  output, captions, or timeline. A later processed version replaced only its
  section. Media reached browser ready state 4 after restart, and the console
  contained no warnings or errors.
- **U6 implementation:** Coaching Lab now stores source-capability disclosures,
  calibration assumptions, conservative POV measurements, typed evidence,
  explicit human corrections, isolated local analysis rules, cancellable and
  restart-safe jobs, practice drills, review clips, immutable reports, and
  JSON/Markdown/PDF exports. Every finding keeps direct observation, replay
  fact, transcript support, inference, conflict, and missing context separate.
- **U6 real proof:** The owned 20:38 recording and validated nine-round replay
  produced 26 combined findings across five completed rule runs. One semantic
  menu/repeated-view false positive was rejected, one visible observation was
  accepted and corrected from 60.00 to 60.25 seconds, one drill was generated,
  and one 60.0–74.0-second H.264/AAC review clip was created and played.
- **U6 reports and recovery:** One immutable report survived a complete server
  restart with a browser/print view and checksummed JSON, Markdown, and PDF
  files. A cancelled analysis stored zero partial findings; an interrupted job
  recovered as an honest error with zero partial findings. The browser console
  remained empty after restart. These results support the exercised local
  evidence paths, not universal tactical-diagnosis accuracy.

## Latest real replay verification

The exact imported nine-round package completed through the application
background-job route on July 31, 2026:

- 9 successful rounds, 0 failed rounds
- approximately 1.94 seconds of provider processing
- game version `Y11S2_Alpha04`, code version `9803520`
- map `LairY10`, mode `Bomb`, match type `Ranked`
- 10 privacy-safe players and 67 canonical events
- 62 direct kill records, 32 direct headshot flags, and 4 defuser feedback
  records
- canonical validation `VALIDATED` with `HIGH` confidence
- 9 persisted per-round success records and a privacy-sanitized retained result

The imported replay and its original source files were not modified or deleted.
The report deliberately makes no movement, room-location, POV-reconstruction,
highlight-accuracy, review-time, view, or virality claim.
