# ADR-011 — Evidence-bounded local voiceover

Date: August 1, 2026

Status: accepted; U5.1 through U5.3 browser verified

## Decision

Voiceover Studio uses a dedicated provider interface and immutable script
revisions. Its input is an inspectable Facts Review, not an unstructured prompt.
Every input is classified as a verified replay fact, direct video observation,
transcript statement, user-confirmed context, inference, or unknown. The local
provider may state only the first four categories, and user context must be
explicitly confirmed. Inferences and unknowns remain visible but are not
rewritten as facts.

Each revision stores the provider and version, source short- or long-form
revision, complete generated package, and facts snapshot. Manual edits create a
new revision. Existing short-form writing and long-form plans remain immutable.

Narration takes retain an original permission-confirmed audio asset. Processing
always starts from that original and creates a separate versioned output linked
to its persisted job and exact settings. FFmpeg performs manual leading/trailing
trim, conservative local noise reduction, EBU loudness normalization, gain, and
AAC conversion outside the request path. Local Whisper captions the currently
selected processed output, or the original when no processed output exists.
Editable caption text and original recognized text remain separate.

Timeline placement uses deterministic item IDs scoped to the script section.
Re-recording or reprocessing therefore replaces only that section's narration
and captions. Narration uses a permission-confirmed local asset and an explicit
`duckOtherAudio` flag. Renderers combine every active narration sidechain before
compressing gameplay audio, and long captions are split into individually
centered render lines instead of overflowing the frame.

## Why

Narration can easily turn an uncertain detector suggestion into a confident
claim. Separating evidence classes before writing makes the boundary
inspectable and testable, lets a creator correct known facts, and prevents an
optional future provider from changing the evidence policy.

## Boundaries

- Local templates remain the required free fallback.
- Enemy count, operator, map, bomb site, health, weapon, rank, stakes, player
  intention, communication, position, and outcome stay unknown unless a
  permitted source or the user confirms them.
- Voiceover generation does not predict performance or views.
- U5 creates no speaker identity, voiceprint, or cloned voice.
- Cancellation terminates the current child process and removes temporary
  files. Restart reconciliation marks interrupted jobs honestly and never saves
  partial processed audio or captions.
