# Browser Creator Studio

[Open Creator Studio](https://r6-creator-studio-poojan.netlify.app/studio/) ·
[Original review companion](https://r6-creator-studio-poojan.netlify.app)

## Use it

1. Choose **New project**, confirm you may use the recording, and choose an MP4,
   MOV or WebM. This opens the file locally; it does not upload the video.
2. Optionally keep a copy in browser storage. Otherwise keep your original file
   ready to reselect next time. Notes and saved clips persist either way.
3. Play the source, type start/end timestamps (seconds or `hh:mm:ss.sss`), or use
   **Set** to capture the playhead. Name the range and press **Save clip**.
4. Select an audio track explicitly, or leave the export silent. Original playback
   starts muted and follows the browser's default track; the rendered preview uses
   the selected export track. Audio is not transcribed or analyzed by this page.
5. **Render preview** creates a smaller version; **Export video** renders the full
   browser output. Play the result and press **Download video**. MP4 uses H.264/AAC;
   WebM uses VP9/Opus. If the selected codecs are unavailable, try the other format
   or the local Studio. Missing audio is never silently omitted.
6. Paste timestamped notes/transcripts. Keyword search works immediately. Local AI
   downloads the existing pinned MiniLM model on first use and searches only the
   text you supplied. Matches retain source lines and full context, seek the video,
   and produce the existing rule-based review briefs. It is not video recognition.
7. Download a **Project backup** before clearing browser data or changing devices.
   Import the JSON on another browser and reselect the original recording. A backup
   contains filenames, notes and clips but never includes video.

## Architecture and privacy

The static build has two independent entry points: the preserved review companion
at `/`, and the new working editor at `/studio/`. Next.js, SQLite/Prisma and all
native media services remain the local application's stack. Netlify still serves
only the static assets and its existing public sample/health functions.

| Operation               | Web implementation                                                                               | Data location                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Ingestion / metadata    | Extension/MIME/size checks plus actual container/video parsing using Mediabunny 1.55.7           | File API; bounded BlobSource reads             |
| Playback / seeking      | Native video element with a revocable Blob URL                                                   | Original file on device                        |
| Clips                   | Validated timestamps, explicit audio selection; saved non-destructive ranges                     | IndexedDB                                      |
| Preview / export        | Separate worker; Mediabunny Conversion and WebCodecs; output metadata verified before completion | OPFS stream, or bounded output-buffer fallback |
| Notes / semantic search | Existing pinned MiniLM worker, exact source citations, keyword fallback                          | Browser; model download only                   |
| Projects                | Versioned schema, transactional saves, validated JSON backup/import                              | IndexedDB                                      |
| Optional retained video | Stream File into origin-private storage after quota check                                        | OPFS, never SQLite or server                   |

Source videos are not read into whole-file ArrayBuffers, base64 strings or React
state. React holds metadata and Blob URLs; the source File is held as a reference.
The relink identity check hashes only the first/last 64 KiB plus file size and
compares metadata. It prevents ordinary accidental relinks; it is **not** a
cryptographic checksum of the entire recording.

Export always transcodes the selected range for arbitrary start timestamps, using
30 fps and an explicit target bitrate (6 Mbps final, 1 Mbps preview, 128 kbps audio).
Only the selected video/audio tracks are accepted; unrelated tracks are discarded
explicitly. Container tags are cleared. Original recordings stay unchanged.
Output is validated for duration, video dimensions, and selected audio presence.
Codec/frame boundaries mean a small timing tolerance (up to 0.25 s) is allowed.
Export cancellation terminates the worker, clears the pending result and removes
its temporary output. Reload cleans up the previous export for that tab. Abrupt
browser/process termination can leave origin-private temporary files until browser
site data is cleared; there is no claim of crash-proof persistent export history.

No source media, audio, filenames, notes, queries or results are sent to Netlify,
Hugging Face, an analytics service or a paid AI API. Hugging Face receives ordinary
requests for the fixed model files, not text inference input. No new paid API,
cloud database, account system or paid hosting add-on has been enabled.

## Limits and support

These are application guardrails, not performance guarantees:

| Item                    | Browser limit                                                           |
| ----------------------- | ----------------------------------------------------------------------- |
| Source                  | MP4/MOV/WebM, up to 4 GiB, 6 hours, 8192 px per dimension               |
| Retained source copy    | Up to 1 GiB and sufficient origin storage quota                         |
| Clip                    | 0.1 seconds to 5 minutes, within the source duration                    |
| Final resolution        | Original aspect ratio, longest side up to 1920 px, no upscaling, 30 fps |
| Preview resolution      | Longest side up to 640 px, 30 fps                                       |
| Export output / runtime | 256 MiB / 10 minutes; keep tab open                                     |
| Saved project           | Up to 100 clips; notes up to 8,000 characters                           |
| Search                  | Existing maximum of 32 bounded source chunks and a 200-character query  |

Current desktop Chrome was tested. WebCodecs encoding varies by browser, OS and
codec; especially AAC encoding is not universal. WebM or silent export may help
when MP4/audio encoding is unavailable. Phones have less memory and can suspend
background tabs. A 390 px responsive layout was checked, but physical iPhone Safari,
Firefox and large 4 GiB / 6-hour sources have not been end-to-end benchmarked.

Use one editing tab per project to avoid last-writer-wins edits. Projects belong to
this browser profile and website origin, so preview URLs and the production domain
have separate storage. Private mode, quota pressure, manual clearing and browser
eviction can remove data. OPFS is optional; unsupported/limited storage falls back
to reselecting the source. Export output falls back to a bounded in-memory buffer
when OPFS cannot be opened, which increases memory use. Keep your original media
and downloaded backups. Downloads are not saved as permanent project assets.

### Why the heavy local tools remain local

The full local U1–U8 system also has multitrack timelines, caption/narration mixing,
long-form renders, Whisper transcription, `.rec` parsing and Coaching Lab. Those
native FFmpeg/FFprobe/Whisper processes and durable SQLite jobs cannot simply be
placed inside a static Netlify deployment. These features remain preserved in the
local Studio and are clearly disclosed in the browser page.

Netlify's published defaults include 60-second synchronous execution, 15-minute
background execution, 6 MB buffered request/response payloads (roughly 4.5 MB for
binary requests), 20 MB streamed responses and a 256 KB background payload. These
constraints make direct gameplay uploads and native long-running media jobs a poor
fit for Functions. Existing plan bandwidth/build quotas still apply to site assets;
video ingestion/export consumes the visitor's device resources instead.
See [Netlify function configuration](https://docs.netlify.com/build/functions/configuration/).

Generic FFmpeg WASM was considered but not added: its documented input ceiling is
2 GB and its FAQ reports lower performance than native FFmpeg. A naive WASM port
would also duplicate entire source videos in memory. The chosen range-reading
WebCodecs path avoids that copy and heavy WASM runtime.
See [FFmpeg WASM FAQ](https://ffmpegwasm.netlify.app/docs/faq/),
[Mediabunny file reading](https://mediabunny.dev/guide/reading-media-files),
[conversion](https://mediabunny.dev/guide/converting-media-files), and
[streamed output](https://mediabunny.dev/guide/writing-media-files).

To offer all native features remotely later would require a separately hosted
authenticated service, private object storage with direct multipart uploads,
durable job queues and database, isolated FFmpeg/Whisper workers, cancellation and
restart reconciliation, signed range downloads, quotas and explicit retention.
The existing loopback app should not be exposed publicly as that service. No such
paid infrastructure or privacy-changing upload path is provisioned by this release.

## Run and verify

Install Node.js 22+ and Git, then:

```sh
git clone https://github.com/Poojan-Desai/r6-creator-ai.git
cd r6-creator-ai
npm ci
npm run browser:build
npm run browser:dev
```

Open `http://127.0.0.1:4176/studio/`. The review companion is at `/`. Ctrl+C stops
the server; run `npm run browser:dev` again to reopen. No `.env`, database, API key
or FFmpeg installation is required by the browser app itself. Editing source files
requires rebuilding and refreshing; this static preview does not use hot reload.
Existing full local Studio setup instructions remain in the main README.

```sh
npm run db:generate
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run browser:build
# Keep browser:dev running; installed Google Chrome is required for this test.
npm run browser:verify -- /absolute/path/to/your-owned-recording.mp4
```

Choose an owned H.264/AAC MP4 at least 8 seconds long for browser verification.
The script uses an isolated Chrome profile, selects the file locally, and checks
the real render/download plus metadata with FFprobe. Artifacts go to ignored
`work/browser-verification/`, including private screenshots/video/backup. Never
commit these artifacts. Optional test settings: `R6_BROWSER_TEST_URL` selects the
base URL, and `R6_BROWSER_TEST_OUTPUT` selects the artifact folder. They do not
affect application behavior. Existing CI covers the new unit/storage tests and
both builds; real-video browser verification remains an explicit local check.

## Deploy or roll back

`netlify.toml` retains `npm run browser:build` and `public/ai-lab` as the only static
publish directory. Do not publish the repository root or local data directories.

```sh
# Once authenticated with Netlify CLI:
npm run browser:build
netlify deploy --no-build --site r6-creator-studio-poojan \
  --dir public/ai-lab --functions netlify/functions
# Test the draft URL, then publish the same validated build:
netlify deploy --prod --no-build --site r6-creator-studio-poojan \
  --dir public/ai-lab --functions netlify/functions
```

Netlify applies the existing CSP, no-referrer policy, MIME-sniffing protection and
camera/microphone restrictions. Same-origin workers and Blob media are permitted;
only model asset hosts are allowed for external connections. No cross-origin
isolation headers or SharedArrayBuffer media runtime are required.

If credentials are unavailable, run `netlify login` or configure a deployment
token securely; never commit it. Restore a previous published deploy in Netlify's
Deploys dashboard for an immediate site rollback. Existing production project data
is client-side and is not rewritten by a static deploy.

## September 7, 2026 verification

- 329 Vitest tests across 75 files pass, including 21 new validation/persistence tests.
- Formatting, ESLint, strict TypeScript, native Next.js production build, static
  browser build and dependency audit pass.
- Real private 12.267-second 1080 × 1920 gameplay source tested in Chrome
  152.0.7977.82 and visually reviewed in the in-app Chromium browser.
- Exact requested interval: 1.250–7.750 seconds. MP4 output: H.264 at 1080 × 1920,
  30 fps, AAC audio, 4,356,904 bytes; container duration 6.570667 seconds (video
  timeline 6.5 seconds, with audio encoder padding). Browser playback has no error.
- WebM preview: VP9 at 360 × 640, 30 fps, Opus audio, 822,712 bytes,
  6.52-second container duration.
- 14 automated real-browser checks cover ownership, fake MP4 bytes, metadata,
  invalid ranges, search, actual downloaded video, backups, reload, OPFS source
  reopen, cancellation, WebM preview, wrong-source rejection/relink, 390 px layout,
  no private uploads/runtime exceptions, and preserved companion navigation.
- The same 14 checks passed on the Netlify draft and the published production
  site. Both downloaded formats also passed a complete native FFmpeg decode check.
  The existing MiniLM worker was exercised in the new editor and returned exact
  source notes without browser console warnings or errors.
- Production was published on September 7, 2026. No deployment credentials were
  missing, and no plan upgrade or paid API activation was needed.
- These sample results do not establish large-file throughput, gameplay recognition
  accuracy, or complete feature parity with the local editor.
