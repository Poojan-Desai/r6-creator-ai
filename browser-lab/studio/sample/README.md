# Original synthetic browser sample

`clip.mp4` is a 12-second, 640×360, 24 fps H.264/AAC animation created specifically
for this application. A teal circle and orange square cross a grid; the background
changes at six seconds. Its only audio is a quiet, synthesized 220 Hz tone with
fades. It contains no gameplay, speech, private recording, external image, font,
music or third-party footage. It is a workflow demonstration and supplies no R6
gameplay-analysis evidence.

The original geometric animation and synthesized audio are dedicated to the public
domain under [CC0 1.0](LICENSE.txt). Their source is the original procedural drawing
code in `scripts/generate-browser-sample.mjs`; no remote assets are downloaded.

From the repository root, after `npm ci`, recreate and inspect the asset with:

```bash
node scripts/generate-browser-sample.mjs
```

The generator invokes the repository's bundled FFmpeg and FFprobe executables
directly with argument arrays. It draws RGB frames in memory, encodes H.264/AAC,
checks codecs, dimensions, duration and a 2 MB limit, and writes `manifest.json`.
It uses one encoder thread and fixed inputs. Different bundled executable builds
can produce different bytes; regeneration always updates the actual checksums.

The manifest records full-file SHA-256 and the existing browser project's bounded
edge fingerprint: SHA-256 of the first 65,536 bytes, last 65,536 bytes and decimal
file size, concatenated in that order (overlap is retained for small files).
`sample.ts` fetches the relative bundled asset only after a user chooses it, bounds
the response to the exact manifest size and verifies both identities. It does not
read or send an uploaded source. The file is then inspected through the same media
pipeline as an owned recording.

The starter project uses the existing portable project schema. It has accurate
synthetic notes and two silent clips, 1.25–5.75 seconds and 6.25–10.75 seconds.
Select the synthetic audio track explicitly to include the tone in an export.
