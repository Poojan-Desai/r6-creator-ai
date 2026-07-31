# Real Replay Execution Report

## Gate status

**Satisfied for one user-approved current replay package on July 31, 2026.**

This is a compatibility result for the exact nine-round package and provider
version tested. It is not evidence that every current/future replay version is
supported, and it is not a gameplay-event detection benchmark.

## Initial failure and root cause

Secure import and fingerprinting succeeded, but upstream `r6-dissect` stopped at
0% with exit code 2. The old adapter had not retained stderr, so the job only
showed the generic exit code.

The app-managed replay was copied to a disposable private test directory. The
same executable, working directory, and one-round input were reproduced without
touching the imported package. Sanitized stderr showed:

```text
panic: role unknown for operator ID 444310693746
```

Inspection of pinned source commit
`e6c2ca80f7f895e320ca0f8ded0f30136888ffac` established that:

- the CLI accepts either one `.rec` or a folder;
- `--format json` is supported;
- help intentionally exits 2, but this replay reached parser code;
- the actual exit 2 was Go's process exit after an unhandled unknown-operator
  panic; and
- the known-role switch lacked a current attacker operator present in this
  replay.

Changing argument order, using a folder, and parsing individual files did not
remove the panic. Permissions, Apple Silicon, build, path spacing, working
directory, and missing dependencies were not the cause.

## Correction

The local build remains pinned to the reviewed MIT source. Setup now applies a
small, versioned compatibility patch that identifies operator ID
`444310693746` as the attacker `SolidSnake`, then records both patch and binary
hashes in its manifest. The installed provider version is:

`source-e6c2ca80+compat-1-2026-07-31`

The adapter invokes each round independently as:

```text
<app-owned executable> --format json <app-owned round file>
```

The process still uses an argument array with `shell:false`. A failure in one
round is now stored separately; successfully parsed rounds can form an honestly
marked partial match instead of being discarded.

The audit-only WNC parser also read the unsupported round during investigation,
but it was not integrated because its repository has no top-level license.

## Exact real execution

The corrected application route parsed all nine round files:

| Measurement              | Verified result                       |
| ------------------------ | ------------------------------------- |
| Provider                 | `redraskal.r6-dissect`                |
| Provider version         | `source-e6c2ca80+compat-1-2026-07-31` |
| Successful/failed rounds | 9 / 0                                 |
| Processing duration      | approximately 1.94 seconds            |
| Replay/game version      | code `9803520` / `Y11S2_Alpha04`      |
| Map/mode/match type      | `LairY10` / `Bomb` / `Ranked`         |
| Privacy-safe players     | 10                                    |
| Canonical events         | 67                                    |
| Validation               | `VALIDATED`, `HIGH` confidence        |
| Direct kills/headshots   | 62 / 32                               |
| Defuser feedback         | 4                                     |
| Persisted round results  | 9 success records                     |

Retained JSON and API output were checked for private absolute paths and raw
identity values. Only privacy-safe aliases/hashes are retained in canonical
records. The application did not modify or delete the imported package or the
user's original source files.

## Failure handling verified with the same package

- Retry: the failed package was retried through the real application route and
  completed.
- Cancellation: a real run reached `CANCELLED`, left no partial round rows or
  output directory, and preserved the previously valid canonical match.
- Restart recovery: a real running job was interrupted by a complete server
  restart. Reconciliation marked it `ERROR`, removed partial results/output,
  and preserved the prior canonical match.
- Persistence: a final successful retry cleared the package error and retained
  all nine rounds and capability records after restart.
- Diagnostics: provider/version, safe invocation template, safe round
  fingerprints, exit/signal/timeout/read-start state, per-round status,
  classified error, suggested action, and sanitized stderr are inspectable.

## Honest limits

The active provider does not expose continuous elapsed match time, positions,
orientation, health, weapons, ammunition, shots, damage, gadgets, camera
target, original pixels/audio, or reconstructed POV. Deaths are derived from
direct kill targets and stay marked unverified. Timer values are event-attached
round-clock observations, not a continuous timeline. No benchmark yet proves
candidate-moment accuracy or reduced human review time.
