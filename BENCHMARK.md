# R6 Creator AI — Detection Benchmark

## Current verified status

**No Rainbow Six moment-detection benchmark results exist yet.** Phase 3B.1 now
provides manual ground-truth labeling, versioned path-free JSON interchange,
the additive benchmark schema, and a versioned detector-job framework. Its only
registered check validates local media integrity and intentionally emits no
events or candidate moments.

The application must not display or advertise “AI accurately detects R6
highlights.” No precision, recall, approval-rate, processing-cost, or accuracy
claim is supported until Phase 3B has processed a legally usable, manually
labeled evaluation set.

## Score definitions

- **Event confidence:** strength of repeated detector evidence for an event
  interpretation.
- **Content Potential Score:** transparent ranking of a reviewed moment's
  content-making characteristics. It is not a prediction of virality, views, or
  engagement.
- **Reference-style similarity:** separate structured comparisons for pacing,
  hook, energy, story, humor, education, length, and reaction.

These scores must remain separate in the database, API, UI, exports, and
benchmark reports.

## Legally usable evaluation set required for Phase 3B

The dataset will contain only footage created by the owner or used with explicit
permission. It must include, at minimum:

- Routine gameplay
- Kills and deaths
- Multi-kills
- Round wins and losses
- Loud and quiet reactions
- False audio peaks
- Scoreboards and menus
- Replays and spectator screens
- Edited clips and full unedited recordings

Every label includes a category, start/peak/end timestamp, optional description,
human confidence, creation/update dates, and benchmark-approval state. Clutches
and 1vX states remain possible unless player-count and round-state evidence
supports confirmation.

## Ground-truth labeling protocol (schema v1)

1. Label only a locally uploaded recording the user owns or may analyze.
2. Review the complete recording at normal speed, replay uncertain ranges, and
   label meaningful positive events plus representative negative/menu/loading
   sections. The labeler records start, peak, end, category, optional notes, and
   confidence from zero to one.
3. A label becomes benchmark ground truth only after the user explicitly marks
   it approved. Draft labels remain useful working notes but are excluded from
   verified calculations.
4. Avoid overlapping duplicate labels for the same event/category. Related
   categories may overlap—for example a round win and loud creator reaction—when
   they describe distinct observable facts.
5. Export uses `r6-creator-benchmark-labels/v1`, seconds as the timestamp unit,
   a streaming SHA-256 fingerprint of the MP4 bytes, measured duration and
   resolution, creation metadata, and labels. It contains no local path or
   original filename.
6. Import accepts only the supported schema, valid finite/clamped timestamps,
   known categories, and a matching fingerprint/duration/resolution. It is
   transactional: one invalid label rejects the whole file instead of saving a
   partial dataset.

Supported v1 categories are kill, death, multi-kill, round win, round loss,
match ending, possible clutch, defuser plant, defuser disable, high action, loud
creator reaction, funny conversation, rage/frustration, fail/mistake,
educational explanation, quiet/low-interest, menu, scoreboard, replay,
spectator screen, loading screen, other interesting, and other uninteresting.

## Versioned candidate-matching rule (planned for Phase 3B.5)

Matching rule ID: `temporal-category-v1`.

- Only approved ground-truth labels participate.
- A candidate and label must have the same normalized benchmark category or a
  documented compatible mapping. Alternative categories are not silently used.
- A pair qualifies when its temporal intersection-over-union is at least 0.30,
  or its peak timestamps are within 2.0 seconds while their ranges overlap.
- Each candidate and label can match at most once. Qualifying pairs are assigned
  deterministically by highest intersection-over-union, then smallest peak
  error, then stable ID order.
- An unmatched candidate is a false positive. An unmatched approved label is a
  false negative. A matched pair is a true positive.
- Peak error is the absolute candidate/label peak difference. Start/end errors
  are absolute boundary differences. Median is reported instead of only mean so
  a few severe misses do not hide typical timing behavior.
- The dashboard always shows sample counts. Fewer than five approved positive
  labels in a category displays **Insufficient benchmark examples**; development
  counts may be shown, but no category-quality claim is permitted.

This rule may be revised only under a new ID. Old benchmark runs retain their
original rule ID and detector versions.

## Dataset splits and claim discipline

- Detector thresholds may be adjusted on a versioned development dataset.
- A separate held-out verification dataset is required before results are
  labeled verified. The same event range must not appear in both sets.
- Negative examples include routine play, false audio peaks, quiet tension,
  menus, loading, scoreboards, replays, spectator screens, and edited cuts.
