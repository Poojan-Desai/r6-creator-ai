# R6 Creator AI — Implementation Plan

## Authoritative Personal Version 1 direction

The authoritative execution sequence is now the unified **Creator Studio +
Coaching Lab** plan. It supersedes the earlier replay-first direction where the
two conflict. The application remains one local product, and both workspaces
share the existing media, replay, transcript, reference, map, operator,
evidence, job, storage, and export foundations.

The primary visual input is an owned gameplay screen recording. A Match Replay
is optional structured evidence and must never be presented as though it
contains original gameplay pixels or audio. The supported project modes are:

1. screen recording only;
2. Match Replay only;
3. screen recording plus Match Replay (recommended when both exist);
4. screen recording plus a permitted structural reference; and
5. screen recording plus replay plus a permitted structural reference.

References may influence high-level pacing, structure, energy, timing, and
content category only. The application must not copy another creator's script,
jokes, catchphrases, captions, branding, title, thumbnail, music, or distinctive
wording.

The verified replay parser at commit `93d1b62` is preserved by the annotated
tag `real-replay-foundation-stable`. A consistent private SQLite backup was
created before unified-project migrations. Existing Phase 1, Phase 2, Phase 3A,
Phase 3B foundations, map/operator knowledge, and real replay results remain
additive dependencies rather than work to rebuild.

## Unified execution sequence

### U1 — Unified project and input workflow

Status: **verified July 31, 2026**.

Build an additive unified workspace around existing records instead of making
the required-video `Project` model nullable or creating fake media:

1. Add a `StudioProject` record for the user's goal, input mode, reference
   choice, focus areas, free-form instructions, coaching goals, selected player,
   selected creator-audio track, and user-confirmed map/operator context.
2. Add normalized `StudioProjectInput` links for one primary gameplay recording,
   optional additional recordings, one replay package, and one permitted local
   or YouTube reference. Validate that each input kind points to exactly one
   compatible existing record.
3. Link an optional Creator Style Profile without copying protected expression.
4. Preserve replay-only support without implying that a replay supplies
   playable footage. Store a stable privacy-safe player identifier and alias
   snapshot because parser refreshes may replace canonical player row IDs.
5. Add an accessible guided creation flow asking what the user is creating,
   what they are providing, which reference to use, what to focus on, and any
   natural-language instructions.
6. Add a unified project dashboard with honest sections for Inputs,
   Synchronization, Transcript, Candidate moments, Story plan, Script, Editor,
   Coaching, and Exports. Later-stage sections must say that they are planned or
   awaiting inputs; an empty interface must never be shown as completed work.
7. Keep existing upload, replay import, reference, video project, clipping,
   transcription, benchmarking, map, and operator routes working.
8. Test request validation, incompatible input combinations, persistence,
   deletion behavior, migration from the verified database, browser navigation,
   restart persistence, and all legacy regressions.

U1 is complete only when screen-recording-only, replay-only, and combined
workspaces can be saved and reopened, existing data is unchanged, the guided
workflow is understandable without editing code, the browser is warning-free,
the database passes integrity and foreign-key checks, the complete validation
suite passes, and the focused U1 commit is clean.

Verified result: all three input modes saved exact typed input links and
survived a complete server restart. A combined project was created through the
browser with an existing 20-minute recording, the verified nine-round replay,
a Creator Style Profile, privacy-safe player selection, explicit audio
selection, user-confirmed context, and separate content/coaching instructions.
The unified dashboard reopened every setting, exposed later stages honestly,
and produced no browser console warnings or errors. Temporary verification
projects were deleted without deleting any source record or file. Formatting,
ESLint, strict TypeScript, 169 tests across 33 files, the production build,
SQLite integrity, foreign keys, and Phase 1–replay regressions passed.

### U2 — Replay/video synchronization

Status: **active; begins from the clean U1 checkpoint**.

Add versioned, non-destructive synchronization with manual anchors, multiple
automatic candidate offsets, per-round adjustments, drift correction, visual
verification, confidence, and separate observation/replay-fact/inference
records. A single uncertain anchor cannot establish synchronization. The user
must be able to align a video timestamp to a replay event, add a second point,
preview the mapping, correct it, and save a new version without changing either
source.

### U3 — Short-form Creator Studio

Status: not started.

Build evidence-backed candidates, human review, an editable story plan,
original scripts, voiceover integration, proxy previews, deterministic FFmpeg
editing, and real MP4 exports for 9:16, 16:9, 1:1, and 4:5 outputs. Support
15/30/45/60/90-second and custom targets. Keep Event Confidence, Content
Potential Score, and Style Similarity separate, inspectable, and explicitly not
predictions of views.

### U4 — 20–30 minute Long-Form Studio

Status: not started.

Plan and render approximately 20-, 25-, 30-minute, or custom videos from one or
more recordings. Store premise, teaser, chapters, selected matches/rounds,
transitions, retention beat, climax, ending, title/thumbnail concepts,
description, and chapter timestamps with reasons. Use preview proxies and
explicit full-resolution export; never invent missing angles or replay pixels.

### U5 — Voiceover Studio

Status: not started.

Extend the verified local creator-track transcription foundation with
record/import/take management, waveform/timeline placement, trimming, gain,
fades, retakes, preview, and deterministic mixdown. Do not identify speakers,
make voiceprints, clone voices, or transcribe unselected teammate audio.

### U6 — Coaching Lab

Status: not started.

Produce evidence-backed reviews using visible recording observations and
supported replay facts. Separate observed facts, replay facts, inferences,
conflicts, and unknowns. Never claim exact room/position, intent, line of sight,
player count, or mechanical cause when the available evidence cannot establish
it. Reports remain inspectable and local.

### U7 — Evidence fusion and progress tracking

Status: not started.

Unify evidence provenance, confidence, conflicts, workflow progress, job
recovery, content/coaching status, and explicit user corrections. Retain the
verified detector/scoring vocabulary and show unsupported capabilities as
unsupported rather than silently filling gaps.

### U8 — End-to-end export, testing, and release

Status: not started.

Verify complete real-media Creator Studio and Coaching Lab paths, playable media
exports, report exports, cancellation, restart recovery, storage cleanup,
database preservation, browser console cleanliness, beginner documentation, and
a release tag. Interface-only or fixture-only proof does not complete Personal
Version 1.

After each U stage, run targeted tests plus `npm run format:check`,
`npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`; verify
SQLite integrity and foreign keys; exercise the relevant browser path; update
`STATUS.md` and `docs/SESSION_HANDOFF.md`; and make one focused Git commit.

## Product goal

Build a private, local-first web application that turns owned or permitted
Rainbow Six Siege recordings into inspectable projects, reference-informed
creator profiles, evidence-backed candidate moments, and original content
packages. Phase 1 and Phase 2 remain intact. Local processing remains the
default, and the core workflow must continue working without a paid API.

The Personal Version 1 direction is now **recording-first with optional replay
evidence**. Gameplay MP4 supplies original pixels, audio, transcription,
editing, exports, and visible coaching observations. Completed `.rec` rounds or
a replay ZIP may add structured match facts. See `MASTER_ROADMAP.md` and
`STATUS.md` for the authoritative execution order and current checkpoint.

