# R6 Creator AI

## Try the free Browser Studio

[Open R6 Browser Studio](https://r6-creator-studio-poojan.netlify.app) · [Release verification](docs/RELEASE-2026-09.md)

The public website runs a real, pinned MiniLM semantic-search model on your device.
Paste timestamped gameplay notes, search by meaning, inspect the exact source and
complete context, optionally play a local recording, and download an editing brief.
The brief outline is rule-based. This small model does not recognize gameplay or
write invented match summaries. Initial model/runtime downloads need internet;
notes, queries, and video are not sent to the hosted backend. English works best.

The full video editor, replay parser, transcription, and MP4 export remain a
private Mac app. The website is a lightweight companion, not the full local editor.
Netlify serves static files and read-only public sample/health endpoints on the
existing free plan; no database, cloud inference, API key, or paid add-on is needed.
Free plan quotas still apply.

```sh
npm ci
npm run browser:build
npm run browser:dev
# Open http://127.0.0.1:4176. Ctrl+C stops the preview.
```

For local full-studio setup, continue below. Its navigation includes **Free AI search**
after `npm run browser:build`. Start/dev bind to `127.0.0.1`; foreign Host/Origin
requests are rejected. This app is not designed to be exposed as a public server.

Optional OpenAI writing remains disabled without your own server key and a positive
budget. No live paid OpenAI call was made for this release. Budget estimates now
include schema/Unicode overhead, SQLite serializes reservations, missing usage keeps
its reservation, and deleting a project preserves its charge ledger. Automatic paid
request retries are disabled. This application budget is not an account-wide billing
cap; verify provider prices and limits before enabling paid writing.

**Local AI-assisted gameplay media analysis platform — active development.**

R6 Creator AI is a local-first Next.js application for organizing owned
Rainbow Six Siege recordings, inspecting video metadata, creating timestamped
clips, and developing content packages without uploading gameplay to a cloud
service. It combines a TypeScript interface, SQLite persistence, streamed media,
and FFmpeg/FFprobe processing in one desktop-friendly web workspace.

Short-form writing also has an optional OpenAI Responses API provider. It is
off by default, requires a server key, a positive configured budget, and
per-request user consent, and sends bounded text evidence only—never source
video/audio, reference media, filenames, or local paths. The deterministic
local writer remains available with no key and is the transparent fallback.

> The dependable portfolio scope is the local media workflow: upload, metadata
> extraction, byte-range playback, manual timestamp clipping, clip preview and
> download, and persistent projects. Gameplay-event detection, automatic
> highlight selection, automatic editing, and Match Replay parsing are research
> prototypes. This repository does **not** claim that those features work
> reliably across recordings or game versions.

## Why this project

Long gameplay recordings are expensive to review and awkward to move between
tools. This project explores a privacy-conscious workflow where the original
media stays on the user's Mac and every generated result remains reviewable.
Experimental signals are kept separate from verified facts so an uncertain
detector result is not presented as a confirmed in-game event.

## Verified core workflow

- Stream MP4 uploads to disk with file, size, and video-stream validation.
- Extract duration, resolution, frame rate, file size, and audio-track metadata.
- Stream source videos and clips with HTTP byte-range support.
- Create clips from validated start/end timestamps using local FFmpeg.
- Preview, download, and delete generated clips.
- Save projects, metadata, clips, and writing fields in local SQLite storage.
- Return readable errors and clean up partial media after failed operations.
- Exercise service and media invariants with automated Vitest coverage.

The core workflow was also exercised during development with a real generated
MP4, including upload, probe, clip creation, streaming, download headers,
invalid-input rejection, persistence, and restart recovery.

## Active-development areas

The codebase contains additional labs for broad video/audio signals, transcripts,
manual benchmark labels, candidate review, non-destructive edit plans, local
voiceover, coaching evidence, map/operator context, and replay-provider
experiments. These modules are intentionally conservative:

- Broad scene, motion, brightness, audio, or transcript signals do not prove a
  kill, clutch, round result, room, or operator.
- Candidate scores help a person prioritize review; they do not predict views
  or guarantee that a moment is a useful highlight.
- A Match Replay adapter has been exercised against a limited fixture/package,
  but compatibility and recovered fields can vary by game/parser version.
- Export and editing paths require human review and are not described as a
  reliable automatic editor.
- No gameplay-event accuracy number is published because the repository does
  not yet contain a sufficiently representative labeled benchmark.

See [BENCHMARK.md](BENCHMARK.md) for the measurement contract and
[docs/DETAILED_GUIDE.md](docs/DETAILED_GUIDE.md) for the complete local guide
and implementation history. The final U8 audit is tracked in the
[release-readiness ledger](docs/U8_RELEASE_READINESS.md), which separates
public clean-clone checks from private retained-media verification.

## Architecture

```mermaid
flowchart LR
    UI["Next.js + TypeScript UI"] --> API["Validated route handlers"]
    API --> Services["Project, media, clip, and evidence services"]
    Services --> DB["SQLite + Prisma metadata"]
    Services --> Disk["App-owned local media files"]
    Services --> Media["FFmpeg + FFprobe"]
    Services -. optional .-> Speech["Local whisper.cpp"]
    Services -. experimental .-> Replay["Version-pinned replay adapter"]
```

Recordings and generated media live on disk; SQLite stores metadata and relative
paths. Long-running processes are invoked with argument arrays rather than a
shell, and uploaded filenames are never used as trusted filesystem paths.

## Stack

- Next.js, React, TypeScript, and Tailwind CSS
- SQLite and Prisma
- FFmpeg and FFprobe
- Vitest, ESLint, Prettier, and strict TypeScript
- Optional local `whisper.cpp` speech-to-text
- Optional OpenAI Responses API with strict Zod Structured Outputs

## Run locally

Requirements: Node.js 20.9 or newer and macOS for the documented local workflow.

```bash
git clone https://github.com/Poojan-Desai/r6-creator-ai.git
cd r6-creator-ai
npm ci
test -f .env || cp .env.example .env
npm run db:setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Runtime recordings,
generated clips, and SQLite files are stored in `./data` by default and are
excluded from Git. The setup command creates `.env` from the safe example when
needed so Prisma can read `DATABASE_URL`. Both `.env` and `.env.local` are
ignored by Git.

Optional local transcription and replay experiments have separate setup steps:

```bash
npm run transcription:setup
npm run replay:setup
```

Neither is required for upload, metadata, playback, or manual clipping.

Optional cloud writing is configured separately. Copy `.env.example` to
`.env.local`, set an API key and a deliberately small monthly budget, then
select **OpenAI cloud writer** and confirm the disclosure for an individual
generation. Keep the two pricing variables aligned with the selected model's
official current pricing; the defaults match `gpt-5.6-luna` as checked on
August 18, 2026. No live paid provider call is part of automated verification.

After adding the key locally, run the minimal low-output provider check before
using private project text:

```bash
npm run ai:smoke
```

Success prints the model, token counts, and `store=false`; it never prints the
key. Then test one short-form generation in the UI to exercise consent, budget
reservation, usage persistence, and the saved revision end to end.

## Validate

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs the same static checks, test suite, and production build. Media-specific
changes should additionally be tested end to end with a real MP4 before being
described as working.

Current verification: formatting, ESLint, strict TypeScript, all 279 tests
across 69 test files, and the Next.js production build pass.

## Privacy and product boundaries

- Local media is excluded from version control and is not used for training.
- Cloud writing is an explicit text-only action with preflight cost estimates,
  global and per-project limits, persisted usage metadata, cancellation,
  sanitized errors, and local fallback.
- No authentication, hosted multi-user service, billing, or social publishing
  is included.
- YouTube references use the official embed/metadata paths; the app does not
  download YouTube video or captions.
- The user must own or have permission to process imported media.
- This is an independent student project and is not affiliated with or endorsed
  by Ubisoft.
