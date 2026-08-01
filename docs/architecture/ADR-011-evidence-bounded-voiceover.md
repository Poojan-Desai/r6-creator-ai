# ADR-011 — Evidence-bounded local voiceover

Date: August 1, 2026

Status: accepted; U5.1 browser verified

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
