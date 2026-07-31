# Replay Provider Audit

Retrieved July 30 and re-executed against a user-approved current replay on
July 31, 2026. Research checkouts and generated output are disposable and
ignored by Git. No private replay, username, profile ID, or absolute personal
path is included here.

## redraskal/r6-dissect

- Repository: <https://github.com/redraskal/r6-dissect>
- Pinned commit:
  `e6c2ca80f7f895e320ca0f8ded0f30136888ffac`
- Commit date: September 15, 2025
- License: MIT (`LICENSE` verified in the pinned checkout)
- Language/build: Go 1.23 module; builds on Apple Silicon
- Dependencies: version-pinned Go modules in `go.mod`/`go.sum`
- Claimed/observed input: completed `.rec` round files
- Upstream fixtures: nine valid Y8S1, Y8S2, and Y9S1 files plus invalid cases
- Stable fields observed: header/game version, map, mode, match type, round
  number, site, teams, scores/result fields where populated, player/profile
  records, operators, recording player, and match-feedback records
- Network behavior: replay CLI parsing is local. A Ubisoft operator-roster
  helper and two related tests use network access; they are not part of the app
  parse command.
- Filesystem behavior: reads the selected replay and writes JSON to stdout; the
  app supplies a controlled working directory and retains only sanitized output.
- Test result: focused offline replay tests passed. The full suite failed only
  the two live roster-comparison tests when the Ubisoft endpoint was
  unavailable.
- Fixture runtime: the same public MIT Y9S1 fixture parsed in about 0.65 seconds
  with approximately 374 MB maximum resident memory during the audit.
- Integration: accepted. The setup script checks out the exact source commit,
  verifies the MIT license, uses project-local Go when necessary, builds without
  a shell, fingerprints the binary, and cleans its build workspace.
- Upstream source limitation found on the real replay: unknown operator ID
  `444310693746` triggered an intentional `panic` in the role switch. The Go
  runtime exited 2 after replay reading had begun.
- Reviewed compatibility patch: one MIT-source patch adds the current attacker
  operator and generated string mapping. Setup verifies and records patch ID
  `r6-dissect-y11s2-solid-snake` and its SHA-256 before building.
- Current built binary SHA-256:
  `47999156fba1631519c317d3b9ea7b22bd1a381844adea0837abbf545fc34e5b`
- Current provider version:
  `source-e6c2ca80+compat-1-2026-07-31`
- Real execution: all nine `Y11S2_Alpha04` rounds parsed independently in about
  1.94 seconds of provider runtime. This validates that exact package and patch,
  not every current or future replay.
- Important limitation: the project describes the format as work in progress.
  Replay compatibility remains version- and content-dependent.

## wnc-replay/replay-tool

- Repository: <https://github.com/wnc-replay/replay-tool>
- Pinned commit:
  `dd535f6499069c8268841fda76c68a04b19ba104`
- Commit date: May 12, 2026
- License: no license file was present in the pinned checkout
- Language/build: Go 1.23 module; all packages compiled on Apple Silicon
- Automated tests: none in the checkout
- Claimed fields: positions, orientation, health, ammunition, shots, gadgets,
  timers, camera, and event information in addition to match metadata
- Network behavior observed during the fixture run: no credential or external
  service was needed
- Fixture runtime: about 3.53 seconds and approximately 506 MB maximum resident
  memory on the same public Y9S1 fixture
- Actual fixture output: 175 timer ticks, 34 camera records, 11 game events, and
  eight unmapped entities; mapped player positions, shots, and health were empty
  for this older fixture and the recording player was unknown
- Real-replay audit result: the pinned source parsed the initially unsupported
  current round and exposed richer version metadata. Four rounds were sampled
  successfully before the audit was stopped because integration was already
  barred by licensing. No output was retained by the application.
- Integration decision: audit-only. Richer claimed fields are version-dependent
  and partly experimental, and the missing license does not permit copying,
  integration, or distribution. License clarification would be required before
  reconsideration.

## Process controls

The integrated provider runs each round directly as `--format json <round>`
with an argument array and `shell:false`, a selected app-owned input path,
controlled working directory, bounded stdout/stderr, schema validation,
two-minute per-round timeout, abort support, `SIGTERM` followed by a bounded
`SIGKILL`, persisted status, restart reconciliation, and cleanup.

Runs persist a private-safe invocation template, input fingerprints,
exit/signal/timeout/read-start state, per-round success/failure, failure class,
safe internal code, and sanitized stderr. One round or provider failure is
isolated. Partial successful results can be retained honestly, while
cancellation and restart recovery remove incomplete rows/output and preserve a
previous valid canonical match.
