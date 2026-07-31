# R6 Creator AI

R6 Creator AI is a private web app that runs on your own Mac. It now has one
shared **Creator Studio + Coaching Lab** project workflow. A gameplay MP4 is the
primary visual source for original pixels, audio, transcription, playable
clips, editing, and visible coaching observations. A completed Rainbow Six
Siege Match Replay (`.rec` files or a replay ZIP) is optional structured
evidence. The app shows which replay fields were recovered, partial, empty, or
unsupported instead of pretending replay files contain gameplay video or
audio.
Phase 3A adds a permission-gated Reference Library and structured Creator Style
Profiles. Phase 3B.1 adds manual benchmark labels and a safe background-job
foundation. Phase 3B.2 adds local, explainable scene, motion, brightness,
black/static, audio-energy, silence, transcript-evidence, and broad reaction
signals. Phase 3B.2-M and 3B.2-O add versioned map and operator knowledge with
user-confirmed context. None of these features claims to understand a kill,
round outcome, room, or operator from general footage signals.

You do not need to know how to code to use it. There is no login, subscription,
cloud upload, paid AI key, or separate FFmpeg setup. Speech recognition uses the
free `whisper.cpp` program and a local model on this Mac.

## What works now

- A guided unified-project workflow for choosing the output goal, input mode,
  optional structural reference, focus areas, content instructions, and
  coaching goals
- Recording-only, Match-Replay-only, and combined recording-plus-replay
  projects without copying or changing their source records
- Optional additional recordings, permitted local/YouTube references, Creator
  Style Profiles, stable privacy-safe replay player selection, and an explicit
  audio-track selection
- Optional user-confirmed map, map version, bomb site, attack/defense,
  operator, operator version, and round-result context
- A shared project dashboard with Inputs, Synchronization, Transcript,
  Candidate moments, Story plan and script, Editor, Voiceover, Coaching, and
  Exports sections
- Honest stage boundaries: only project setup and input linking are complete in
  U1; later sections say planned, not configured, not connected, or unavailable
  instead of displaying fake results
- Streamed local Match Replay library and secure replay import
- Individual `.rec`, multiple round-file, folder, and one-ZIP selection
- Replay magic-byte, duplicate, archive-traversal, symbolic-link, entry-count,
  expanded-size, compression-ratio, and app-root path safety
- Required lawful-possession confirmation plus private player aliases by default
- A pinned MIT parser built from reviewed source without global installation
- Background parsing with progress, cancellation, timeout, retry, restart
  reconciliation, schema validation, and temporary-file cleanup
- App-owned canonical match, round, privacy-safe player, event, and evidence
  records persisted in SQLite
- An honest capability matrix separating verified, unverified, partial, empty,
  and unsupported fields
- Explicit deletion of an app-managed replay package and parsed output
- Real nine-round `Y11S2_Alpha04` replay verification with 10 aliased players,
  67 canonical events, per-round diagnostics, cancellation cleanup, and restart
  recovery

Existing Phase 1 through Phase 3B.2-O features remain available:

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
- Chunked compressed signal curves with transparent baselines, thresholds,
  confidence, configuration, and detector versions
- General local scene-change, action-intensity, brightness, black-interval,
  freeze/static, and broad visual-transition detectors
- Separate creator-microphone, game-audio, mixed, and unknown track roles with
  per-track peaks, sustained loudness, silence, low energy, clipping warnings,
  and overlap evidence
- Versioned editable transcript evidence rules with negation/ambiguity handling
  and broad reaction candidates that never diagnose emotion
- A synchronized Signal Explorer and honest broad-signal Benchmark Dashboard;
  tiny datasets say **Insufficient benchmark examples**
- A source-cited catalog of 28 currently documented R6 maps: 27 official map
  guides plus the separately sourced Dual Front-only District record
- Separate map existence, lifecycle, playlist availability, and historical
  layout versions so a rotation does not delete a map
