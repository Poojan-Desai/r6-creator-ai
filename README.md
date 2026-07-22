# R6 Creator AI

R6 Creator AI is a private web app that runs on your own Mac. It turns an MP4
gameplay recording into a saved project where you can inspect the video, cut
clips, transcribe one chosen audio track, edit and search the timestamped
transcript, and create a complete writing package from a clip.

You do not need to know how to code to use it. There is no login, subscription,
cloud upload, paid AI key, or separate FFmpeg setup. Speech recognition uses the
free `whisper.cpp` program and a local model on this Mac.

## What works in Phase 2

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

Automatic Rainbow Six highlight detection is intentionally not part of this
phase.

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

To back up everything, stop the app and copy the entire `data` folder. Restore
it as one unit; do not move individual recordings while their projects exist.

Deleting a project inside the app permanently removes that project’s local
source copy, clips, transcripts, and writing. It does not delete the original
recording you selected elsewhere on your Mac. The shared local Whisper model is
not deleted with a project.

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

## Deliberate limits of Phase 2

- English local model only in the beginner setup
- No automatic R6 highlight detection, telemetry, OCR, or computer vision
- No voice cloning, teammate identification, or speaker voiceprints
- No authentication, cloud storage, payments, social publishing, or team
  approvals
- No paid AI provider; content writing is template-based and must be reviewed
