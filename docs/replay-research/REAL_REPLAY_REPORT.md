# Real Replay Execution Report

## Current gate status

**Pending: no user-approved real completed Match Replay was present in the
application-managed data, work, or output folders on July 30, 2026.**

The application did not search unrelated personal folders. No result in this
document should be described as real-user proof.

## Integration smoke test performed

One public MIT-licensed upstream Y9S1 parser fixture was imported through the
actual browser workflow as an individual `.rec` file with alias privacy. The
pinned locally built provider completed, its JSON passed the reviewed schema,
and the app displayed:

- Y9S1 replay version
- Chalet
- Bomb
- one normalized round
- 10 privacy-safe players with operators
- 9 match-feedback records
- separate direct observations and inferences
- an inspectable 31-row capability matrix, including unsupported fields

The parsed result and canonical evidence survived a complete application-server
restart. Browser console inspection showed no errors or warnings. Retained
provider JSON was checked for raw fixture usernames/profile IDs after privacy
sanitization.

A queued parsing run was cancelled through the production route and reached
`CANCELLED` while restoring the package to `READY`. A deliberately persisted
running-job fixture became a readable restart `ERROR`, and its partial output
directory was removed. A final safe-ZIP import preserved both the original
archive and extracted replay round; the deletion route then removed the package,
canonical rows, parser output, and app-managed files. All disposable fixture
data was removed afterward.

This proves the local build/import/provider/canonical/UI wiring for that fixture.
It does not prove current replay compatibility, full-match multi-round behavior,
position reconstruction, or usefulness on the user’s own match.

## Required next execution

The user must select a completed replay through **Match Replays**. The app will
copy it into managed storage. Then the same pinned provider must be run and the
following recorded here: replay/game version, round count, runtime, memory,
populated/empty/unsupported fields, parser warnings/errors, visual checks
against Siege replay playback where available, cancellation, restart
persistence, and cleanup. Only then can Phase R1 be called complete.