The longer ClutchScript business plan informs the product direction. Phase 3 is
deliberately split into independently testable stages. It first measures
high-level characteristics from permitted references, then generates local R6
event candidates, learns from explicit local feedback, optionally adds a
budgeted cloud analysis provider, and finally assembles evidence-based content
recommendations. The product must never promise virality or guaranteed views.

## Confirmed local environment

- Workspace: `/Users/poojandesai/Documents/Codex/2026-07-21/i`
- Starting state: empty, except for the reserved `work/` and `outputs/` folders
- Node.js: installed (`v22.18.0`)
- npm: installed (`10.9.3`)
- SQLite command-line tool: installed (`3.43.2`)
- System FFmpeg / FFprobe: not detected; the application uses bundled local
  FFmpeg binaries installed with its npm dependencies
- Local speech engine: Homebrew `whisper-cpp` 1.9.1, verified available as an
  Apple Silicon bottle
- Speech model: English `base.en` GGML model (about 142 MB), downloaded into
  the ignored application data directory by the setup script

## Architecture

- **Web application:** Next.js App Router with TypeScript
- **Styling:** Tailwind CSS, with a responsive dark gaming-workspace design
- **Database:** SQLite through Prisma, stored below the application data folder
- **Video processing:** server-side `ffprobe` for metadata and `ffmpeg` for clip
  creation, using explicit environment paths when configured and bundled local
  binaries otherwise
- **Speech-to-text:** `whisper.cpp`, launched as a child process against a
  temporary 16 kHz mono WAV extracted from the user-selected audio stream
- **Background jobs:** persistent SQLite job records plus a server-side process
  controller; the browser polls status while FFmpeg/Whisper run off the request
  path and can request cancellation
- **Content writing:** a provider interface with a local deterministic template
  provider now; a future OpenAI provider can implement the same interface
- **File storage:** local filesystem, outside the public web directory
- **Video delivery:** route handlers that stream files with HTTP byte-range
  support; uploads are written as streams instead of copied into browser memory
- **Validation:** Zod schemas plus server-side MIME, extension, size, timestamp,
  and media-stream validation
- **Testing:** Vitest for unit and route-independent service tests; Next.js build
  for production compilation and TypeScript validation

## Local data layout

Runtime files are ignored by Git and live in one configurable directory:

```text
data/
├── r6-creator.db
├── replays/
│   └── <replay-package-id>/rounds/round-001.rec
├── replay-import-temp/
├── replay-parser-outputs/
├── tools/
│   └── replay-parsers/r6-dissect
├── models/
│   └── whisper/ggml-base.en.bin
├── references/
│   └── <reference-id>/source.mp4
├── reference-analysis-temp/
├── detector-analysis-temp/
├── detector-artifacts/
├── transcription-temp/
├── uploads/
│   └── <project-id>/source.mp4
└── clips/
    └── <project-id>/<clip-id>.mp4
```

SQLite stores only metadata and file paths. MP4 bytes never go into SQLite.

## Preserved replay Phase R1/R2 checkpoint

### R1 — provider audit and real-replay proof

1. Audit `redraskal/r6-dissect` and `wnc-replay/replay-tool` at exact commits,
   including source, dependencies, tests, license, network/filesystem behavior,
   Apple Silicon build, and actual fixture execution.
2. Integrate only a provider whose license and observed behavior are acceptable.
3. Build the selected provider from reviewed source into project-owned storage,
   fingerprint the executable, and run it with bounded output, timeout,
   cancellation, direct child-process termination, and schema validation.
4. Run the same providers against a user-approved real replay before claiming
   R1 complete. A public fixture verifies wiring only.

Verified result (July 31, 2026): both candidates built. `r6-dissect` is MIT and
integrated. The WNC checkout has no top-level license and remains audit-only. A
user-approved nine-round `Y11S2_Alpha04` replay exposed an upstream unknown
operator panic. A minimal versioned MIT compatibility patch corrected that
specific roster gap, after which all nine rounds parsed independently. The
application now persists safe process/per-round diagnostics, distinguishes
partial and unsupported results, and preserves prior canonical data across
cancellation/restart. This satisfies the real execution gate for that exact
package and provider version; it is not universal current-version support.

### R2 — secure import and canonical evidence

1. Stream individual `.rec` files or one ZIP into a unique temporary directory.
2. Validate extension/MIME, replay magic, per-file/package limits, ZIP paths,
   links, entry count, expanded size, compression ratio, duplicates, and
   project association.
3. Require a lawful-possession confirmation and default to privacy aliases.
4. Store app-owned replay/package fingerprints, parser runs, per-field
   capabilities, canonical matches, rounds, players, events, and evidence.
5. Keep direct observation, inference, conflict, missing evidence, confidence,
   validation state, provider identity, and version separate.
6. Run parsing outside the request, persist progress/error/cancellation, recover
   interrupted jobs after restart, sanitize retained JSON, and clean temporary
   output.
7. Display populated, partial, empty, and unsupported capabilities, then provide
   explicit package deletion.
8. Make Match Replays the primary navigation/home action while preserving all
   existing MP4 workflows.

R2 is checkpointed at `replay-r2-foundation-stable`. The corrected current
replay proof is checkpointed at `real-replay-foundation-stable`. The R1 real
execution gate is satisfied for the exact verified package. The old standalone
R3 sequence is replaced by U1–U8; replay reconstruction capabilities remain
bounded by the same measured provider limitations.

## Phase 3 score vocabulary

- **Event confidence** measures how strongly available local evidence supports
  an event interpretation.
- **Content Potential Score** estimates how suitable a reviewed moment may be
  for making content, based on transparent local signals and preferences. It is
  not a prediction of views or virality.
- **Reference-style similarity** compares structured pacing, energy, length,
  reaction, humor, educational, hook, and story characteristics.

These values are stored, displayed, and explained separately. None is a
guarantee of performance.

## Data model

### Project

- id, name, status, createdAt, updatedAt
- original filename and saved source path
- MIME type and file size
- duration in seconds
- width and height
- average frame rate
- optional readable processing error

### Clip

- id, projectId, name, status, createdAt, updatedAt
- start and end times in seconds
- duration and saved output path
- file size
- optional readable processing error

### ContentDraft

One record per project with editable placeholders for:

- voiceover script
- opening hook
- YouTube title
- short-form caption
- thumbnail text
- editing instructions

### AudioTrack

- project and FFprobe stream index
- codec, channel count, channel layout, language, and title metadata
- whether the container marks the stream as default
- a transparent preference score used only to recommend an isolated creator
  microphone; ambiguous multi-track recordings require an explicit selection

### TranscriptionJob

- selected project and audio track
- queued, extracting, transcribing, saving, completed, cancelled, or error
  status
- integer progress, readable current stage, provider/model, timestamps, and
  persisted error details
- cancellation request timestamp so status remains understandable across a
  server restart

### TranscriptSegment

- job and stable segment order
- start/end time in seconds
- editable text plus the original local-Whisper text
- timestamps for persistence and auditability

## API surface

- `POST /api/projects` — stream one MP4 to local storage, validate it with
  FFprobe, and create the project
