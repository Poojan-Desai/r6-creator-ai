# AGENTS.md — R6 Creator AI Project Rules

These rules apply to every contributor and automated coding agent working in
this repository.

## Product scope

- Build the local-first R6 Creator AI MVP described in `PLAN.md`.
- Treat the ClutchScript service plan as strategic context, not permission to
  add accounts, billing, cloud infrastructure, or automatic highlight
  detection to this milestone.
- Phase 2 permits local `whisper.cpp` transcription and deterministic local
  writing suggestions. Do not add paid APIs, hosted inference, voice cloning,
  or highlight-detection models.

## Required stack

- Next.js App Router and TypeScript
- Tailwind CSS
- SQLite with Prisma
- FFmpeg and FFprobe as local executables
- Homebrew `whisper.cpp` with a local GGML model for speech-to-text
- Vitest for unit/service tests
- npm and the checked-in `package-lock.json`

Do not replace these choices without an explicit product decision.

## Working method

- Read `PLAN.md` before changing the application.
- Work in the listed phases and keep changes small enough to validate.
- Inspect existing files before editing and preserve unrelated user changes.
- Update `PLAN.md` if a verified technical constraint changes the plan.
- Add dependencies only when they are necessary for an active requirement.
- Never say a feature works without running the relevant automated checks and,
  for video workflows, an end-to-end test with a real MP4.

## Mandatory validation

After each implementation phase, run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Fix failures before continuing. If a check cannot run because a local system
dependency is missing, document the exact limitation and test every unaffected
layer. Do not silently skip checks.

## TypeScript and application conventions

- Keep TypeScript strict; do not use `any` to bypass errors.
- Prefer server components. Use client components only for interactive browser
  behavior such as upload progress, video controls, and forms.
- Keep route handlers thin; put reusable validation, database, storage, and
  video-processing logic in focused modules under `src/lib`.
- Keep content generation behind `ContentSuggestionProvider`; components and
  routes must not depend directly on an OpenAI or template implementation.
- Validate every untrusted request at the server boundary.
- Return a consistent JSON error shape with a plain-language message.
- Use UTC ISO timestamps in APIs and format them for display in the UI.
- Keep UI copy understandable to someone who has never programmed.

## Video and file-safety rules

- Never load an entire uploaded video into a browser `ArrayBuffer`, base64
  string, React state, SQLite, or application memory.
- Stream uploads to a temporary server-owned file, validate them, then rename.
- Stream previews/downloads from disk and support HTTP byte-range requests.
- Never construct filesystem paths from raw filenames or route values.
- Use generated IDs, resolve paths below the configured data root, and verify
  path containment.
- Run FFmpeg and FFprobe directly with argument arrays, never through a shell.
- Run `whisper-cli` directly with argument arrays, never through a shell.
- Validate extension, MIME type, maximum size, real video stream, and duration.
- Validate that `0 <= start < end <= source duration` before invoking FFmpeg.
- Clean up partial files on upload or clip failures.
- Extract only the explicitly selected audio stream to a temporary 16 kHz mono
  WAV, and remove all temporary transcription artifacts afterward.
- Store only relative paths in SQLite so the project folder can move.

## Local data and privacy

- Treat recordings and audio as private customer data.
- Keep runtime data below `R6_DATA_DIR` (default: `./data`) and out of Git.
- Do not send gameplay, audio, filenames, metadata, or drafts to external
  services.
- Do not use uploaded content for training or analytics.
- Prefer a clearly labeled creator microphone. Do not preselect an ambiguous
  multi-track source, and never transcribe teammate/voice-chat audio by default.
- Do not create speaker identities, voiceprints, or voice clones.

## Background transcription jobs

- A start route must return promptly; never wait for FFmpeg or Whisper inside
  the request before responding.
- Persist queued, extracting, transcribing, saving, completed, cancelled, and
  error transitions with readable progress and errors.
- Keep direct child-process references only in server memory so cancellation can
  send `SIGTERM` and then a bounded `SIGKILL` fallback.
- Reconcile interrupted jobs after an application restart; never leave a stale
  job looking active.
- Never save a partial transcript after cancellation or process failure.

## Database rules

- Schema changes require a checked-in Prisma migration.
- Keep MP4 data on disk; SQLite stores metadata and owned relative paths only.
- Use transactions when one user action changes related records.
- Preserve projects, transcript edits, content drafts, and completed job history
  across application restarts.

## UX and accessibility

- Maintain the clean dark gaming style without sacrificing readability.
- All form fields need visible labels and actionable validation messages.
- All controls must work by keyboard and show visible focus states.
- Do not rely on color alone to convey success, warning, or failure.
- Include loading, empty, success, and error states for asynchronous actions.
- Respect reduced-motion preferences.

## Documentation

- Keep `README.md` suitable for a complete beginner.
- Include exact installation and run commands, the local URL, data locations,
  how to stop the app, how to reopen it, and common error fixes.
- Keep `.env.example` synchronized with every supported environment variable.
- Record known limitations honestly.