- Manual blueprint ZIP/image import with archive safety checks, preserved
  originals, and optimized local previews—never automatic downloading
- A normalized floor editor with zoom/pan, room polygons, point/line/path
  annotations, alternate-callout provenance, confidence, tactical notes,
  bomb-site pairs, graph connections, citations, undo/redo, and autosave
- Local map/callout/room/site/tactical-note search and versioned JSON
  import/export with broken-reference and coordinate validation
- Manual project facts for map, map version, bomb site, side, starting room,
  important rooms, operator, and round result; writing may use them only after
  explicit confirmation
- A source-cited 77-operator Ubisoft directory snapshot with versioned operator
  and ability records, loadouts, official specialties, separate community/user
  roles, conditional interactions, and optional map/bomb-site links
- Operator search/filtering, contextual comparison, source inspection,
  user-created fact deletion, packaged update review, and versioned single or
  full-database JSON import/export
- Optional project operator/team/enemy/ability context; only explicitly
  confirmed facts may enter the writing-provider context

Automatic Rainbow Six moment detection is not implemented yet. Phase 3B.2
emits broad observable signals and broad reaction candidates, not candidate
moments or confirmed gameplay events. The app does not claim it can predict
virality or guarantee views.

The map catalog does not mean every map is fully annotated. “Map listed,”
“blueprint imported,” “rooms partially annotated,” “bomb sites entered,”
“connectivity entered,” “tactics entered,” and “fully verified” are separate
states. Visual map, floor, and room recognition are not implemented.

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

### 6. Prepare the local Match Replay parser

Copy and run:

```bash
npm run replay:setup
```

This checks out one exact MIT-licensed `r6-dissect` source commit, verifies the
license, applies one checked-in compatibility patch for a verified current
operator-roster gap, builds it inside `./data/tools/replay-parsers`, records the
source/patch/binary SHA-256 values, and removes the temporary source/build
cache. On an Apple Silicon Mac, the script downloads and verifies a
project-local Go toolchain only when a compatible `go` command is unavailable.
It does not modify your shell profile or install a global executable.

### 7. Start R6 Creator AI

Copy and run:

```bash
npm run dev
```

Wait until Terminal says the app is ready, then open:

[http://localhost:3000](http://localhost:3000)

Keep the Terminal window open while using the app.

## Using the app

### Create a unified Creator Studio / Coaching Lab project

1. Open [http://localhost:3000](http://localhost:3000).
2. Click **Create unified project**.
3. Under **What are you creating?**, enter a project name and choose:
   **Short clip**, **YouTube Short**, **TikTok**, **Long-form YouTube video**,
   **Match recap**, **Coaching report**, or **Both content and coaching**.
4. Under **What are you uploading?**, choose:
   **Screen recording only**, **Match Replay only**, or
   **Both — recommended**.
5. Choose the recording and/or replay already saved in the app. If you need a
   new source, use **Upload another recording** or
   **Import another Match Replay**, then return to project creation.
6. Optionally choose a Creator Style Profile, legal YouTube reference, or
   permitted local reference. References guide high-level structure and pacing;
   they do not authorize copying another creator's wording or protected work.
7. Select focus areas and write content instructions or coaching goals in plain
   language.
8. Optionally choose your privacy-safe replay player and the creator audio
   track. An ambiguous multi-track recording is never silently treated as the
   creator microphone.
9. Optionally enter map/operator context. Check the confirmation only when you
   personally supplied and verified those facts.
10. Click **Create unified project**. The dashboard saves everything locally
    and links back to the existing video, replay, and reference workspaces.

Creating the project does not start analysis, send data to a service, or alter
the source files. In combined mode, the dashboard says
**U2 · Not configured** until video/replay synchronization is actually built
and saved. Replay-only projects have no gameplay preview, audio, transcript, or
playable clip source because `.rec` files do not contain them.

### Import and inspect a Match Replay

1. Open **Match Replays** in the top navigation.
2. Click **Choose replay folder** for a completed replay folder, or **Choose
   files or ZIP** for individual `.rec` round files or one ZIP.
3. Give the package a readable name.
4. Keep **Private aliases** selected unless you deliberately want real player
   names preserved only on this Mac.
5. Confirm you created or lawfully possess the replay, then click **Import Match
   Replay**.
6. Review the receipt and press **Run local parser**.
7. Keep the page open or continue using the app. **Cancel** stops the local
   process and discards partial canonical output.
8. Inspect the capability matrix, privacy-safe roster, rounds, and direct
   match-feedback evidence.
9. If a round fails, expand **Round-by-round parser results** to see the safe
   error type, provider/version, whether replay reading began, exit/signal
   status, a suggested action, and sanitized technical details.

Import does not parse automatically and nothing is uploaded. The active
provider parsed one user-approved nine-round `Y11S2_Alpha04` package after a
reviewed roster compatibility patch. That is evidence for the exact verified
package/provider version, not a guarantee for every replay. Match Replay files
do not contain original gameplay pixels or audio. The provider also does not
expose validated positions, orientation, health, weapons, shots, gadgets,
destruction, or virtual POV; the UI shows those fields as unavailable.

### Add an optional gameplay recording

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

## Use Map Knowledge

Open **Map knowledge** in the top navigation.

### Browse and search

1. Filter map cards by the current known playlist or type a map/alias.
2. Click **Search annotations** to search rooms, callouts, bomb sites, hatches,
   cameras, rotations, routes, and tactical notes that have actually been added.
3. Open a map to see its official source, release/modernization information,
   current known playlist evidence, versions, and annotation status.

The current seed was verified from official Ubisoft sources on July 22, 2026
and is versioned as `r6-y11s2.2-2026-07-22`. Click **Prepare update review** to
make a local review record after a later season change. This does not fetch the
internet or overwrite saved knowledge automatically.

### Import a permitted blueprint and annotate a floor

1. Open the map and click **Add floor**. Give it a clear display name.
2. In **Blueprint assets**, click the official source link if Ubisoft lists a
   blueprint, then manually choose a ZIP/image you downloaded or may use.
3. Assign the import to a saved floor and click **Import locally**.
4. Select an element type, enter a name, and click **Begin shape**.
5. Click the blueprint to add normalized points, then click **Finish**.
6. Select the annotation to edit its canonical callout, alternate callouts,
   source label, confidence, caption/voiceover names, and tactical notes.
7. Add graph connections, bomb-site relationships, and source citations only
   when you have evidence or personal knowledge for them.

The editor autosaves after a short pause. **Undo** and **Redo** work during the
current browser session. Duplicate the current map version before a rework or a
large layout experiment. Official and historical versions cannot be deleted.

### Back up, delete, and restore local map knowledge

- **Export complete map** downloads `r6-map-knowledge/v1` JSON without any
  absolute Mac path.
- **Import matching JSON** validates the entire document before changing the
  matching map version. Future schemas, duplicate IDs, unsafe coordinates, and
  broken references are rejected.
- Imported blueprint assets have explicit download and delete controls. Delete
  removes the app-owned original and preview, not the file you selected
  elsewhere on the Mac.

### Confirm map facts for a project

Open a gameplay project and find **Manual map context**. Choose the map,
version, optional site/rooms, attack or defense, operator, and round result.
Check the confirmation box, then save. Future writing integration receives only
these confirmed local facts. Unknown values should remain unknown; the app does
not invent or visually detect them in this phase.

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

## Run local broad-signal analysis

In the same project, find **Local signal analysis**.

1. Review each audio-track role. Explicitly mark a separate mic as **Creator
   microphone** and game sound as **Game audio**; leave ambiguous tracks
   **Unknown**.
2. Enable only the measurements you need. Each detector explains its input,
   estimated work, settings, version, and limits.
3. Click **Run local signal analysis**. The request returns immediately and the
   page shows detector-level progress while local FFmpeg work continues.
4. Use **Cancel** to stop a job, or retry/delete an individual run without
   removing successful unrelated results.
5. Inspect completed curves and ranges in **Signal Explorer**. Clicking an
   event or transcript marker seeks the source video to that time.
6. Compare only eligible broad signals with approved manual labels. Confirm a
   complete category review only after watching the whole evaluation window.

Scene/motion/audio/transcript evidence cannot confirm a kill, death, round
result, menu type, operator, map, room, clutch, or defuser event. Those require
later calibrated detectors and evidence fusion.

## Use the Operator Knowledge library

Open **Operators** in the top navigation.

- Search saved names, abilities, weapons/gadgets, roles, interactions, maps,
  rooms, sites, or content ideas. A zero-result tactical query returns
  **Insufficient verified operator knowledge** instead of inventing an answer.
- Filter by attacker/defender, official specialty, tactical role, or squad.
- Select two to four records to compare structured facts without declaring an
  operator universally better.
- On a detail page, inspect source/version data and add personal aliases, roles,
  conditional interactions, content ideas, notes, or manually verified map
  links. Personal facts stay labeled and can be deleted safely.
- **Export JSON** backs up one operator. **Export all** backs up the catalog.
  Import validates schemas, confidence, stable IDs, references, and private
  paths; historical versions are not silently replaced.
- On a project, use **Operator context** only for facts you know, check the
  confirmation box, and save. The app does not recognize an operator, weapon,
  gadget, or ability from a recording.

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

- `r6-creator.db` stores project, replay, canonical evidence, clip, audio-track,
  transcript, job, and writing metadata.
- `replays/` stores app-owned `.rec` round files and an original source ZIP when
  one was imported.
- `replay-parser-outputs/` stores only privacy-sanitized provider JSON.
- `tools/replay-parsers/` stores the locally built parser and build manifest.
- `uploads/` stores the app’s local source recordings.
- `clips/` stores generated MP4 clips.
- `models/whisper/` stores the free local speech model.
- `transcription-temp/` is temporary working space and is cleaned after jobs.
- `references/` stores permitted local reference copies.
- `reference-analysis-temp/` holds temporary analysis files and is cleaned after
  completion, cancellation, or failure.
- `detector-analysis-temp/` is temporary detector-job space and is cleaned after
  completion, cancellation, failure, deletion, or restart recovery.
- `detector-artifacts/` is reserved for bounded detector evidence. Phase 3B.2
  keeps curves in SQLite chunks and retains no OCR crops.
- `map-knowledge/` stores imported blueprint originals and optimized local
  previews by map version. SQLite stores only their relative paths and hashes.
- `map-blueprint-temp/` is bounded temporary ZIP/image import space and is
  removed after success or failure.

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

### “The reviewed replay parser has not been built locally”

Stop the app and run:

```bash
npm run replay:setup
npm run dev
```

If setup cannot reach GitHub or the official Go download, check the Mac’s
internet connection and retry. Normal replay parsing is offline after setup.

### A replay says unsupported, partial, or empty

Rainbow Six replay formats change. “Empty” means the provider understands a
field but this replay did not populate it. “Unsupported” means the active
provider does not expose it. “Partial” or “unverified” means evidence exists but
the app will not present a stronger conclusion. One failed round no longer
discards other successful rounds. Expand the parser diagnostics for the safe
failure code, suggested next action, and sanitized stderr. Keep the original
replay and retry after a compatible provider update; missing movement is never
invented.

### Replay parsing stops after the app restarts

An operating-system child process cannot resume across a full app restart. The
app marks it interrupted, removes partial parser output, preserves the imported
round files, and offers **Retry local parse**.

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

An active detector process cannot resume through an app restart. The app marks
the job and active detector run as interrupted, removes partial events/curves
and temporary files, and offers **Retry**. Completed runs, manual labels, map
assets, and operator knowledge are unaffected.

### YouTube metadata is unavailable

The official embed and manual metadata fallback work with no API key. If a
configured key is invalid, over quota, or offline, enter the title and channel
manually. The app never falls back to scraping or downloading.

### A blueprint ZIP is rejected

Use the original ZIP from the official source or unzip it yourself and import
one PNG/JPG/WebP floor image. The app rejects archives with unsafe paths,
symbolic links, too many files, unexpectedly large expansion, or unsupported
image bytes. It does not bypass the safety check.

### A map or playlist looks outdated

The source verification date is visible on the map. Playlist rotations and map
layouts change. Prepare an update review and check the linked official Ubisoft
sources; saved versions are never silently rewritten. The current seed is a
July 22, 2026 snapshot, not a permanent claim.

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

## Deliberate current limits

- English local model only in the beginner setup
- No automatic R6 candidate-moment fusion, telemetry, calibrated HUD OCR,
  gameplay-event accuracy claim, or footage-review-savings claim yet
- No voice cloning, teammate identification, or speaker voiceprints
- No authentication, cloud storage, payments, social publishing, or team
  approvals
- No paid AI provider; content writing is template-based and must be reviewed
- No visual map, floor, room, operator, bomb-site, or route recognition
- No claim that all listed maps have complete blueprints, room geometry, bomb
  sites, graph connectivity, or verified tactics
- No automatic Ubisoft blueprint downloads or tactical-fact generation from a
  room name
- No operator, weapon, ability, icon, or gadget recognition and no automatic
  tactical outcome claim from a documented operator fact
- No claim that one successful current replay guarantees support for every
  current or future Siege replay
- No position/orientation, ten-player movement timeline, reconstructed player
  POV, replay-only tactical video, or replay-derived playable MP4 yet
- No original pixels or audio inside `.rec` Match Replay files
- No integration of the audited WNC parser because its checkout has no license
  file

Phase 3B.2-M verification passed on July 22, 2026. The official Oregon blueprint
ZIP imported through the bounded local route, preserved five originals, created
five previews, and left no temporary files. A partial Oregon version with rooms,
callouts, a bomb-site pair, a hatch, horizontal and vertical connections, and a
citation survived export/delete/import and a full restart. Confirmed project map
context also survived. Formatting, ESLint, strict TypeScript, the complete test
suite (99 tests across 17 files), production build, browser regressions, and
browser-console inspection passed. See `PLAN.md` for the exact evidence and
`BENCHMARK.md` for the still intentionally empty R6 detection-accuracy result.

Phase 3B.2 general-signal browser verification passed on July 23, 2026 for the
owned 20:38 gameplay recording, generated black/static/no-audio and two-track
creator/game fixtures, and the real Phase 2 speech/transcript project.
Cancellation, retry, changed settings, single-detector rerun, honest benchmark
calculation, restart persistence, and detector/map cleanup boundaries passed.
The current benchmark remains insufficient: the one approved menu label was
missed, 137 unmatched broad transitions remain unscored without a complete
false-positive review, and precision is **Not measured**.

Phase 3B.2-O browser verification confirmed the 77-operator list, explicit
11-record detailed-data boundary, search/filter/insufficient states,
comparison, conditional relationships, map/bomb-site links, safe deletion,
JSON export/import, and user-confirmed test-project context across restart. The
complete 77-record database export also passed a history-preserving import
round trip and contained no private absolute paths. Formatting, ESLint, strict
TypeScript, all 140 tests across 28 files, and the production build passed. The
application still does not recognize operators or abilities from footage.

`npm audit` reports no direct blueprint-parser advisory after updating `yauzl`
to 3.4.0. It still reports three transitive findings inside the pinned Next.js
toolchain (`postcss` and `sharp`); npm offers only a breaking forced downgrade,
so this release records rather than applies that unsafe suggestion.