- `GET /api/projects/:id` — retrieve project, clips, and content draft
- `DELETE /api/projects/:id` — delete one project and its owned files
- `POST /api/projects/:id/clips` — validate timestamps and create a clip
- `GET /api/media/projects/:id/source` — byte-range stream the source recording
- `GET /api/media/clips/:id` — byte-range stream or download a generated clip
- `PATCH /api/projects/:id/content` — save all editable content fields
- `GET /api/projects/:id/transcription` — get audio tracks, current job, and
  the completed transcript
- `POST /api/projects/:id/transcription` — queue transcription for one explicit
  audio stream
- `POST /api/transcriptions/:id/cancel` — request cancellation and stop its
  active local process
- `PATCH /api/transcript-segments/:id` — save an edited transcript line
- `POST /api/clips/:id/suggestions` — generate six local writing suggestions
  from the selected clip and its overlapping transcript
- `GET /api/health` — report application, database, and FFmpeg readiness

## User experience

### Home / projects dashboard

- Product overview and local-processing reassurance
- FFmpeg readiness banner with beginner-friendly setup guidance when missing
- Large drag-and-drop MP4 upload area with progress and validation feedback
- Saved-project cards with upload date, duration, resolution, clip count, and
  latest status
- Empty and error states that explain what to do next

### Project workspace

- Streamed source-video player and technical metadata
- Manual clip form using `MM:SS`, `HH:MM:SS`, or seconds
- Visual validation for nonnumeric, negative, reversed, or out-of-range times
- Clip library with preview, download, timing, status, and failure details
- Autosafe-feeling explicit save area for the six content-writing placeholders
- Audio-track chooser with conservative creator-microphone recommendation
- Non-blocking transcription progress, cancellation, and readable setup/errors
- Searchable, editable timestamped transcript; timestamp buttons seek the
  streamed source player without loading the whole MP4 in memory
- Clip writing assistant with six tones and all six requested outputs
- Responsive navigation back to all projects

## Reliability and security rules

- Accept only one `.mp4` upload per request.
- Enforce a configurable maximum upload size and reject missing or misleading
  content types.
- Use generated IDs and fixed server-owned filenames; never trust user paths.
- Confirm with FFprobe that the uploaded file has a real video stream.
- Stream uploads directly to disk and stream playback/download with byte ranges.
- Validate clip bounds on both client and server.
- Run FFmpeg without a shell and pass arguments as an array.
- Write clips to temporary files and rename only after successful processing.
- Remove partial upload/clip files after failures.
- Return structured, readable API errors; keep command details out of the UI.
- Keep all local uploads, generated clips, SQLite files, and environment secrets
  out of source control.
- Never transcribe a multi-track recording until the user has selected a track;
  recommend a likely creator microphone only when the metadata is convincing.
- Map the selected FFprobe stream index explicitly when extracting audio.
- Spawn local media/speech tools without a shell, cap captured output, and clean
  temporary WAV/JSON artifacts on success, failure, or cancellation.
- Persist every job state transition and convert interrupted in-flight jobs into
  a readable restart error rather than leaving them stuck forever.

## Phase 1 — stable foundation (completed and preserved)

The complete upload, metadata, streamed playback, manual clipping, local
project/clip persistence, and content-draft workflow was committed before Phase
2 work as `2099b2f` (`chore: preserve stable phase 1`).

## Phase 2 — transcription and assisted writing (completed and preserved)

The verified Phase 2 application is preserved in Git commit `22cd36c`
(`feat: add local transcription and content writing`). Phase 3 begins on the
`codex/phase-3` branch from that exact commit.

### Phase 2A — Audio inventory and migration

1. Extend FFprobe normalization to capture every audio stream.
2. Add audio-track, transcription-job, and transcript-segment tables using a
   checked-in additive migration.
3. Populate audio tracks during new uploads and safely backfill old projects
   when their workspace is opened.
4. Test stream normalization and creator-microphone recommendation rules.

**Exit condition:** one-track, multi-track, and silent MP4s are represented
accurately without losing any Phase 1 data.

### Phase 2B — Local transcription jobs

1. Add an idempotent setup script for the Homebrew binary and free `base.en`
   model, with explicit binary/model environment overrides.
2. Add the persistent job runner, explicit audio-stream extraction, Whisper JSON
   parsing, progress updates, cancellation, cleanup, and restart reconciliation.
3. Add thin validated job status/start/cancel routes.
4. Test arguments, progress parsing, transcript parsing, state transitions, and
   cancellation behavior with controlled process fixtures.

**Exit condition:** a job runs outside the request lifecycle, reports useful
progress, can be cancelled, and cannot remain falsely active after a restart.

### Phase 2C — Transcript workspace

1. Add audio selection and transcription controls.
2. Render timestamped transcript segments and seek the existing streamed video
   player from each timestamp.
3. Add instant local search plus validated per-line edits saved to SQLite.
4. Add accessible loading, empty, no-audio, setup, cancelled, and failure states.

**Exit condition:** the selected track becomes a searchable, editable transcript
whose changes survive a server restart.

### Phase 2D — Content-writing provider

1. Define provider-neutral tone/context/result contracts.
2. Implement a deterministic local template provider for Funny, High energy,
   Storytelling, Educational, Serious, and Natural tones.
3. Generate hook, full voiceover, title, caption, thumbnail text, and editing
   instructions using only the selected clip and overlapping transcript.
4. Let the user review and apply suggestions to the existing saved content
   package.

**Exit condition:** no route or component is coupled to an OpenAI SDK, and a
future provider can be added behind the interface without rewriting the UI.

### Phase 2E — Documentation and release verification

1. Update `AGENTS.md`, `.env.example`, and the beginner `README.md`.
2. Run formatting, lint, strict type checking, automated tests, and production
   build.
3. Generate a multi-audio-track MP4 with spoken creator audio, upload it through
   the browser, transcribe the creator track, inspect/click/edit/search the
   transcript, and generate all writing outputs.
4. Stop and restart the application, then verify the transcript edit and job
   completion still appear correctly in the browser.

**Exit condition:** all checks pass and the complete real-video path, including
restart persistence, has evidence. Completion will not be claimed earlier.

## Phase 3A — Reference Library and Creator Style Profiles

### Phase 3A.1 — Additive reference foundation

1. Add checked-in, additive SQLite tables for local and YouTube references,
   reference audio tracks and transcripts, style-analysis jobs, style features,
   creator profiles, profile features, and reference/profile membership.
2. Preserve every existing project, clip, transcript edit, transcription job,
   and writing draft while applying the migration.
3. Reuse the streamed MP4 upload and byte-range media architecture. Store local
   references below a server-owned generated path, never in SQLite or browser
   memory.
4. Require the exact ownership/permission confirmation before any local
   reference file is accepted. Store when it was confirmed.
5. Add explicit deletion operations that remove related rows and owned files,
   while never accepting a raw client filesystem path.

**Exit condition:** an owned MP4 reference can be streamed into local storage,
reopened, played through byte ranges, and deleted without affecting Phase 1 or
Phase 2 projects.

### Phase 3A.2 — Legal YouTube reference-only mode

1. Accept standard YouTube watch, Shorts, share, and embed links only after
   strict host, protocol, and eleven-character video-ID validation.
2. Normalize stored links and render the official privacy-enhanced embedded
   YouTube player. Never download the video, captions, audio, or arbitrary
   third-party files.
3. When `YOUTUBE_DATA_API_KEY` is configured server-side, retrieve permitted
   public metadata using the official YouTube Data API. Never serialize the key
   or include it in client JavaScript.
