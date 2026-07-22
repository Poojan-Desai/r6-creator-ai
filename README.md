# R6 Creator AI

R6 Creator AI is a private web app that runs on your own Mac. It turns an MP4
gameplay recording into a saved project where you can inspect the video, cut
clips, transcribe one chosen audio track, edit and search the timestamped
transcript, and create a complete writing package from a clip.
Phase 3A adds a permission-gated Reference Library and structured Creator Style
Profiles. Phase 3B.1 adds manual benchmark labels and the safe background-job
foundation needed before automatic detection is introduced.

You do not need to know how to code to use it. There is no login, subscription,
cloud upload, paid AI key, or separate FFmpeg setup. Speech recognition uses the
free `whisper.cpp` program and a local model on this Mac.

## What works now (Phase 1 through Phase 3B.1)

- Streamed MP4 uploads with progress, type checks, and a 20 GB default limit
- Saved local projects that remain after the app is closed
- Duration, resolution, frame rate, file size, and audio-track inspection
- Large-file playback using HTTP byte-range streaming
- Manual clips using seconds, `MM:SS`, or `HH:MM:SS`
- Local FFmpeg processing, clip preview, download, and deletion
- Free local speech-to-text using the lightweight English Whisper base model
- One-track, multi-track, and silent-video handling
- Conservative creator-microphone recommendation; ambiguous tracks are not
  selected automatically
- Background transcription progress and a working cancel button
- Timestamp buttons that play the source video from that transcript line
- Transcript search and editable lines saved in SQLite
- Local writing suggestions in Funny, High energy, Storytelling, Educational,
  Serious, and Natural tones
- Opening hook, full voiceover, YouTube title, short caption, thumbnail text,
  and editing instructions that you can review and save
- Readable errors instead of server crashes
- Streamed local reference-video uploads with required ownership/permission
  confirmation
- Legal YouTube reference-only links with strict URL normalization and the
  official embedded player—never video/caption downloading or scraping
- Optional official YouTube Data API metadata with a server-only key and a
  complete manual metadata fallback
- Cancellable local reference transcription and FFmpeg style measurements with
  persisted progress and restart-safe status
- Twenty-nine structured style characteristics, each with a source, confidence,
  evidence explanation, and manual correction control
- Named multi-reference Creator Style Profiles with adjustable high-level
  timing, pacing, energy, structure, wording, and perspective preferences
- Manual start/peak/end benchmark labels for all planned R6, reaction, screen,
  and negative-example categories
- Keyboard shortcuts, range replay, quarter-second boundary nudges, category
  correction, confidence, notes, approval, and deletion for labels
- Versioned label JSON export/import with a streamed SHA-256 video fingerprint
  and no filename or personal computer path
- Version-pinned local detector definitions and persisted analysis jobs with
  progress, cancellation, retry, deletion, isolated errors, restart recovery,
  and temporary-file cleanup

Automatic Rainbow Six moment detection is not implemented yet. Phase 3B.1's
framework check intentionally returns zero detector events and zero candidate
moments. General video, audio, and transcript signals begin in Phase 3B.2. The
app does not claim it can predict virality or guarantee views.

## First-time setup

The app is in this folder:

```text
/Users/poojandesai/Documents/Codex/2026-07-21/i
```

### 1. Open Terminal

On your Mac, press `Command + Space`, type `Terminal`, and press Return.

### 2. Go to the app folder

Copy this entire command, paste it into Terminal, and press Return:

```bash
cd "/Users/poojandesai/Documents/Codex/2026-07-21/i"
```

### 3. Install the app’s free local packages

Copy and run:

```bash
npm_config_cache="$PWD/work/npm-cache" npm install --no-audit --no-fund
```

This can take a few minutes. Its npm cache stays inside the project to avoid a
common Mac permissions problem.

### 4. Prepare or update the local database

Copy and run:

```bash
npm run db:setup
```

This safely applies checked-in database migrations. It does not delete Phase 1
projects or clips.

### 5. Prepare free local transcription

