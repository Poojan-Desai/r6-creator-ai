# Real-recording engineering review

Evidence collected October 28 and November 2, 2026. This public summary excludes
private media, names, source paths, screenshots, transcripts and local databases.

## Two reproduced defects and fixes

1. **Large native imports were truncated before the stream parser.** Next Proxy's
   10 MiB request-body clone cap interrupted a 226 MB real-media HTTP reproduction
   and an original-file browser import. Exact ingestion route exclusions remove
   that clone; all affected handlers enforce the unchanged local Host/Origin/site
   guard first. Thirty-nine actual HTTP negative cases rejected requests before
   the sender transmitted body bytes. The identical bounded file then imported
   with matching stored bytes and SHA-256. See [streaming evidence](STREAMED_HTTP_INGESTION.md).
2. **The imported project's browser page loaded native server dependencies.**
   Runtime writing constants arrived through a barrel importing native media
   configuration. Browser components now import shared constants/types directly.
   A browser-target dependency-graph regression failed for the two runtime
   components before the fix and passes for all three reviewed components after it.

## Actual full-application workflow

The full local Next/FFmpeg application imported an owned 8.39 GB, approximately
38-minute, 1920×1080 nominal-60-fps recording. The saved source matched the
original SHA-256. Final size, modification time and SHA checks confirmed that
the original stayed unchanged.

The review used 52 overview stills covering the complete timeline, 39 denser
candidate stills, and selected in-app playback. This was timeline sampling,
not continuous viewing or an automatic highlight evaluation. A complete software
decode of video/audio reached 137,027 video frames and exited zero, with one
duplicate/non-monotonic DTS warning from the null muxer.

Through the application's Clip Station UI, the reviewer:

- Played early, middle, selected-action and near-end ranges without a media error.
- Rejected reversed, equal and beyond-source clip boundaries before creating a clip.
- Created, played and downloaded a 12-second H.264 1920×1080/60-fps clip containing
  720 video frames and AAC 48 kHz stereo audio. Its container duration was 12.034
  seconds; its video stream was 12 seconds. Full output decode completed without
  warnings, and the download matched the app-owned output SHA-256.
- Saved an accurate title and editing notes; source, completed clip and text
  survived page reload and a clean application restart.
- Received a clear transcript prerequisite when requesting writing without a
  transcript. The absent optional speech model was left unchanged.

The selected moment was identified by a person. It does not establish automatic
kill/clutch recognition. Audio stream integrity was checked; subjective sound
quality and exact perceptual A/V sync were not scored. No private footage is
included in this repository or the hosted demo.

## Checks and remaining limits

The two code fixes passed formatting, lint, TypeScript, **400 tests across 82
files** and a production build. Recorded browser-studio and timeline/sample
checks are separate evidence for the static application.

An initial bounded-memory trial exceeded its unchanged 128 MiB RSS-growth
threshold; two later warm trials passed. During the actual original import,
the sampled development-server RSS peak was about 1.15 GB, including compilation
and the page-crash activity. Neither observation is a total browser/system memory
measurement or a production load guarantee.

The tested export used the older native Clip Station renderer. Modern 30-fps
FIT/FILL timeline timing, late cancellation, interrupted active renders, multiple
workers, disk exhaustion and representative gameplay accuracy were not tested
in this review. Source-inferred lifecycle/ownership risks remain documented;
completed-work clean restart is not proof of crash recovery for active jobs.

## Hosted and local scope

The hosted browser studio uses WebCodecs and browser storage: source up to 4 GiB,
six hours; individual export up to five minutes/256 MiB at a maximum 30 fps.
The full local application has a configured 20 GiB per-file limit and native
media tools. Its successful 8.39 GB test is not a larger hosted-upload promise.
No mandatory footage upload or paid provider call is part of either verification.