4. When no key is configured, keep a manual title/channel/category fallback and
   clearly explain why full analysis is unavailable.
5. Define a provider boundary for possible future OAuth access to a user's own
   channel; do not store OAuth tokens or require OAuth during Phase 3.

**Exit condition:** a supported YouTube link persists and embeds in legal
reference-only mode both with and without public API metadata configuration.

### Phase 3A.3 — Local measurable style analysis

1. Inventory audio tracks and choose a creator microphone only when metadata is
   sufficiently clear. Require an explicit choice for ambiguous multi-track
   references and never transcribe teammate audio by default.
2. Run reference transcription, scene-change sampling, black-frame detection,
   silence detection, and an audio-energy curve in a cancellable background job
   with persisted progress and restart recovery.
3. Derive the requested duration, hook, setup/action/reaction, cut, speech,
   silence, caption, audio, semantic-structure, title, thumbnail, ending, and
   call-to-action fields. Every feature record includes its extraction source,
   confidence, human-readable evidence, detector version, and whether it was
   manually corrected.
4. Store unavailable characteristics explicitly rather than inventing a value.
   Caption/OCR and live-audio-versus-voiceover results remain estimates until
   there is sufficient observable evidence.
5. Allow every extracted feature to be corrected manually and preserve the
   original automated value for auditability.
6. Remove temporary WAV, frame, and analysis files on completion, failure,
   cancellation, and scheduled cleanup.

**Exit condition:** a permitted local reference produces a timestamped local
transcript and a complete inspectable feature set; cancellation is responsive,
manual corrections persist, and a restart does not leave a false active job.

### Phase 3A.4 — Creator Style Profiles

1. Create a named profile from one or more analyzed permitted references.
2. Aggregate only high-level structured characteristics such as timing, pacing,
   energy, structure, reaction emphasis, and content category. Do not retain or
   reproduce another creator's script, title, jokes, catchphrases, or wording.
3. Support all requested adjustable preferences, including length, hook,
   energy, humor, education, story, setup, voice/live balance, captions, cuts,
   reactions, title/thumbnail form, avoid/preferred phrases, profanity, and
   perspective.
4. Show plain-language reasons and contributing references behind every derived
   preference. User-entered preferred phrases are never mined from reference
   transcripts.
5. Allow profile editing, reference membership changes, and explicit deletion.

**Exit condition:** a profile can be created from multiple analyzed references,
its values and evidence can be inspected and corrected, and all changes survive
an application restart.

### Phase 3A.5 — Verification and commit

1. Add automated coverage for URL parsing, permission enforcement, persistence,
   profile aggregation, cancellation/restart state, migrations, and cleanup.
2. Run formatting, ESLint, strict TypeScript, every existing and new test, and a
   production build.
3. Verify three owned/permitted local references and one YouTube link through
   the browser, inspect the console, cancel one analysis, correct a feature,
   create a profile, restart the app, and verify persistence.
4. Record exact evidence and limitations in the README, then create a dedicated
   verified Phase 3A Git commit before starting Phase 3B.

**Exit condition:** every Phase 3A path above is proven with automated and real
browser/media checks; Phase 3A is not complete merely because its screens exist.

## Phase 3B — Local R6 candidate-moment detection

The engineering question is whether local, evidence-supported candidates reduce
human footage-review time. Phase 3B does not need to understand every gameplay
event perfectly and does not predict views or virality.

### Phase 3B.1 — Benchmark labeling and detector framework

1. Add an annotated Git checkpoint for the exact verified Phase 3A commit.
2. Add additive SQLite tables for ground-truth labels, benchmark datasets/runs,
   detector definitions/configurations/runs/events/evidence, analysis jobs, HUD
   calibration, OCR records, candidate foundations, review labels, telemetry
   import foundations, and benchmark metrics. Preserve every Phase 1–3A row.
3. Add timestamp-validated manual label create/edit/delete operations covering
   all requested categories and benchmark-approval state.
4. Add streaming SHA-256 video fingerprints plus versioned JSON export/import.
   Exports contain no source path or original filename. Reject a mismatched
   project fingerprint, duration, or resolution unless a later explicit remap
   workflow is introduced.
5. Add a keyboard-friendly project labeling workspace with start/peak/end marks,
   range replay, boundary nudges, category edits, deletion, and visible keyboard
   shortcuts. Reuse the byte-range player rather than loading the MP4 into
   browser memory.
6. Define a versioned detector contract and registry with declared inputs,
   parameters, cost, enablement, progress, cancellation, cleanup, warnings, and
   structured results. Add job/run persistence, failure isolation, retry/delete
   services, interrupted-job reconciliation, and temporary artifact cleanup.
7. Register only framework definitions in this stage. Real scene/audio/
   transcript detectors begin in Phase 3B.2; the UI must say that no automatic
   candidates are available yet.
8. Test migration from a Phase 3A database, label CRUD/import/export, fingerprint
   safety, detector registration/configuration/version persistence, isolated
   fixture failures, cancellation, restart reconciliation, and cleanup.

**Exit condition:** a real project can be labeled and exported/imported through
the browser, the detector framework proves cancellation/failure/restart behavior
with deterministic fixture detectors, all Phase 1–3A regressions pass, and no
automatic detection claim is displayed.

### Phase 3B.2 — General video, audio, and transcript detectors

Phase 3B.2 produces broad, local, time-based signals. It does not infer a kill,
death, round result, map location, operator, defuser state, clutch, or content
performance from those signals. The verified `3922b2b` state is preserved by
the annotated `phase-3b2m-stable` tag.

#### Phase 3B.2.0 — Measurement contract and checkpoint

1. Preserve Phase 3B.2-M, audit the existing registry/job/cancellation/restart
   path, and version the signal and benchmark contracts before implementation.
2. Prefer the bundled FFmpeg/FFprobe filters documented in ADR-006. Defer
   OpenCV and optical flow until measured footage proves the sampled
   frame-difference signal inadequate.
3. Keep detector temporary/artifact cleanup rooted only under detector-owned
   directories. Regression-test that map blueprints, previews, annotations,
   imports/exports, versions, search, and confirmed project context are intact.

#### Phase 3B.2.1 — Shared time-series storage and utilities

1. Add additive `SignalCurve` and `SignalCurveChunk` storage plus per-run
   performance fields. A curve records signal kind, units, source role/stream,
   detector version, sample interval, aggregation method, exact configuration,
   robust baseline statistics, and counts.
2. Store bounded gzip-compressed JSON chunks instead of a SQLite row per frame.
   Validate ordered/clamped timestamps and preserve spikes through configurable
   maximum, mean, median, percentile, or event-preserving aggregation.
3. Implement rolling-median, median-absolute-deviation, percentile, and local
   relative-deviation helpers with plain-language formulas and deterministic
   tests. Curves can be transactionally replaced, deleted, and regenerated.

#### Phase 3B.2.2 — General video signals

1. Add versioned FFmpeg scene-score extraction with minor/strong/probable-cut
   event wording, temporal spacing, duplicate suppression, neighboring scores,
   and no gameplay-event interpretation.
2. Add a downscaled sampled frame-difference/action curve with spike,
   sustained-high, and sustained-low ranges. Flag scene/black evidence that may
   explain a visual spike. Optical flow remains deferred unless this measured
   path proves insufficient.
