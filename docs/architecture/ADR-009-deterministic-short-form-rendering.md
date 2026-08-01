# ADR-009 — Deterministic short-form rendering

## Status

Accepted and verified on August 1, 2026.

## Context

R6 Creator AI must edit large local gameplay recordings without changing the
source, freezing the browser, rerendering after every edit, or hiding how an
output was produced. Preview files and publishable exports have different
performance and quality goals.

## Decision

- Every render is pinned to an immutable `ShortFormTimelineRevision`.
- Timeline JSON is validated before FFmpeg arguments are constructed.
- One shared deterministic filter-graph builder handles source ranges, cards,
  crop/reframe keyframes, speed, freeze frames, transitions, overlays, captions,
  source audio, permission-confirmed user audio, ducking, and fades.
- Preview and export jobs remain separate:
  - proxies use low-resolution dimensions, CRF 28, and the `veryfast` preset;
  - exports use 1080-class dimensions, CRF 20, and the `medium` preset.
- Final dimensions are explicit:
  - 9:16 — 1080×1920
  - 16:9 — 1920×1080
  - 1:1 — 1080×1080
  - 4:5 — 1080×1350
- H.264 video, AAC audio, `yuv420p`, and MP4 fast-start metadata provide broad
  local playback compatibility.
- Proxy and export workers persist queued, running, completed, cancelled, and
  error states. Request routes return before FFmpeg completes.
- Cancellation terminates the direct child process with bounded escalation.
  Restart reconciliation converts interrupted jobs to readable errors and
  removes partial temporary files.
- Completed media is probed before the job is marked successful. Full exports
  must match the saved dimensions and duration within a small container-timing
  tolerance.
- Local media routes support HTTP byte ranges. Export downloads use a
  server-generated filename and never expose an absolute local path.

## Consequences

The same saved edit is reproducible by pipeline version and render
specification. Proxies stay responsive and are never described as final output.
Full-resolution encoding is intentionally slower and occurs only after a
visible user action. The design does not promise identical compressed bytes
across different FFmpeg builds, automatic player tracking, or content
performance.

## Verification

A real 12.667-second segment from the existing 20-minute Siege recording
rendered at 1080×1920 with H.264 video and AAC audio. Browser media loading,
HTTP 206 playback, safe download headers, cancellation, restart recovery,
history deletion, and cleanup passed. A generated fixture rendered at
1920×1080, and deterministic tests cover all four aspect-ratio dimension maps.
