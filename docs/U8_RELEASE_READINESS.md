# U8 release-readiness ledger

U8 is the final verification stage for Personal Version 1. This ledger keeps
clean-clone evidence separate from checks that require the owner's retained
local recordings, replays, database, and generated exports.

## Clean-clone gates

These gates can be rerun from the public repository without private media:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

The Vitest configuration bounds worker concurrency and gives the integration
tests explicit time to run. This prevents migration and parser-process tests
from failing only because a laptop is oversubscribed while preserving their
individual safety limits.

## Owner-retained gates

The following checks cannot be reproduced from a fresh clone because the
required files are private and deliberately excluded from Git:

- reopen the retained short-form and long-form MP4 exports;
- verify recorded checksums, codecs, dimensions, durations, and byte ranges;
- reopen voiceover takes, coaching clips/reports, and progress snapshots;
- restart against the retained SQLite database and reconcile interrupted jobs;
- confirm temporary processing roots are empty without deleting source media;
- verify database integrity, foreign keys, and all applied migrations;
- inspect the complete browser workflow and console with the retained inputs.

Historical results remain documented in `STATUS.md`. They are not relabeled as
a fresh U8 run. A current combined synchronization proof also remains
outstanding until one matching recording/replay pair exposes usable provider
timestamps.

## Release decision

Do not create the `unified-personal-v1-testable` tag until every available
clean-clone and owner-retained gate is recorded, any unavailable input is named
explicitly, and no source recording, replay, reference, export, report, or
progress history is removed during cleanup.
