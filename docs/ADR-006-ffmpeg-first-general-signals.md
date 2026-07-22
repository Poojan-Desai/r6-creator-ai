# ADR-006 — FFmpeg-first general signal measurement

- **Status:** Accepted for Phase 3B.2
- **Date:** July 22, 2026
- **Applies to:** broad video/audio signals only

## Context

Phase 3B.2 needs reproducible scene, frame-difference, brightness, black,
freeze/static, loudness, peak, and silence measurements on large local videos.
It does not need object recognition, semantic gameplay understanding, or exact
motion vectors. The application already ships local FFmpeg/FFprobe executables,
runs them with argument arrays, and has cancellation-safe background jobs.

The current official FFmpeg filter documentation was checked on July 22, 2026.
It documents frame metadata and maintained filters for scene detection,
`signalstats`, `blackdetect`, `freezedetect`, `astats`, `ebur128`, and
`silencedetect`, plus `metadata`/`ametadata` output suitable for machine parsing:

- [FFmpeg Filters Documentation](https://ffmpeg.org/ffmpeg-filters.html)
- [FFmpeg command documentation](https://ffmpeg.org/ffmpeg.html)
- [FFmpeg documentation index](https://ffmpeg.org/documentation.html)

## Decision

1. Use FFmpeg filters and sampled, downscaled streams as the default Phase 3B.2
   measurement engine. Invoke the executable directly with argument arrays and
   parse bounded metadata output, never shell text interpolation.
2. Prefer structured frame/audio metadata when the installed FFmpeg build
   exposes it. Keep parsers versioned and reject malformed/non-finite values
   instead of guessing.
3. Normalize against each recording or selected audio track using transparent
   rolling medians, median absolute deviation, percentiles, and explicit local
   versus global baselines. A raw threshold is retained as a safety bound, not
   used as one universal recording threshold.
4. Downscale and sample before pixel-difference work. Do not run OCR or a large
   model over every frame. Phase 3B.2 does not use map or operator knowledge to
   convert broad measurements into gameplay facts.
5. Store curves as bounded gzip-compressed JSON chunks. One curve row records
   configuration/statistics and each chunk records its time range, point count,
   raw/compressed byte sizes, and maximum deviation. This avoids millions of
   SQLite point rows while remaining inspectable, replaceable, and portable.
6. Preserve short spikes during downsampling with an event-preserving strategy
   rather than relying only on means. Detector events remain normalized rows for
   filtering, explanations, evidence, and benchmarks.
7. Defer OpenCV and optical flow. They would add native/runtime complexity and
   more CPU/memory without evidence that the simpler sampled signal is
   insufficient. Reconsider only under a new ADR after a documented miss set,
   measured runtime/memory, deterministic tests, and a disableable experiment.

## Consequences

- The initial system measures broad changes efficiently and locally but cannot
  understand what a moving frame or loud sound means in Rainbow Six Siege.
- FFmpeg filter availability is checked at runtime. One unsupported detector
  fails in isolation while other detectors continue.
- Compressed chunks require bounded decompression for inspection; API/UI code
  must enforce point and time-range limits.
- Historical curves retain detector version and configuration. Changing a
  threshold affects only explicit reruns and never silently rewrites results.

## Explicit non-decisions

- No OCR, HUD calibration, visual map/room recognition, operator recognition,
  weapon recognition, gadget recognition, defuser detection, clutch detection,
  learned ranking, cloud AI, or virality prediction is introduced here.