3. Add temporally consistent black, freeze/static, brightness, and broad visual
   transition detectors. Output only transition/static/interruption candidates;
   never label a loading, menu, death, spectator, scoreboard, or round screen as
   confirmed.

#### Phase 3B.2.3 — Separate audio signals

1. Require an existing deliberate track-role choice. Store creator microphone,
   game audio, mixed audio, and unknown roles separately; never choose a track
   merely because it is louder and never transcribe a new track during analysis.
2. Extract bounded FFmpeg RMS/peak loudness windows, normalize each track to its
   own rolling/global baseline, and derive separate sudden-peak, sustained-loud,
   silence, low-energy, clipping-warning, and overlap events.
3. Handle quiet/loud/background-noise/clipped/silent/game-only/separate-track
   fixtures, missing selections, cancellation, and no-audio recordings without
   failing unrelated detectors.

#### Phase 3B.2.4 — Transcript evidence and reaction candidates

1. Add versioned local transcript rules with exact/phrase/group patterns,
   context, negation and ambiguity handling. Persist matched line IDs/text,
   timestamp, rule/version, exact match, surrounding context, confidence, and
   warnings. Words support but never confirm gameplay facts or map location.
2. Add advanced inspect/enable/disable/duplicate/edit/reset/export/import and
   explicit rerun controls. Invalid patterns reject safely; historical detector
   results retain their original rule version.
3. Combine selected creator-track peaks with transcript evidence into possible
   excitement/surprise/laughter/frustration/celebration or unclassified strong
   vocal candidates. These are behavior/content cues, not emotion diagnoses;
   audio-only results say their reaction type is uncertain.

#### Phase 3B.2.5 — Signal Explorer, jobs, and honest evaluation

1. Replace the framework-only project panel with detector/settings/track-role
   controls, measurable work-unit progress, whole-job and per-detector
   cancellation/retry/delete/rerun, isolated partial success, and persisted
   processing/memory/disk/measurement counts.
2. Add a responsive canvas-based synchronized Signal Explorer for video,
   curves, events, transcript evidence, reaction candidates, and approved
   labels. Support zoom/pan, track/filter controls, event detail, seek/replay,
   transcript links, selected ranges, and manual-label creation without one DOM
   element per sample.
3. Evaluate only relevant approved labels under the Phase 3B.2 method in
   `BENCHMARK.md`. Display sample counts and false positives; fewer than five
   approved examples remains **Insufficient benchmark examples**.
4. Verify real 20:38 footage, separate creator/game tracks, speech/no-audio,
   black/static fixtures, cancellation, isolated failure/retry, settings rerun,
   restart persistence, cleanup boundaries, map regressions, performance, and
   browser console before the final documented commits.

**Exit condition:** efficient local detectors produce reproducible general
signals and inspectable compressed curves on real media, creator/game audio
remain separate, broad events state their evidence/limits, failures are
isolated, cancellation/restart cleanup is verified, the Signal Explorer remains
responsive on the real 20:38 recording, benchmark results are honest, all Phase
1–3B.2-M regressions pass, and the working tree is clean.

### Phase 3B.2-O — Versioned R6 operator knowledge foundation

This is a separately committed knowledge-management workstream. It may begin
only without weakening the general detector milestones above. It stores the
current official roster and versioned abilities/loadouts, keeps official
specialties separate from community/user roles, represents conditional
counters/synergies and user-verified map links, supports search/comparison and
versioned import/export, and exposes only user-confirmed project operator
context. It defines but does not implement future operator/ability detection.

Implementation boundary on July 22, 2026:

1. The official Ubisoft directory retrieval contains 77 listed operators,
   including Solid Snake and Denari, with attacker/defender side and official
   specialties. Eleven representative operators have source-transcribed
   structured abilities and current loadouts; every other listed operator is
   visibly marked **detail needs verification** rather than filled from memory.
2. Additive tables preserve operator/ability versions, loadouts, official and
   nonofficial roles, gadgets, conditional interactions, map/bomb-site links,
   citations, update reviews, and optional project context. Official facts and
   user additions keep separate provenance/confidence.
3. `/operators` supports local search and side/specialty/role/squad filters,
   contextual comparison, single/full versioned JSON export, validated import,
   packaged update review, and safe deletion of user facts. Detail pages expose
   sources and never present an operator as recognized from video.
4. Confirmed project operator fields may enter `ContentSuggestionContext` as
   `USER_CONFIRMED`; unconfirmed context is excluded. A future detector result
   interface exists, but no Phase 3B.2 detector implements it.

**Exit condition:** official current operator records and sources, historical
versions, structured abilities/loadouts, roles/interactions, optional map links,
search/comparison, confirmed project context, import/export, restart persistence,
tests/build/browser verification, and a separate clean commit exist without any
claim that footage recognition identifies an operator, weapon, gadget, or
ability use.

Release verification on July 23, 2026 confirmed the 77-record catalog, 11
source-transcribed detail records, search and insufficient-knowledge state,
safe packaged update review, contextual comparison, alias/role/content editing,
conditional counter and synergy entry, Oregon floor/room/bomb-site linking,
safe deletion, single-record export/import, and confirmed synthetic-project
context. Operator additions and existing map assets survived a complete server
restart. Final quality-gate results and the separate commit are recorded after
the gate completes.

### Phase 3B.2-M — Versioned R6 map knowledge foundation

This is a separately committed workstream alongside Phase 3B.2. It supplies
user-confirmed map context and inspectable knowledge for later detectors and
writing; it does not identify a map, floor, or room from video.

1. Seed a versioned official catalog from Ubisoft's current map directory and
   Operation System Override sources. Preserve source URL/title, retrieval and
   verification dates, season/version, provenance, descriptions, release and
   modernization dates, blueprint availability, and per-playlist state. Keep
   the July 2026 mid-season Ranked rotation as a newer source-backed override
   rather than rewriting older map-page evidence. Include all 27 current map
   guides plus Dual Front-only District.
2. Add an additive normalized schema for game-data versions, maps, aliases, map
   versions, floors, typed knowledge elements and aliases, bomb-site pairs,
   graph edges, citations, blueprint assets, project map context, preferred
   callout terminology, and edit history. A typed element table represents the
   requested rooms, hallways, stairs, ladders, hatches, doors, windows,
   exterior entries, spawns, objectives, cameras, drone routes, surface types,
   sightlines, rotations, routes, plants, positions, entries, flanks, and
   utility without duplicating identical geometry/provenance fields across many
   brittle tables.
3. Preserve every historical layout as an immutable-by-default map version.
   Large changes require duplicating a version. Store normalized `[0,1]`
   coordinates, confidence/provenance labels, last verification, tactical text,
   and source citations. Distinguish current, possibly outdated, historical,
   and unverified knowledge.
4. Add a visible manual blueprint import for an official Ubisoft ZIP or image.
   Stream the upload to bounded local storage, reject traversal/symlink/unsafe
   archive entries and unsupported content, preserve originals, create local
   optimized previews with FFmpeg, support floor naming/order, and delete owned
   assets safely. Never auto-download blueprint files.