- Results are filtered by video, resolution, recording type, detector version,
  calibration profile, and category where sample sizes permit.
- Poor results and unsupported categories remain visible. The app never chooses
  only favorable videos after seeing results.
- No numerical Eklipse comparison is allowed unless both systems process the
  same legally usable recordings under this documented labeling and matching
  method.

## Expected detector reliability before measurement

| Tier                | Expected signals                                                                                                                            | Permitted interpretation before benchmark        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Reliable foundation | Manual labels, metadata, timestamps, fingerprints, persisted versions, deterministic metric math                                            | Data/process behavior only; not event accuracy   |
| Moderately reliable | Persistent cuts/black frames, relative audio peaks/silence, calibrated region changes, transcript rule matches                              | Observable signal candidate with evidence        |
| Experimental        | Motion/action intensity, OCR/template screen state, reaction types, kill-feed/round/death/defuser interpretations, possible clutch          | Possible/candidate wording with missing evidence |
| Unsupported         | Confirmed local-player kill or 1vX without identity/player-count evidence, emotion diagnosis, virality/views prediction, live Mac telemetry | Must not be claimed                              |

These are engineering expectations, not benchmark results. Measured results
replace expectations only after the documented evaluation protocol runs.

## Measurements required before a claim

| Measurement       | Definition                                               | Verified result |
| ----------------- | -------------------------------------------------------- | --------------- |
| Precision         | Useful/valid events divided by recommended events        | Not measured    |
| Recall            | Found labeled events divided by all labeled events       | Not measured    |
| False positives   | Recommended events not supported by review               | Not measured    |
| False negatives   | Manually labeled events the system missed                | Not measured    |
| Timestamp error   | Absolute boundary error versus reviewed labels           | Not measured    |
| Processing time   | Wall time per source-video hour                          | Not measured    |
| Peak memory       | Maximum process/app memory during a run                  | Not measured    |
| Disk usage        | Temporary and retained bytes per source hour             | Not measured    |
| Human review time | Minutes needed to accept/correct results per source hour | Not measured    |
| Approval rate     | Candidate moments approved by the user                   | Not measured    |

Additional Phase 3B reports will include per-category F1, median peak/start/end
error, candidates per video hour, useful-ground-truth discovery rate, review
minutes, temporary disk use, and peak memory where the operating system exposes
a trustworthy measurement.

## Result labels used by the dashboard

- **Verified benchmark result:** computed from a versioned labeled dataset and a
  versioned detector run.
- **Development estimate:** a measured engineering observation that has not met
  the complete benchmark protocol.
- **Unsupported claim:** a statement without qualifying evidence; it must not be
  used in product copy.

## Phase 3B.1 verified foundation — July 22, 2026

- One legally usable 20:38, 1280×720 recording was sampled with local FFmpeg.
  Frames at 30, 60, and 120 seconds visibly contained map/operator-ban menu
  screens, so one approved `MENU` range was saved at start 30.25, peak 60, end
  120 seconds with human confidence 0.8. This is one label, not an accuracy
  dataset.
- The label survived an application restart and a JSON export/import round trip.
  The export used `r6-creator-benchmark-labels/v1`, seconds, the measured source
  duration/resolution, and a streaming SHA-256 fingerprint. It contained no
  local path or source filename; this document does not publish the fingerprint.
- The version-pinned `core.media-integrity@1.0.0` framework check completed and
  saved its warning that automatic detectors begin in Phase 3B.2. It produced
  zero events and therefore supports no event-quality metric.
- A deliberately interrupted job was reconciled to `ERROR` after a full server
  restart; its run received the same readable interrupted state, its partial
  temporary directory was removed, and Retry created a new completed run.
- Migration, label/interchange, registry, enablement, version, failure-isolation,
  cancellation, restart, cleanup, and legacy regression tests passed. The full
  suite had 85 tests across 15 files, and formatting, ESLint, strict TypeScript,
  production build, and browser-console inspection also passed.

Because there is only one approved menu label and no candidate-producing
detector, precision, recall, F1, timestamp error, approval rate, and review-time
savings remain **Not measured**. The correct dashboard result for this dataset
is **Insufficient benchmark examples**.

## Phase 3A development observations

The Phase 3A real-media smoke test verifies only reference ingestion,
creator-track local transcription, FFmpeg signal extraction, cancellation,
manual correction, and restart persistence. These checks do not measure R6
event-detection accuracy and must not be presented as benchmark results.
