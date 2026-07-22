# R6 Creator AI — Detection Benchmark

## Current verified status

**No Rainbow Six moment-detection benchmark results exist yet.** Phase 3A builds
the Reference Library and structured Creator Style Profiles; it does not run or
claim automatic R6 event detection.

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

Every label will include a category, start/peak/end timestamp, evidence notes,
reviewer, and whether the label is confirmed or only possible. Clutches and 1vX
states remain possible unless player-count and round-state evidence supports
confirmation.

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

## Result labels used by the dashboard

- **Verified benchmark result:** computed from a versioned labeled dataset and a
  versioned detector run.
- **Development estimate:** a measured engineering observation that has not met
  the complete benchmark protocol.
- **Unsupported claim:** a statement without qualifying evidence; it must not be
  used in product copy.

## Phase 3A development observations

The Phase 3A real-media smoke test verifies only reference ingestion,
creator-track local transcription, FFmpeg signal extraction, cancellation,
manual correction, and restart persistence. These checks do not measure R6
event-detection accuracy and must not be presented as benchmark results.