5. Add a keyboard-accessible Map Knowledge workspace with map/playlist search,
   version duplication, floor switching, blueprint zoom/pan, polygon/line/point
   annotations, room/callout/bomb-site/graph/citation editing, safe autosave,
   undo/redo, and explicit deletion of user-created knowledge.
6. Add deterministic local graph and search queries plus versioned JSON
   import/export for a complete map or selected knowledge slice. Reject future
   schemas, path fields, duplicate stable IDs, out-of-range coordinates, broken
   references, and invalid element/edge combinations transactionally.
7. Add manual project context for map/version, bomb site, side, starting room,
   important rooms, operator, and round result. Expose only user-confirmed or
   explicitly selected facts through a provider-neutral writing-context
   interface. Define—but do not implement—the future map-location detector
   contract using possible/uncertain labels and supporting/conflicting evidence.
8. Test migration, official seed idempotency, versions, aliases, playlists,
   geometry, graph/vertical queries, bomb sites, citations, ZIP safety,
   import/export, search, deletion, undo/redo, project context, and all earlier
   regressions. Browser-verify the eight requested maps, one manually imported
   permitted blueprint fixture, partial annotations, export/delete/import, and
   restart persistence without implying every map is annotated.

**Exit condition:** current official map records and sources exist; versions,
blueprints, partial annotations, callouts, bomb sites, graph links, search,
manual project context, and import/export work and persist; all claims describe
knowledge status honestly; the quality gate passes; and the work is committed
separately from Phase 3B.2 detectors.

### Phase 3B.3 — R6 HUD calibration and screen-state detectors

1. Research maintained offline OCR choices for Apple Silicon and record the
   accuracy/install/speed/confidence/license/testability decision in an ADR
   before adding a dependency.
2. Add normalized calibration profiles and proportional 1920×1080,
   2560×1440, and 1280×720 region presets with frame seek, draw/resize, crop
   preview, duplicate/delete, project association, and positive/negative frame
   examples.
3. Add configurable crop preprocessing, selected-region OCR/image-difference
   previews, confidence, thresholds, temporal consistency, and bounded/redacted
   debug evidence.
4. Implement conservative kill-feed, round-result, death/spectator, defuser,
   rapid-event, and possible-clutch detectors. Unconfirmed results use “possible”
   or “candidate” wording and list missing evidence.
5. Add only a versioned telemetry JSON import/synchronization boundary plus a
   synthetic fixture. Label it “Prepared for a future Windows gameplay
   companion”; do not build Overwolf software on this Mac.

**Exit condition:** calibrated sampled HUD regions produce inspectable local
evidence with repeated-frame support, privacy-safe artifacts, and no unsupported
local-player or 1vX claim.

### Phase 3B.4 — Evidence fusion and candidate moments

1. Deterministically merge overlapping/nearby detector events while keeping
   sufficiently separated events distinct and removing near duplicates.
2. Clamp configurable context boundaries to the video. Persist category,
   alternatives, supporting/conflicting detectors, evidence timeline, missing
   evidence, detector/job versions, and plain-language explanations.
3. Compute and display separate formulas and breakdowns for Event Confidence,
   Content Potential Score, and optional structured Style Similarity. Keep all
   rule weights visible and fixed during Phase 3B.
4. Add candidate range playback, boundary/context correction, category/note
   edits, useful/not-useful/wrong-event review labels, transcript/debug links,
   and conversion through the existing real clip pipeline.

**Exit condition:** a real recording creates multi-signal candidates with
inspectable evidence and score formulas, and a corrected candidate becomes a
playable saved clip without any learned ranking.

### Phase 3B.5 — Benchmarking, browser verification, and documentation

1. Match approved ground truth and candidates using the versioned rules in
   `BENCHMARK.md`; calculate per-category counts, precision, recall, F1, and
   boundary/peak errors without hiding weak results or tiny samples.
2. Add processing speed, peak memory where measurable, disk use, candidates per
   hour, review minutes, useful-candidate rate, and useful-ground-truth discovery.
3. Add filterable Benchmark Dashboard plus versioned JSON and Markdown reports.
   Separate verified results, development estimates, unsupported capabilities,
   and untested categories.
4. Verify the required real-media, multi-track, no-reaction, menu/loading,
   calibration, completed/cancelled/isolated-failure, corrected candidate, clip,
   restart, cleanup, persistence, regression, and browser-console paths.
5. Update `PLAN.md`, `AGENTS.md`, `README.md`, and `BENCHMARK.md`; run every
   quality gate and commit the clean verified stage in small commits.

**Exit condition:** a legally usable labeled dataset yields honest reproducible
benchmark measurements and demonstrates whether candidate review saves time.

## Phase 3C — Personalized ranking and feedback learning

1. Persist every requested candidate decision, label, boundary/category/note
   edit, profile choice, export/post state, script edit, and optional manually
   entered performance metric.
2. Update transparent, user-adjustable ranking weights from explicit feedback;
   keep original recommendations and a rule-based fallback.
3. Show understandable local preferences and the evidence behind score changes.
4. Gate deliberate local model training behind at least 30 labeled candidates,
   show positive/negative counts and feature influence, version every model, and
   allow disable/revert operations.
5. Never combine private user data or call this autonomous self-training.

**Exit condition:** rejecting/approving candidates predictably affects later
rankings, the explanation changes accordingly, and a user can always return to
the versioned rule-based behavior.

## Phase 3D — Optional OpenAI analysis provider

1. Re-check current official OpenAI API documentation immediately before this
   stage, use the official server SDK, validate structured JSON with a schema,
   and keep configurable model names in server-only environment variables.
2. Require a visible user action before sending selected frames, a short
   transcript window, detector evidence, profile preferences, and basic context.
   Never upload a full-length source or reference video automatically.
3. Distinguish observation, inference, and unknown facts in every response and
   retain the local provider as the no-key/failure fallback.
4. Add estimated preflight cost, per-project limits, a global monthly budget,
   persisted usage, retries, timeouts, cancellation, and secret redaction.
5. Validate disabled, malformed-response, limit, timeout, and restart paths.

**Exit condition:** local mode remains complete with no key; configured cloud
analysis is explicit, budget-bounded, schema-validated, cancellable, and visibly
labeled in both the UI and saved request record.

## Phase 3E — End-to-end evidence-based recommendations

1. Add a facts-review panel separating confirmed facts, inferences, and unknowns
   before generation.
2. Produce three hooks, complete/alternate/live-audio script choices, platform
   titles/captions, thumbnail text, subtitle guidance, and an editing timeline
   using only reviewed evidence and the selected style profile.
3. Add original, evidence-backed zoom, overlay, pause, opening, and ending
   suggestions with a plain-language profile-match explanation.
4. Add a long-form planner for multiple approved moments, with grouping reasons,
   teaser, ordered story progression, transitions, retention beat, ending,
   calls to action, titles, and thumbnail concepts.
5. Complete the ten-step main workflow, persistent progress/recovery, all
   deletion controls, regression suite, real media/browser/restart verification,
   and final benchmark documentation.

**Exit condition:** the complete local workflow works after restart, optional
cloud analysis obeys consent and budgets when configured, packages use reviewed
facts, benchmark claims are supported, and all quality gates pass.

## Phase 3 risk and feasibility

### Reliable with the current local architecture

