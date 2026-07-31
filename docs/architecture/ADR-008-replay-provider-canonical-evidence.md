# ADR-008 — Replay Providers Behind an Application-Owned Evidence Model

- Status: Accepted for replay-first foundation
- Date: July 30, 2026

## Decision

Treat third-party replay parsers as version-pinned evidence providers, never as
the application’s database schema. Provider output is schema validated and
adapted into app-owned `CanonicalMatch`, `CanonicalRound`, `CanonicalPlayer`,
`CanonicalEvent`, `CanonicalEvidence`, and `ReplayCapability` records.

Every retained fact carries provider identity/version and confidence/validation
state. Direct observations, inferences, conflicts, missing evidence, and user
corrections use separate fields. Provider-specific raw JSON is privacy
sanitized before local retention.

## Why

Rainbow Six replay formats change and open-source parsers expose different
fields with different semantics. Spreading one parser’s structures through the
UI would make version changes unsafe and make unsupported fields easy to
misrepresent. The canonical boundary lets providers be replaced or combined
later without rewriting video projects, maps, operators, references, or writing.

## Consequences

- The MIT `r6-dissect` provider is the only integrated provider at this
  checkpoint.
- The unlicensed WNC checkout remains audit-only.
- Direct replay feedback bypasses weaker OCR/transcript evidence when they
  represent the same fact, but conflicts are retained rather than overwritten.
- Round-clock feedback is not silently converted into an elapsed match timeline.
- Position, camera, weapon, health, shot, gadget, and destruction fields remain
  unavailable until a licensed provider or application-owned decoder produces
  validated samples on real replays.
- A fixture can verify integration but cannot complete the real-replay gate.
