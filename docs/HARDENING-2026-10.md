# Streamed ingestion and export state integrity — October 24, 2026

## Story 1: Finish a failed upload before deleting its partial file

The original multipart importer recorded a body-stream error but only settled when Busboy emitted close. A disconnected body could leave the parser and import promise pending. Cancellation was not linked to the request/disk pipelines, and truncated or excess metadata fields were not rejected.

The importer now connects the request to Busboy through a cancellable pipeline and explicitly tears down parsing after file/limit errors. It waits for the disk-writing pipeline to settle before cleanup, preventing a late file open/write from recreating partial content after deletion. Files are created exclusively with mode 0600. Cleanup checks ownership, so an exclusive-create collision does not remove the pre-existing destination. Metadata uses a prototype-free dictionary; field, part, file and byte bounds are enforced. The configured maximum field count remains usable; tests cover both the four-field project and sixteen-field reference boundaries.

Deterministic tests start a real pending body/file write, then simulate disconnection and Request abort. Both promises reject and leave no temporary file. Other cases cover missing boundaries, file collision preservation, oversized video, duplicate files, excess/truncated fields and concurrent distinct imports. These are controlled local fault cases rather than measured production failure rates.

## Story 2: Arbitrate cancellation at the database boundary

The export worker checked cancellation before renaming output, then awaited FFprobe and unconditionally wrote COMPLETED. A cancellation received during verification could be overwritten. A cancellation route could similarly act on a stale read and overwrite completed status.

Workers now conditionally claim QUEUED jobs without a cancellation timestamp, update progress only while RUNNING without cancellation, and commit COMPLETED only from that same active state. The cancellation route requests cancellation only from an active state. Error/cancel cleanup changes only active records, preserving terminal ERROR and COMPLETED records. An in-process cancellation received between context loading and job claiming is finalized as CANCELLED. Existing immutable timeline revisions, media validation, cancellation process signals and restart cleanup remain in place.

Tests pause output verification, submit cancellation, then resume verification: status remains CANCELLED and the final media plus temporary directory are removed. Separate cases exercise external failure during verification, stale cancellation after concurrent completion, pre-claim cancellation, completed-output preservation and duplicate in-process submissions. The database behavior is modeled with conditional-update semantics in these focused tests; the full existing migration/media suite also runs. This increment does not promise cross-process queue leasing, global concurrency limits, a durable scheduler, or atomically coordinated filesystem/database commits.

## Architecture

```text
Request signal -> request pipeline -> Busboy -> exclusive 0600 disk stream
                       |                            |
                  stop on failure  <- await close -> owned partial cleanup

QUEUED -- conditional claim --> RUNNING -- probe + conditional commit --> COMPLETED
   |                              |
   +-- cancellation/error -------+--> CANCELLED / ERROR + output/temp cleanup
```

## Reproduce

```sh
npm ci
npm run db:generate
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build

# Write an original synthetic media fixture and machine-readable verification
# report to a deliberate local test-artifact directory.
R6_TEST_ARTIFACT_DIR=/absolute/path/to/evidence npm test -- src/lib/upload-media.test.ts
```

The test-artifact variable affects that test only; it is not an application setting. Baseline/full validation results, exact commands and logs accompany the delivered evidence. Synthetic media is FFmpeg testsrc2 plus an original generated 440 Hz tone, with no gameplay, personal recording or third-party creator content. Its 4-second 640x360/30fps H.264/AAC input is streamed through the actual importer and probed, then a two-second range is exported using the real clipping helper. The test checks duration tolerance, resolution, H.264/AAC codec streams, and decoding the entire output without FFmpeg errors. Existing real-media short-form/long-form tests cover saved render plans and remain unchanged.

## Demo and boundaries

Run the local application from the README; import owned footage, select a range and export a clip. Use the synthetic media test above to reproduce ingestion/export integrity without private footage. For the browser timeline, run `npm run browser:build`, `npm run browser:dev`, then `npm run browser:verify-timeline`; it uses the packaged clearly labeled original sample and creates screenshots and an export.

Remaining directive items include cross-process job leases/reconciliation races, application-wide processing concurrency/disk capacity scheduling, systemic performance/load measurements, undo/redo expansion, and a representative human-labeled gameplay-event detector evaluation. No event-recognition accuracy or performance improvement is claimed. Optional paid AI settings, privacy boundaries, databases and existing media formats are unchanged. No remote push, release, deployment or publishing was attempted.

## Focused dependency follow-up

The October 24 npm audit initially flagged three packages: Next.js 16.3.8 (critical), Zod 4.4.3 (high), and transitive Vite 8.1.5 (high). The follow-up pins Next.js/eslint-config-next 16.4.3 and Zod 4.6.7, and overrides the existing Vite 8.1 line to its patched 8.1.6 release. No major version or inference/runtime migration was made. Next native binaries and its matching ESLint plugin update with Next; all other direct dependencies remain unchanged. Transformers 4.2.0, onnxruntime-node 1.24.3 and onnxruntime-web 1.26.0-dev.20260416-b7804b056c are preserved exactly.

The resolved lockfile now has zero known npm audit findings. The initial/final machine-readable audits, dependency tree and installation log accompany the final evidence; all mandatory gates, real-media checks and the browser timeline workflow are rerun after installation. Audit counts are registry knowledge at the time of the run, not an exploitability assessment or guarantee of complete security. Existing sharp 0.35.5 already mitigated the image-specific upstream issue, and some advisory paths depend on optional framework features. Updating removes the affected framework release as a dependency regardless.

Sources: [Next image optimization advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Next typed-array cache advisory](https://github.com/advisories/GHSA-673q-mjm6-r5xr), [Zod collection resource-exhaustion advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [Vite filesystem access advisory](https://github.com/advisories/GHSA-rq7h-c2jc-7f22). See the initial audit JSON for the remaining server-action/dev-tool advisory URLs within the same patched packages.