- Streamed owned-file upload, FFprobe metadata/audio-track inventory, byte-range
  playback, permission records, timestamped local Whisper transcription, manual
  correction, job progress/cancellation, and SQLite restart persistence.
- Strict YouTube URL/video-ID normalization, official embeds, and permitted
  public metadata when an official API key is configured.
- FFmpeg-based duration, black/transition candidates, scene-change estimates,
  silence intervals, audio-energy samples, speech coverage/rate, approximate cut
  frequency, and high-level profile aggregation with displayed evidence.
- Manual timestamp labels, byte-range range replay, versioned JSON interchange,
  streaming video fingerprints, detector/job version persistence, cancellation,
  restart reconciliation, and deterministic benchmark arithmetic.

### Moderately reliable after calibration and benchmark validation

- Temporally persistent scene changes, black transitions, sustained low motion,
  relative creator/game audio peaks, silence, and major screen-state changes.
- Timestamped transcript rule matches as supporting evidence, provided the
  selected creator track and transcript are accurate.
- Repeated-frame image differences inside a user-calibrated HUD region. These
  indicate a region changed; they do not establish who caused an R6 event.

### Experimental and always labeled as estimates

- The duration of an opening hook, first meaningful action, result-first opening,
  setup/action/reaction timing, caption density, voiceover/live-audio balance,
  laughter, excitement, humor, suspense, storytelling, frustration, mistakes,
  tactical explanations, and ending style.
- R6 HUD image differencing, OCR, template matching, motion intensity, kill-feed
  or result-banner interpretation, and all video-only event classifications.
- Reference similarity and Content Potential Score. They rank observable
  characteristics; they do not predict virality, views, or audience response.
- Reaction, laughter, frustration, rage, funny-conversation, mistake,
  explanation, possible-clutch, defuser, rapid-elimination, death/spectator,
  round-result, and local-player attribution candidates.

### Not confirmable from general video-only analysis today

- A confirmed kill, death, clutch, player count, 1vX state, defuser state, map,
  operator, rank, health, weapon, intention, or match stakes when the recording
  lacks sufficient repeated visual/telemetry/context evidence.
- Complete visual/audio/transcript/style analysis of a YouTube URL alone. The
  official public metadata API does not provide downloadable media or arbitrary
  captions; the owner must upload a permitted file for full local analysis.
- Guaranteed performance or a dependable prediction of virality. Human review,
  benchmarks, and post-performance data remain necessary.
- Live Overwolf/telemetry capture on this Mac, teammate identity, speaker
  identity, emotion diagnosis, or reliable local-player names from arbitrary
  overlays. Phase 3B only prepares a versioned future telemetry import format.

## Phase 3 research basis

- The official YouTube Data API `videos.list` endpoint provides permitted
  metadata with an API key or OAuth authorization and costs one quota unit per
  request. Official embeds use the documented `/embed/<video-id>` player URL.
- FFmpeg's documented `blackdetect`, `silencedetect`, scene-selection, and audio
  statistics filters provide local measurable signals. Their output is evidence,
  not semantic proof of an R6 event.
- Current OpenAI models and SDK behavior will be researched again from official
  OpenAI documentation during Phase 3D because model availability changes.

## Deferred deliberately beyond Phase 3

- Authentication and multi-user accounts
- Cloud uploads, deployment, billing, or paid services
- Voice cloning, speaker identification, automatic external publishing, or
  autonomous cloud uploads
- Overwolf telemetry and OBS synchronization
- Social publishing and unrelated third-party integrations
- Team approval, analytics, and customer-service workflows

These remain outside the authorized Phase 3 scope.

## Implementation status

- Phase 1 stable commit: `2099b2f`
- Phase 2 stable commit: `22cd36c`
- Phase 3 working branch: `codex/phase-3`
- Phase 3A foundation commit: `b14cc05`
- Phase 3A local analysis/profile implementation commit: `8758f53`
- Phase 3A: implementation and release verification complete on July 22, 2026
- Verified Phase 3A checkpoint tag: `phase-3a-stable` → `6119de7`
- Phase 3B benchmark-method commit: `3494f32`
- Phase 3B.1 schema/framework commit: `820afda`
- Phase 3B.1 labeling-workspace commit: `8d0e825`
- Phase 3B.1: implementation and verification complete on July 22, 2026
- Phase 3B.2-M implementation commit: `4ed43ca`
- Phase 3B.2-M: implementation and verification complete on July 22, 2026
- Phase 3B.2 signal architecture commit: `04f4222`
- Phase 3B.2 chunked signal foundation commit: `53f525f`
- Phase 3B.2 general video-detector commit: `956b13d`
- Phase 3B.2 role-aware audio-detector commit: `d538db1`
- Phase 3B.2 transcript-rule commit: `9731cf3`
- Phase 3B.2 Signal Explorer commit: `ce404b9`
- Phase 3B.2 broad-signal benchmark commit: `2fd7a66`
- Phase 3B.2-O operator knowledge: implementation complete; release verification
  complete; 77-record export/import round trip, 140 automated tests across 28
  files, formatting, ESLint, strict TypeScript, and production build passed;
  separate release commit pending

- Stable Phase 1 application — complete and preserved in Git commit `2099b2f`
- Phase 2A: audio inventory and migration — complete
- Phase 2B: local transcription jobs — complete
- Phase 2C: transcript workspace — complete
- Phase 2D: content-writing provider — complete
- Phase 2E: final documentation and release verification — complete

### Phase 1 verified end-to-end path

A generated six-second H.264/AAC MP4 was uploaded through the real multipart
route. FFprobe persisted its 6-second duration, 640×360 resolution, 30 fps frame
rate, and 649,246-byte size. A 1.25–4.75 second request produced a 436,234-byte
H.264/AAC clip through the bundled FFmpeg executable. Both source and clip
routes returned correct `206 Partial Content` responses for byte-range requests,
and the clip download returned an attachment filename. Invalid timestamps and a
misleading MIME type returned readable `400` and `415` errors. All six writing
fields were saved and retrieved after an application restart. The dashboard and
project workspace were also opened in the in-app browser; the saved project,
video players, clip controls, download, and writing fields rendered without
browser console warnings or errors.

### Phase 2 verified end-to-end path — July 22, 2026

The Apple Silicon Homebrew bottle for `whisper.cpp` 1.9.1 was installed and the
official `base.en` GGML model was downloaded into the ignored local data folder
and verified by SHA-1. An 11-second 960×540 H.264 test MP4 was created with two
AAC streams: a default “Game Audio” stream and a non-default “Creator
Microphone” stream containing real spoken English. Upload-time FFprobe discovery
saved both streams and correctly recommended the named creator microphone rather
than the default game stream.

A transcription was cancelled during audio extraction and persisted as
`CANCELLED` without partial segments. A subsequent background job completed,
produced the expected timestamped sentence, and left no temporary job directory.
A separate real no-audio MP4 returned an empty audio-track list and a usable
project instead of an error; its temporary test project was removed afterward.

In the in-app browser, the completed transcript appeared beside the selected
creator track. Clicking `0:00` set the streamed source player to that timestamp
and began playback. Search found the edited line, and saving changed it to
“Verified after restart: ask what you can do for your country.” The Storytelling
provider used that edited text to generate the opening hook, full voiceover,
YouTube title, short-form caption, thumbnail text, and editing instructions. All
six were applied to and saved in the content package.

