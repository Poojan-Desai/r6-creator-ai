# Streamed HTTP ingestion boundary — October 28, 2026

## Reproduced integration failure

The application advertises a 20 GiB native upload limit and streams multipart
files through Busboy. However, Next.js 16.4.3 Proxy clones non-GET request bodies.
Its default 10 MiB clone limit truncated a real 226,378,452-byte MP4 before the
route handler. Actual HTTP upload returned `400 UPLOAD_INTERRUPTED`; the server
reported `Request body exceeded 10MB for /api/projects`. Smaller service-level
media tests did not exercise this framework boundary.

This was independently consistent with a manual browser attempt to import the
user's original 8.39 GB recording. The isolated HTTP reproduction used a bounded,
stream-copied excerpt of that owned recording. Private media remains local and
ignored; no gameplay asset is part of this source change.

## Fix and unchanged security boundary

`src/proxy.ts` excludes only these exact route groups, optionally with a trailing
slash, from Proxy's body cloning:

- `/api/projects`
- `/api/references`
- `/api/replays`
- `/api/map-versions/[id]/blueprints`
- `/api/studio-projects/[id]/media-assets`
- `/api/studio-projects/[id]/voiceover/takes`

All nine exported GET/POST handlers in these files call `localRequestRejection`
as their first operation, before parameters, database work, filesystem work or
body access. It uses the unchanged `isAllowedLocalRequest` predicate: a loopback
Host, no explicit cross-site fetch metadata, and matching protocol/host/port when
Origin is present. Rejections retain `403 LOCAL_ACCESS_ONLY`. Malformed URLs fail
closed. Nested routes, other APIs, UI pages and media reads still use Proxy.

The framework body cap is unchanged. Raising it to 20 GiB would retain the
recording-sized clone in memory; this patch removes the clone from the explicitly
guarded ingestion paths instead. Existing byte/field/part limits, exclusive
private temporary files, media probing, atomic rename and failure cleanup remain.

## Focused verification

- Next's actual compiled matcher was tested against all six exact route groups,
  trailing slashes, query strings and 13 nearby paths that must remain guarded.
- Existing and new request-boundary tests passed (43 tests across two files).
- Real HTTP tests exercised all six POST groups with foreign Host, foreign Origin,
  explicit cross-site metadata, null Origin, wrong port and wrong protocol: all
  36 returned the same 403 JSON before the client sent any body bytes. The three
  exported GET handlers also rejected foreign Origin, for 39 runtime negatives.
- The identical 226,378,452-byte MP4 then uploaded successfully through the real
  Next server. Returned size matched and a streamed download of the persisted
  source had the identical SHA-256. Source size/mtime stayed unchanged.
- At 25%, 50% and 75% of client transmission, the app-owned temporary file already
  contained approximately 56.6, 113.2 and 169.9 MB. The server writes before the
  entire request arrives, rather than retaining a whole-body framework clone.

## Memory observations and limits

An initial post-compilation RSS probe grew by 236,027,904 bytes and **failed** its
128 MiB growth threshold. That failure is retained in the local evidence; it was
not converted to a pass by increasing the threshold.

Two subsequent identical warm uploads used the same threshold. Process RSS grew
by 43,237,376 and 12,255,232 bytes. A temporary inspector attached only to the
isolated Node server observed peak live ArrayBuffer storage of 32,263,541 and
35,800,926 bytes, external memory of 36,120,528 and 39,657,913 bytes, and heap use
of 118,226,912 and 128,133,376 bytes. The source was 226,378,452 bytes. The first
RSS observation is consistent with development warm-up/allocator/GC effects,
without establishing their exact contribution. Live backing storage and disk
progress support streaming for these bounded requests.

These are controlled local observations, not a general memory ceiling, production
load benchmark or proof for every 20 GiB recording. The separate full-recording
post-fix import and editing results are recorded in
[the real-recording review](REAL_RECORDING_REVIEW.md). No global
concurrency/disk scheduler or multi-user server is introduced.
