# R6 Creator AI — Implementation Plan

## Product goal

Build a private, local-first web application that turns an uploaded Rainbow Six
Siege MP4 recording into a saved project with inspectable video metadata,
manually selected clips, editable timestamped transcripts, and useful
content-writing suggestions. Phase 2 remains free and local: recordings and
transcripts do not leave this computer, and no paid AI API is required.

The longer ClutchScript business plan informs the product direction, but this
milestone is deliberately limited to the useful internal workflow that can be
tested today: ingest a recording, inspect it, cut clips reliably, and organize
the deliverables.

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
├── models/
│   └── whisper/ggml-base.en.bin
├── transcription-temp/
├── uploads/
│   └── <project-id>/source.mp4
└── clips/
    └── <project-id>/<clip-id>.mp4
```

SQLite stores only metadata and file paths. MP4 bytes never go into SQLite.

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

## Phase 2 — transcription and assisted writing

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

## Deferred deliberately

- Authentication and multi-user accounts
- Cloud uploads, deployment, billing, or paid services
- Paid/hosted AI generation, voice cloning, or automatic highlight detection
- Overwolf telemetry and OBS synchronization
- OCR, computer vision, audio-peak detection, and highlight ranking
- Social publishing and third-party integrations
- Team approval, analytics, and customer-service workflows

These belong after the manual workflow and the business demand gates are
validated.

## Implementation status

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