The production server was stopped completely and started again. After a browser
reload, the selected audio inventory, completed transcript edit, clip, and all
six saved content fields reappeared from SQLite. The browser reported no warning
or error logs. The final automated suite contains 51 passing tests, and
formatting, ESLint, strict TypeScript, and the warning-free production build all
pass.

### Phase 3A verified end-to-end path — July 22, 2026

The additive Phase 3A migration was applied to the existing local database while
the three Phase 1/2 projects, two clips, three transcription jobs, two existing
transcript segments, and saved writing data remained intact. A migration test
also builds a fresh temporary Phase 1/2 database, inserts legacy data, applies
the Phase 3A migration, creates reference/profile records, and reopens the
database to prove persistence.

Three owned or permitted MP4 references were saved through the streamed
reference path: an 11-second two-track speech reference, a two-second no-audio
reference, and a five-minute gameplay reference. The analysis selected the
separately named Creator Microphone track, produced a timestamped local Whisper
transcript, and saved all 29 requested style fields with a value or an explicit
unavailable state plus source, confidence, evidence, and analyzer version. A
caption-density value was manually corrected and retained its automated audit
data. The no-audio reference completed without crashing. The five-minute job
was cancelled during processing; it remained `CANCELLED`, saved no partial
features or transcript, and left no temporary analysis files.

A YouTube share link was normalized to its canonical eleven-character video ID
and displayed through `youtube-nocookie.com` in reference-only mode. With no API
key configured, the browser showed the manual metadata fallback and the exact
full-analysis limitation. No media or captions were downloaded.

A named Creator Style Profile was created from two analyzed references. The UI
showed both contributing references, all adjustable preferences, and seven
plain-language reasons with confidence and usable-reference counts. The title
style was changed in the browser to “Short, original, result-first wording” and
saved locally. After the production server was stopped and started again, the
profile correction, two memberships, transcript, manual feature correction,
cancelled-job state, YouTube ID/embed, and all legacy data were still present.

The in-app browser rendered the Reference Library, legal YouTube detail,
cancelled analysis, and profile editor with zero console warnings or errors.
Formatting, ESLint, strict TypeScript, all 75 tests across 12 files, and the
production build passed. These checks verify Phase 3A reference ingestion and
style profiling only; `BENCHMARK.md` correctly records that no R6 detection
accuracy result exists yet.

### Phase 3B.1 verified path — July 22, 2026

The annotated `phase-3a-stable` tag preserves `6119de7`. The additive Phase 3B.1
migration was applied to a copy of that SQLite state and to the real database;
the existing three projects, two clips, two transcript segments, four
references, one style profile, and their related Phase 1–3A data remained
present. The migration regression test separately builds the Phase 1, Phase 2,
and Phase 3A schema sequence, inserts legacy rows, applies Phase 3B.1, creates
new label/detector/job data, and reopens the database.

The in-app browser opened a real 20:38, 1280×720 gameplay project. Local FFmpeg
frame samples supported an honest `MENU` label from 30.25 to 120 seconds with a
60-second peak. The browser created the approved label, changed its start by
0.25 seconds, displayed the saved note/confidence/category, and showed the
versioned export and import controls. The actual 222 MB source was fingerprinted
by streaming SHA-256; export/import completed against the real HTTP routes and
preserved the label while the JSON contained no filename or personal path.
The native macOS file chooser could not be automated because the verification
Mac was locked, so file-selection behavior is additionally covered by the
browser-rendered input, route round trip, and automated import tests rather than
a synthetic browser file attachment.

The browser started `core.media-integrity@1.0.0`, which completed with a stored
version and an explicit warning that Phase 3B.1 performs no gameplay detection.
It returned zero detector events and candidates. A deliberately inserted active
job and partial temp file simulated an application interruption. After a full
production-server restart, the job and run became readable `ERROR` records, the
temporary directory was gone, the browser showed the interruption, and Retry
created a fresh completed job. The test fixture was then deleted.

The browser also reopened the Reference Library, existing multi-reference style
profile, source preview, transcript workspace, clip station, and writing package.
Its warning/error console was empty. Formatting, ESLint, strict TypeScript, all
85 tests across 15 files, and the production build passed before documentation;
the same complete gate is rerun for the final Phase 3B.1 commit. These checks
prove the labeling and job framework only. No R6 event accuracy or footage-review
savings have been measured.

### Phase 3B.2-M verified path — July 22, 2026

The two additive map migrations were applied to both a preserved Phase 3B.1
database copy and the working database. Three existing projects, two clips, two
transcript segments, four references, one style profile, and the approved
benchmark label remained intact. The migration regression test rebuilt the
complete Phase 1-through-3B.1 schema, inserted legacy rows, applied both map
migrations, reopened SQLite, and verified historical/current versions, floors,
rooms, a graph edge, a bomb-site relationship, and confirmed project context.

The local catalog contains 28 source-cited records: all 27 guides on Ubisoft's
official map index plus District from Ubisoft's official Daybreak page. The
browser displayed Oregon, Clubhouse, Chalet, Border, Lair, Fortress, Villa, and
Calypso Casino and kept playlist state separate from map existence. The catalog
snapshot is `r6-y11s2.2-2026-07-22`; a local update-review record never fetches
or silently overwrites later data.

The official Oregon page's visible blueprint-download action supplied Ubisoft's
3,339,075-byte ZIP. The streamed importer preserved the ZIP and five original
JPEGs, created five 2000×1125 local previews, recorded their hashes and official
source URL, and left the temporary import directory empty. A generated ZIP with
an invalid AppleDouble image was rejected without partial assets, while a safe
fixture verified the same route before the official package was used. The npm
audit-discovered `yauzl` archive advisory was removed by upgrading to 3.4.0.

In the map editor, a Basement floor, Laundry, Supply, Freezer, Laundry Hatch,
alternate callouts, a Laundry/Supply bomb-site pair, a door connection, a
vertical-destruction relationship, and a source citation were saved. The map
export used `r6-map-knowledge/v1` and contained no `/Users/` path. A duplicated
manual version was exported, deleted, imported again, and reopened with four
elements, two connections, one bomb-site pair, and the citation. Searches for
“Oregon basement hatches” and “rooms above Laundry” returned the appropriate
typed element/graph evidence. The UI calls graph results possible routes, never
the best route.

A generated smoke-test project was assigned user-confirmed Oregon, version,
Laundry/Supply, defense, starting room, important rooms, and an explicit note
that the context was only a verification fixture. After a complete production
server restart, the context, imported version, annotations, graph, official
blueprint assets, and all earlier project/reference/profile data remained.
Existing gameplay and Phase 2 speech projects reopened with video, transcript,
clip, and writing controls. The Map Knowledge, project, Reference Library, and
Style Profiles pages had no browser warning or error logs. A shutdown-only media
stream race discovered during this check was replaced with a backpressure-aware,
cancellable file stream and covered by range and early-cancellation tests.

The exact-room limitation remained visible throughout: this foundation does not
recognize a map, floor, room, route, operator, or bomb site from footage. It does
not add a detector event, candidate moment, precision/recall result, or content
performance claim. Final formatting, ESLint, strict TypeScript, the complete
99 tests across 17 files, and the production build passed for the dedicated
commit.
