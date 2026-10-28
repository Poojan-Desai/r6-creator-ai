# Verification — October 28, 2026

Fresh local verification on macOS / Apple Silicon, Node 22.18.0 and headless
Google Chrome, from the October source reconciled against published main
`acb1e07`. The remote dependency-only branch `7ce90ba` was inspected: current
Next.js 16.4.3, sharp 0.35.5 and other patched packages supersede its older
versions; its js-yaml 4.3.2 override is retained explicitly.

| Command                                                               | Result                                                                                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --no-audit --no-fund`                                         | Clean install passed.                                                                                                      |
| `npm run db:generate`                                                 | Prisma client generated.                                                                                                   |
| `npm run format:check`                                                | Passed.                                                                                                                    |
| `npm run lint`                                                        | Passed.                                                                                                                    |
| `npm run typecheck`                                                   | Passed.                                                                                                                    |
| `npm test`                                                            | 367 tests in 80 files passed, including real native synthetic MP4 ingestion/export.                                        |
| `npm run build`                                                       | Next.js 16.4.3 production build passed.                                                                                    |
| `npm run browser:build`                                               | Static browser companion and studio built.                                                                                 |
| `npm run browser:verify-timeline`                                     | 12 checks passed using the original packaged CC0 sample, including timeline persistence, real MP4 export and cancellation. |
| `npm run browser:verify -- "$PWD/browser-lab/studio/sample/clip.mp4"` | 14 studio checks passed, including MP4/WebM encode, playback/download, storage, cancellation and phone layout.             |
| `npm audit --json`                                                    | Zero known findings at verification time.                                                                                  |

Browser verification used isolated loopback port 4196; `R6_BROWSER_TEST_URL`
selected it. Artifacts remain below ignored `work/` directories. The sample is
an original geometric animation and tone, not gameplay or a recognition benchmark.
No cloud AI provider or private recording was used.

The review examined multipart cancellation, parser/file teardown, exclusive file
ownership, field/part bounds and atomic export status conditions, together with
their fault regressions. Browser sample checksum/size bounds and timeline input
validation were inspected. Gitleaks 8.30.1 scanned all reachable Git history; its
two findings are false positives on public map-layout version identifiers
`white-noise-2017` and `black-ice-2016`. No credential was identified. Generated
runtime data, local configuration and browser verification output are ignored.

The js-yaml override preserves the exact already-installed 4.3.2 package, so it
changes no runtime behavior; formatting and lockfile consistency were rechecked.
Source checks/builds in GitHub Actions report remote execution separately.
Existing single-machine scheduler, load testing, multi-user identity and
gameplay-recognition limits remain as documented in the README and hardening note.
