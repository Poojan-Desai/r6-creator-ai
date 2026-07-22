# R6 Creator AI — Implementation Plan

## Product goal

Build a private, local-first web application that turns an uploaded Rainbow Six
Siege MP4 recording into a saved project with inspectable video metadata,
manually selected clips, previews, downloads, and structured content-writing
placeholders. The first version uses no paid services, authentication, or
machine-learning features.

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
- System FFmpeg / FFprobe: not detected; the application therefore uses
  bundled local FFmpeg binaries installed with its npm dependencies

## Architecture

- **Web application:** Next.js App Router with TypeScript
- **Styling:** Tailwind CSS, with a responsive dark gaming-workspace design
- **Database:** SQLite through Prisma, stored below the application data folder
- **Video processing:** server-side `ffprobe` for metadata and `ffmpeg` for clip
  creation, using explicit environment paths when configured and bundled local
  binaries otherwise
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

## API surface

- `POST /api/projects` — stream one MP4 to local storage, validate it with
  FFprobe, and create the project
- `GET /api/projects/:id` — retrieve project, clips, and content draft
- `DELETE /api/projects/:id` — delete one project and its owned files
- `POST /api/projects/:id/clips` — validate timestamps and create a clip
- `GET /api/media/projects/:id/source` — byte-range stream the source recording
- `GET /api/media/clips/:id` — byte-range stream or download a generated clip
- `PATCH /api/projects/:id/content` — save all editable content fields
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

## Phased implementation and validation

### Phase 0 — Foundation

1. Create `PLAN.md` and `AGENTS.md`.
2. Initialize a strict Next.js + TypeScript + Tailwind project.
3. Add linting, formatting, type-checking, and Vitest scripts.
4. Add environment examples, local-data ignores, and a minimal README skeleton.
5. Run formatter check, lint, type check, unit tests, and production build.

**Exit condition:** the empty foundation installs and every validation command
passes.

### Phase 1 — Local persistence and service layer

1. Add the SQLite schema and Prisma client.
2. Add local storage path helpers and database initialization.
3. Add FFmpeg/FFprobe discovery and process helpers.
4. Add time parsing, filename, upload, and clip-range validation.
5. Unit-test validation and process-result parsing.
6. Run all validation commands again.

**Exit condition:** the database can be created locally, pure validation logic
is covered by tests, and missing FFmpeg is represented as an understandable
health result.

### Phase 2 — Upload and dashboard

1. Implement streaming multipart upload.
2. Validate the saved video with FFprobe and persist metadata.
3. Build the project dashboard and upload progress UI.
4. Add saved-project listing, empty, loading, and failure states.
5. Add service-level tests for metadata normalization and upload constraints.
6. Run formatter, lint, type check, tests, and production build.

**Exit condition:** a real MP4 can be uploaded when FFmpeg is installed, its
metadata is saved, and the project survives an application restart.

### Phase 3 — Project workspace and media streaming

1. Build the project detail dashboard.
2. Add secure byte-range streaming for the original file.
3. Display duration, resolution, frame rate, and file size.
4. Add not-found and corrupt/missing-file states.
5. Test HTTP range parsing and media response behavior.
6. Run all validation commands.

**Exit condition:** the source recording previews without loading the entire
file into browser memory and displays persisted metadata.

### Phase 4 — Manual clipping and clip library

1. Add timestamp parsing and clip-range validation on both sides.
2. Create clips with FFmpeg and record processing status.
3. Add byte-range clip preview and attachment download.
4. Show clip progress, duration, file size, and readable errors.
5. Add tests for valid/invalid timestamps and FFmpeg argument construction.
6. Run all validation commands.

**Exit condition:** valid time ranges produce previewable, downloadable local
MP4 clips and bad inputs never crash the app.

### Phase 5 — Content package placeholders and documentation

1. Add editable fields for all six requested content deliverables.
2. Persist drafts to SQLite.
3. Finish the README with exact macOS setup, FFmpeg installation, running,
   testing, data location, backup, and troubleshooting instructions.
4. Perform a final end-to-end smoke test with a generated sample MP4.
5. Run formatter, lint, type check, tests, and production build one final time.

**Exit condition:** a beginner can follow the README from installation to a
saved project, generated clip, preview, download, and saved content draft.

## Deferred deliberately

- Authentication and multi-user accounts
- Cloud uploads, deployment, billing, or paid services
- AI generation, transcription, voice cloning, or automated detection
- Overwolf telemetry and OBS synchronization
- OCR, computer vision, audio-peak detection, and highlight ranking
- Social publishing and third-party integrations
- Team approval, analytics, and customer-service workflows

These belong after the manual workflow and the business demand gates are
validated.

## Implementation status — completed July 22, 2026

- Phase 0: foundation, project rules, local configuration, and build tooling —
  complete
- Phase 1: SQLite schema, migrations, storage helpers, FFmpeg/FFprobe services,
  and validation — complete
- Phase 2: streamed MP4 upload and persistent projects dashboard — complete
- Phase 3: project workspace, metadata display, and HTTP byte-range source
  playback — complete
- Phase 4: timestamp validation, FFmpeg clipping, clip preview, download, and
  deletion — complete
- Phase 5: saved content package, beginner README, and end-to-end verification —
  complete

### Verified end-to-end path

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