Copy and run:

```bash
npm run transcription:setup
```

The setup checks for `whisper.cpp`, installs it with Homebrew if needed, then
downloads and verifies the free English `base.en` model (about 142 MB). Running
the command again is safe; it reuses a valid existing model.

If Terminal says Homebrew is missing, install it from
[brew.sh](https://brew.sh/), then run `npm run transcription:setup` again. No
OpenAI account or API key is used.

### 6. Start R6 Creator AI

Copy and run:

```bash
npm run dev
```

Wait until Terminal says the app is ready, then open:

[http://localhost:3000](http://localhost:3000)

Keep the Terminal window open while using the app.

## Using the app

### Upload a recording

1. On the home dashboard, drag an MP4 onto the upload area or click it.
2. Check or change the project name.
3. Click **Create local project**.
4. Keep the page open while the file uploads and its video/audio information is
   read.

Only MP4 files are accepted. The app copies the recording into its private local
data folder and never changes your original file.

### Choose audio and create a transcript

1. Open a saved project and scroll to **Find the words behind the play**.
2. Open **Audio track to transcribe**.
3. If a track is clearly named Creator Microphone, Mic, Commentary, or similar,
   the app marks it recommended. A one-track recording is selected normally.
4. If multiple tracks have unclear names, the app selects nothing. Preview the
   recording and choose deliberately. Avoid teammate or voice-chat audio unless
   everyone has consented to transcription.
5. Click **Start local transcription**.

The page stays usable while FFmpeg extracts only that track and Whisper works in
the background. A progress bar shows the current stage. Click **Cancel
transcription** at any time; partial text is not saved.

A video with no audio displays an explanation and keeps all clipping features
available. A track with music, game sounds, or silence may finish with “No
recognizable speech found”; try another track when available.

### Use, search, and edit the transcript

- Click a green timestamp to move the source video to that line and play it.
- Type in **Search transcript** to filter visible lines instantly.
- Edit any line in its text box, then click that line’s **Save** button.
- Saved edits remain after you stop and restart the app.

Whisper output should always be reviewed before publishing, especially names,
game terminology, and noisy speech.

### Create a clip

1. Play the source recording.
2. Pause where the clip should begin and click **Use player** beside Start time.
3. Pause where it should end and click **Use player** beside End time.
4. Optionally give the clip a name.
5. Click **Create clip**.
6. Preview it, use the download icon to save a copy, or delete it.

Typed time examples:

- `15` means 15 seconds.
- `01:30` means 1 minute 30 seconds.
- `1:02:03.5` means 1 hour, 2 minutes, and 3.5 seconds.

The end must be later than the start and inside the recording.

### Generate local writing suggestions

1. Finish a transcript and create a clip whose time range overlaps spoken text.
2. In the clip library, choose a tone.
3. Click **Write** on that clip.
4. Review the six generated suggestions.
5. Click **Use in content package** to copy them into the writing fields below.
6. Edit anything you want, then click **Save package**.

The first provider is a deterministic local template system. Its code uses a
provider interface so a future OpenAI provider can be added without replacing
the clip UI or content package. No paid API is connected now.

## Use the Reference Library

Open **References** in the top navigation.

### Add and analyze a permitted local reference

1. Click **Choose one MP4**.
2. Enter its title, creator/channel, game, platform, source type, and content
   category.
3. Optionally enter its source URL, notes, and visible thumbnail text.
4. Check **I own this file or have permission to upload and analyze it.**
5. Click **Save permitted reference**.
6. Open the saved reference and choose the creator microphone track when audio
   tracks are separate.
7. Click **Run local analysis**. The page stays usable and **Cancel analysis**
   stops the active local process without saving a partial transcript.
8. Review the local transcript and the measured, estimated, or unavailable
   feature cards. Use the pencil button to correct any feature.

The permission checkbox is required. The app streams the file into
`data/references/<reference-id>/source.mp4` and never changes the original file
elsewhere on the Mac. It transcribes only the selected track; teammate audio is
never selected by default when tracks are separate.

Measured does not mean perfect. Scene changes, hook boundaries, meaningful
action, reaction timing, emotion, humor, story, and live-versus-voiceover balance
can be estimates. Caption fields are explicitly unavailable until a later
calibrated OCR stage unless you enter them manually.

### Add a YouTube reference link

1. Paste a normal YouTube video, Shorts, share, live, or embed URL.
2. When no YouTube Data API key is configured, enter the title and channel name
   manually.
3. Click **Save YouTube reference**.

The detail page uses the official privacy-enhanced embedded player. The app does
not download the video, audio, captions, browser cookies, or unofficial
transcript data. URL-only mode cannot run full visual, audio, transcript, or
editing-style analysis. Upload a permitted local MP4 for that.

### Create a Creator Style Profile

1. Complete analysis for at least one permitted local reference. Two or more
   give more useful averages.
2. Open **Style profiles** in the top navigation.
3. Name the profile, select contributing references, and click **Create style
   profile**.
4. Open it to adjust every preference and inspect the reasons behind it.
5. You can change the contributing references and save again.

Profiles store high-level characteristics only. They never mine another
creator's transcript for scripts, jokes, titles, catchphrases, or preferred
phrases. **My own preferred phrases** contains only text you enter yourself.

## Create benchmark ground-truth labels

Open one of your uploaded gameplay projects and find **Label what actually
happened**.

1. Play or seek the source recording to the beginning of a range.
2. Click **Start label**, move to its main moment and click **Mark peak**, then
   move to its end and click **End label**.
3. Choose the closest category, add an optional note, and set your confidence.
4. Check **Approved as benchmark ground truth** only after you have reviewed the
   range, then click **Save manual label**.
5. Use **Replay**, the start/end `±0.25` buttons, the category menu, and the note
   field to correct a saved label.

Keyboard shortcuts are `Shift+S` for start, `Shift+P` for peak, `Shift+E` for
end, and `Shift+R` to replay the current range. Draft labels remain saved but do
not count as verified benchmark examples.

Use **Export JSON** to make a portable backup of the labels. The export contains
a SHA-256 fingerprint, measured duration/resolution, and timestamps in seconds;
it does not contain the MP4 name or a path on your Mac. **Choose JSON** imports a
matching export and atomically replaces that project's labels. A different
video, invalid timestamp, unknown category, or unsupported schema is rejected
without partially changing the database.

## Run the Phase 3B.1 framework check

In the same project, find **Analysis jobs, without false claims** and click
**Run framework check**. This verifies the selected project file, detector
version persistence, job progress, warnings, retry, deletion, restart recovery,
and cleanup. It does not analyze gameplay and cannot create candidate moments.
That deliberate limitation is shown beside the control and in every completed
job.

## Optional official YouTube metadata

The Reference Library works without a key. If you later obtain a YouTube Data
API key, ask Codex to add it as `YOUTUBE_DATA_API_KEY` in `.env`, then restart
the app. The key stays server-side and is not included in browser JavaScript.

## Stop and reopen the app

To stop the app, return to Terminal and press `Control + C` once.

To reopen it another day:

```bash
cd "/Users/poojandesai/Documents/Codex/2026-07-21/i"
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). Installation and model
setup do not need to run every time.

## Where private data is stored

Everything is below:

```text
/Users/poojandesai/Documents/Codex/2026-07-21/i/data
```

- `r6-creator.db` stores project, clip, audio-track, transcript, job, and writing
  metadata.
- `uploads/` stores the app’s local source recordings.
- `clips/` stores generated MP4 clips.
- `models/whisper/` stores the free local speech model.
- `transcription-temp/` is temporary working space and is cleaned after jobs.
- `references/` stores permitted local reference copies.
- `reference-analysis-temp/` holds temporary analysis files and is cleaned after
  completion, cancellation, or failure.
- `detector-analysis-temp/` is temporary detector-job space and is cleaned after
  completion, cancellation, failure, deletion, or restart recovery.
- `detector-artifacts/` is reserved for bounded detector evidence. The Phase
  3B.1 framework check retains no gameplay frames or OCR crops.

To back up everything, stop the app and copy the entire `data` folder. Restore
it as one unit; do not move individual recordings while their projects exist.

Deleting a project inside the app permanently removes that project’s local
source copy, clips, transcripts, and writing. It does not delete the original
recording you selected elsewhere on your Mac. The shared local Whisper model is
not deleted with a project.

Deleting a reference removes its app-owned copy, transcript, style analysis,
and profile membership. It does not delete the original file outside the app.
Deleting a style profile keeps its reference videos. A completed reference also
has a separate transcript-deletion control.

## Troubleshooting

### “Project storage is not ready”

Stop the app and run:

```bash
npm run db:setup
npm run dev
```

### “The local speech engine/model is not installed”

Stop the app and run:

```bash
npm run transcription:setup
npm run dev
```

### Transcription stops after the app restarts

An in-progress job cannot continue across a server restart. The app marks it as
interrupted instead of leaving a false progress bar. Click **Start local
transcription** again. Completed transcripts and edits are unaffected.

### The wrong audio was transcribed

Choose another track and click **Transcribe this track again**. OBS track names
such as “Creator Microphone” and “Game Audio” make selection much clearer. The
app does not automatically transcribe every track.

### A style analysis says “Interrupted” after restart

An active FFmpeg or Whisper process cannot resume through an app restart. The
database marks the job interrupted instead of showing false progress. Open the
reference and click **Run analysis again**. Completed transcripts, manual
feature corrections, and style profiles are unaffected.

### A detector framework job says “Interrupted” after restart

An active detector process cannot resume through an app restart. Phase 3B.1
marks the job and detector run as interrupted, removes partial events and
temporary files, and offers **Retry**. Completed jobs and manual benchmark
labels are unaffected.

### YouTube metadata is unavailable

The official embed and manual metadata fallback work with no API key. If a
configured key is invalid, over quota, or offline, enter the title and channel
manually. The app never falls back to scraping or downloading.

### “The video tools are unavailable”

Stop the app, reinstall its packages, and start again:

```bash
npm_config_cache="$PWD/work/npm-cache" npm install --no-audit --no-fund
npm run dev
```

FFmpeg and FFprobe are bundled through those packages.

### The MP4 uploads but does not play

Some MP4s contain a codec browsers cannot play. Export from OBS or an editor as
H.264 video with AAC audio. Created clips use browser-friendly H.264/AAC.

### The upload stops

- Keep Terminal and the browser tab open.
- Make sure the Mac has free space for the source, clips, model, and temporary
  WAV audio.
- Upload one file at a time.
- The default single-file limit is 20 GB.

### Port 3000 is already in use

Next.js may show another address such as `http://localhost:3001`. Open the exact
**Local** address shown in Terminal.

## Optional developer checks

These are not needed for normal use. They verify the release:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

The detailed implementation and verification record is in
[`PLAN.md`](./PLAN.md). Contributor safety rules are in
[`AGENTS.md`](./AGENTS.md).

## Deliberate limits through Phase 3B.1

- English local model only in the beginner setup
- No automatic R6 moment detection, telemetry, calibrated HUD OCR, or event
  accuracy claim yet
- No voice cloning, teammate identification, or speaker voiceprints
- No authentication, cloud storage, payments, social publishing, or team
  approvals
- No paid AI provider; content writing is template-based and must be reviewed

Phase 3B.1 verification passed on July 22, 2026: formatting, ESLint, strict
TypeScript, all 85 automated tests, a production build, migration from preserved
Phase 3A data, real-video labeling, path-free export/import, framework job,
interrupted-job recovery, retry, temporary-file cleanup, browser regression
checks, browser-console inspection, and a full app restart all passed. See
`PLAN.md` for the exact evidence and `BENCHMARK.md` for the intentionally empty
R6 detection-accuracy result.
