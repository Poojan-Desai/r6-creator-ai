# Portfolio benchmark correction — November 7, 2026

Baseline: `96fbfc834aa3c3184784e042014d5799c51ffb01`.
Local review branch: `codex/portfolio-audit-2026-11-07`.

## Change

New broad-signal benchmark runs use `phase3b2-broad-signal-v2` and enforce the
category-specific matching rules in [BENCHMARK.md](../BENCHMARK.md). The previous
generic OR rule could count a quiet span with IoU 0.025 or a broad reaction
whose peak was 23 seconds wrong. New runs require category agreement and
category-specific timing/overlap, isolate the requested category in denominators,
and include the rule descriptions in report metadata. Fully reviewed zero-TP
cases retain measured zero F1 through the count formula; unavailable cases stay
unavailable. Historical stored runs are not rewritten.

This corrects evaluation accounting, not detector predictions. Different
matching-rule versions must not be presented as a measured model improvement.
No event-accuracy or time-savings claim is added.

## Validation ledger — November 7, 2026

Environment: macOS arm64, Node 22.18.0, npm 10.9.3, repository-pinned dependencies. All checks used this local review branch. No live cloud writing call, private recording, or private replay was used.

| Check                                                                                                           | Fresh result                              | Meaning and limit                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                                                        | Passed; 501 packages installed            | Clean lockfile install; advisories reported separately.                                                                                                    |
| `npm run db:generate`                                                                                           | Passed; Prisma 6.19.3 client              | Generates the typed client; not a production database-migration certification.                                                                             |
| Pre-fix targeted benchmark run                                                                                  | 8 failed, 7 passed, 15 total              | Intentional red regressions against unchanged implementation.                                                                                              |
| Pre-fix full suite with those added tests                                                                       | 8 failed, 402 passed, 410 total, 82 files | Existing 400 tests passed; eight new examples reproduced the bug.                                                                                          |
| `npm test -- src/lib/phase3b2-benchmark.test.ts` after fix                                                      | 17 passed                                 | Category rules, valid/invalid matches, category denominators and F1 availability/zero.                                                                     |
| `npm run format:check`                                                                                          | Passed                                    | Repository formatting.                                                                                                                                     |
| `npm run lint`                                                                                                  | Passed                                    | ESLint.                                                                                                                                                    |
| `npm run typecheck`                                                                                             | Passed                                    | Strict TypeScript.                                                                                                                                         |
| `npm test` after fix                                                                                            | 412 passed in 82 files                    | 12 added regression cases; native synthetic MP4 fixtures included. This is not 412 independent gameplay examples.                                          |
| `npm run build`                                                                                                 | Passed                                    | Next.js production compilation and page generation.                                                                                                        |
| `npm run browser:build`                                                                                         | Passed                                    | Static companion/studio package built, without server files/private media.                                                                                 |
| `R6_BROWSER_TEST_URL=http://127.0.0.1:4198 npm run browser:verify-timeline`                                     | 12 checks passed                          | Packaged synthetic sample, playback/trim/reload, real MP4 export, cancellation and responsive layout.                                                      |
| `R6_BROWSER_TEST_URL=http://127.0.0.1:4198 npm run browser:verify -- "$PWD/browser-lab/studio/sample/clip.mp4"` | 14 checks passed                          | Local synthetic MP4/WebM export, metadata, downloads, persistence/backup/relink, invalid inputs, no uploads/runtime errors.                                |
| `npm audit --json`                                                                                              | 8 moderate, 0 high/critical               | ESLint/TypeScript tooling/minimatch chain; npm audit returns nonzero because findings remain. Point-in-time registry result, not a security certification. |
| `npm audit --omit=dev --json`                                                                                   | 0 findings                                | Production dependency subset only.                                                                                                                         |
| `git diff --check`                                                                                              | Passed                                    | No whitespace errors.                                                                                                                                      |

The failed pre-fix runs are retained as intentional defect evidence, not hidden. Test duration is machine/load dependent; no throughput improvement is claimed. Native automated tests use generated media. Browser tests use the original packaged geometric sample and a tone; none establishes R6 event accuracy, voice recognition accuracy, player improvement, editing-time savings, or live provider quality.

The full native UI and all optional engines were not manually rerun. The matcher itself is tested directly; the benchmark database/UI/report path is source-inspected and compiled rather than newly exercised with an approved representative gameplay dataset. Per-category rules are included in new report metadata, and old stored run versions remain unchanged. A project owner should review the patch and rerun a benchmark deliberately before using a v2 report.

Changed files: `src/lib/phase3b2-benchmark.ts`, `src/lib/phase3b2-benchmark.test.ts`, `BENCHMARK.md`, and `docs/PORTFOLIO-VALIDATION-2026-11-07.md`. No database schema, detector configuration, cloud provider, media processing algorithm or runtime data changed.
