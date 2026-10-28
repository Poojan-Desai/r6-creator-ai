# R6 Creator AI

A local-first video editing and evidence-review workspace built with TypeScript,
Next.js, SQLite/Prisma and FFmpeg. A separate browser studio uses WebCodecs and
IndexedDB to trim and export video without uploading recordings.

[Browser demo](https://r6-creator-studio-poojan.netlify.app/studio/) ·
[Architecture and browser limits](docs/WEB-STUDIO.md) ·
[Full local guide](docs/DETAILED_GUIDE.md)

The hosted demo may lag this repository. Run the current source locally to use
the October timeline and packaged synthetic sample.

## Engineering highlights

- Streamed, validated MP4 ingestion with bounded multipart fields, request-abort
  handling, exclusive private temporary files and ownership-safe failure cleanup.
- SQLite metadata and persisted media jobs with cancellation, restart recovery
  and guarded terminal transitions that prevent a late cancellation or probe
  result from overwriting completed or cancelled export state.
- Browser playback, keyboard/drag timeline trimming, zoom, saved clip ranges,
  portable JSON backups, optional local recording storage and MP4/WebM export.
- A checksummed original CC0 sample makes the editing workflow reproducible
  without private gameplay. Its animation is explicitly separate from R6 evidence.
- On-device MiniLM search retrieves exact supplied notes; the local application
  also provides transcription, reviewable writing and evidence-linked editing tools.

See [ingestion and export hardening](docs/HARDENING-2026-10.md) for failure cases,
regression coverage and remaining concurrency limits.

## Run the browser studio

Requirements: Node.js 20.9+ and a browser with compatible WebCodecs support.

```sh
git clone https://github.com/Poojan-Desai/r6-creator-ai.git
cd r6-creator-ai
npm ci
npm run browser:build
npm run browser:dev
```

Open [http://127.0.0.1:4176/studio/](http://127.0.0.1:4176/studio/), then choose
**Load sample project** or confirm permission to open your own recording.
Browser sources are limited to 4 GB / 6 hours; individual exports to 5 minutes /
256 MB, at up to 1920 pixels on the longest side and 30 fps. Encoding support
varies by browser. Keep the original recording and download a project backup;
browser storage can be cleared by the browser.

## Run the full local application

From the same checkout:

```sh
cp .env.example .env
npm run db:setup
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The bundled FFmpeg/FFprobe
executables support the documented macOS workflow; explicit paths can be set in
`.env`. Runtime recordings, generated clips and SQLite data live below `./data`
and are ignored by Git. Local transcription and replay experiments have separate
optional setup commands in the [full guide](docs/DETAILED_GUIDE.md).

Press **Ctrl+C** in the terminal to stop either server. To reopen it, return to the
checkout and run `npm run browser:dev` or `npm run dev` again. If a port is busy,
stop the older preview or set `R6_BROWSER_PORT=4196 npm run browser:dev`. If Prisma
reports a missing client/database, rerun `npm run db:setup`. Unsupported codec
errors require a compatible browser or the full local FFmpeg workflow.

## Verification

Fresh local verification on October 28, 2026 passed:

- **367 automated tests across 80 files**, including real synthetic MP4 ingestion,
  native clipping, upload interruption/cleanup and export-cancellation regressions.
- **14 browser studio checks and 12 timeline/sample checks**, including actual
  MP4/WebM rendering, playback, persistence, cancellation and narrow-screen layouts.
- Formatting, ESLint, strict TypeScript, Next.js production build and browser build.
- Dependency audit: zero known npm findings at verification time.

```sh
npm run db:generate
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run browser:build
# With browser:dev running and Google Chrome installed:
npm run browser:verify-timeline
npm run browser:verify -- "$PWD/browser-lab/studio/sample/clip.mp4"
```

[Current verification details](docs/VERIFICATION-2026-10-28.md) record the scope.
[GitHub Actions](https://github.com/Poojan-Desai/r6-creator-ai/actions) runs the
source checks and builds. Local test results do not establish production load
capacity or gameplay-recognition accuracy.

## Boundaries

Gameplay-event detection, replay compatibility and automated editing remain
experimental; no representative event-accuracy benchmark is claimed. Notes search
does not recognize gameplay or invent match facts. Native transcription, replay
parsing and advanced local timelines are separate from browser studio capabilities.

Media stays local. Optional cloud writing is disabled until a server key, positive
budget and explicit per-request consent are provided; it sends bounded text only.
No paid provider call is part of this verification. The application is designed
for a single user's loopback machine, with no production multi-user identity or
cloud job scheduler. Use recordings you own or have permission to process.

This independent student project is not affiliated with Ubisoft. See
[BENCHMARK.md](BENCHMARK.md) and the [release-readiness ledger](docs/U8_RELEASE_READINESS.md)
for evidence and research limits.
