# ADR-010 — Segmented long-form rendering

Date: August 1, 2026

Status: accepted and real-media verified

## Decision

Long-form previews and final exports render locally from an immutable timeline
revision in bounded segments of at most 120 seconds. Every segment uses the
already verified short-form H.264/AAC composition semantics for source ranges,
framing, speed, freeze frames, fades, captions, and overlays. Uniform segments
are joined with FFmpeg's concat demuxer. Permission-confirmed voiceover and
music are then mixed in a final audio pass while the joined video is copied.

Preview output is 640×360. Final output is 1920×1080. On supported Apple
Silicon systems the final segments use `h264_videotoolbox` at a deterministic
bitrate. A failed hardware segment is retried with `libx264` using the saved
software settings. FFmpeg is always launched directly with argument arrays.

Jobs persist their immutable timeline revision, pipeline version, render
manifest, encoder, dimensions, codec, duration, segment count, progress,
result, and readable error. Cancellation terminates the active child process
with a bounded forced-kill fallback. Partial files and segment directories are
removed after success, cancellation, failure, or restart reconciliation.

## Why

A single filter graph for a 20–30 minute edit becomes difficult to inspect,
retry, cancel, and bound. Segmenting limits each FFmpeg unit of work, keeps the
browser and server responsive, and allows a failed segment to report a useful
stage without risking source media. Concatenating already uniform streams also
avoids a second video encode when only narration or music must be mixed.

## Boundaries

- A render is a deterministic edit result, not evidence that the video will
  perform well.
- Hardware acceleration is an optimization, never a requirement. Software
  fallback remains available.
- Source recordings are read-only. Only a fully probed output is promoted from
  temporary storage.
- User audio must already be permission-confirmed and owned by the unified
  project.
