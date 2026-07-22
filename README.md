# R6 Creator AI

R6 Creator AI is a private web app that runs on your own Mac. It lets you upload
an MP4 Rainbow Six Siege recording, inspect its video information, create clips
with exact start and end times, preview and download those clips, and save the
writing that will go with your post.

You do not need to know how to code to use it. The first version does not need a
login, subscription, cloud account, paid API, or separate FFmpeg installation.

## What works in this version

- Streaming MP4 uploads with progress, file-type checks, and a 20 GB default
  limit
- Saved local projects that remain after the app is closed
- Duration, resolution, frame rate, and file-size inspection
- Large-file playback using byte-range streaming
- Manual clips using seconds, `MM:SS`, or `HH:MM:SS`
- Local FFmpeg video processing
- Preview, download, and deletion for clips
- Saved fields for:
  - opening hook
  - YouTube title
  - thumbnail text
  - voiceover script
  - short-form caption
  - editing instructions
- Readable error messages for unsupported, damaged, missing, or invalid files

## First-time setup

The app has already been built in this folder:

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

This can take a few minutes the first time. The command uses a cache inside the
project so it also avoids a common Mac npm permission problem.

### 4. Prepare the local database

Copy and run:

```bash
npm run db:setup
```

This creates or updates the private SQLite database. It does not delete saved
projects.

### 5. Start R6 Creator AI

Copy and run:

```bash
npm run dev
```

Wait until Terminal shows that the app is ready, then open this address in your
browser:

[http://localhost:3000](http://localhost:3000)

Keep the Terminal window open while using the app.

## Using the app

### Upload a recording

1. On the home dashboard, drag an MP4 onto the upload area or click it to choose
   a file.
2. Check or change the project name.
3. Click **Create local project**.
4. Keep the page open while the progress bar uploads the file and reads its
   video information.

Only MP4 files are accepted in this version. The app copies the recording into
its own private local data folder; it never modifies your original recording.

### Create a clip

1. Play the source recording in the project workspace.
2. Pause where the clip should begin and click **Use player** beside Start time.
3. Pause where it should end and click **Use player** beside End time.
4. Optionally give the clip a name.
5. Click **Create clip** and keep the page open while FFmpeg processes it.
6. Use the new clip player to preview it or click **Download** to save a copy
   through your browser.

You can also type times yourself:

- `15` means 15 seconds.
- `01:30` means 1 minute 30 seconds.
- `1:02:03.5` means 1 hour, 2 minutes, and 3.5 seconds.

The end time must be later than the start time and cannot go beyond the end of
the recording.

### Save the content package

Scroll to **Build the story around the clip**, type in any of the six writing
areas, and click **Save package**. Blank fields are allowed. The text reappears
when you reopen the project.

## Stop and reopen the app

To stop the app, return to the Terminal window and press `Control + C` once.

To reopen it another day:

```bash
cd "/Users/poojandesai/Documents/Codex/2026-07-21/i"
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). You do not need to run
the installation steps every time.

## Where your data is stored

All runtime data is below:

```text
/Users/poojandesai/Documents/Codex/2026-07-21/i/data
```

Inside it:

- `r6-creator.db` contains project, clip, and writing metadata.
- `uploads/` contains the app’s local copies of source recordings.
- `clips/` contains generated MP4 clips.

To back up everything, stop the app and copy the entire `data` folder to an
external drive or another safe folder. Restore all three parts together; do not
move individual MP4 files out of this directory while their projects still
exist in the app.

Deleting a project inside R6 Creator AI permanently removes that project’s local
source copy, generated clips, and saved writing. It does not delete the original
recording you selected from elsewhere on your Mac.

## Troubleshooting

### “Project storage is not ready”

Stop the app with `Control + C`, then run:

```bash
npm run db:setup
npm run dev
```

### “The video tools are unavailable”

Stop the app, reinstall its packages, and start it again:

```bash
npm_config_cache="$PWD/work/npm-cache" npm install --no-audit --no-fund
npm run dev
```

The required FFmpeg and FFprobe executables are bundled through those packages.

### The MP4 uploads but does not play

MP4 is a container, and some MP4s use a video codec that a browser cannot play.
Try exporting the recording from OBS or your editor as H.264 video with AAC
audio. The clipping step itself creates browser-friendly H.264/AAC MP4 files.

### The upload stops

- Keep the Terminal window and browser tab open.
- Make sure the Mac has enough free disk space for both the source recording and
  generated clips.
- Upload one file at a time.
- The default single-file limit is 20 GB.

### Port 3000 is already in use

Next.js may show a different address such as `http://localhost:3001`. Open the
exact **Local** address shown in Terminal.

## Optional developer checks

These checks are not needed for normal use. They are included so future work can
be verified before it is described as working:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

The full implementation plan is in [`PLAN.md`](./PLAN.md), and contributor rules
are in [`AGENTS.md`](./AGENTS.md).

## Deliberate limits of version 1

This version does not include automated highlight detection, transcription,
voice cloning, AI-written text, accounts, cloud storage, payments, social
publishing, Overwolf telemetry, or team workflows. Those features should be
considered only after the manual service workflow proves what customers value.
