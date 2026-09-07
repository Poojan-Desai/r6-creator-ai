# September 2026 release verification

Public companion: <https://r6-creator-studio-poojan.netlify.app>

## Delivered

- A working Browser Studio with real on-device MiniLM semantic retrieval, three
  exact source excerpts, timestamps, complete source-line context, optional local
  video playback, and Markdown brief export. The editing outline is rule-based.
- Pinned model revision `751bff37182d3f1213fa05d7196b954e230abad9`, Transformers.js
  4.2.0, q8 weights, single-thread WASM in a cancellable Web Worker.
- Netlify static frontend and read-only public sample/health functions. No media
  upload endpoint, server-side inference bill, app account, or hosted database.
- Optional recovered OpenAI short-form writing integration with explicit consent,
  schema validation, local fallback provenance, persistent accounting, and default
  zero budget. Paid calls do not retry automatically.
- Budget reservations serialize through a SQLite transaction and singleton write
  lock. UTF-8/schema overhead is included; missing usage retains its reservation;
  deleting a studio project preserves its historical charges.
- The full local app binds to loopback and rejects foreign Host/Origin requests.

## Verification performed September 7, 2026

- Formatting, ESLint, strict TypeScript, **308 tests across 73 files**, and Next.js
  production build passed. The test suite includes real SQLite migrations, budget
  reservations, retained accounting, generated H.264/AAC media, and export tests.
- Dependency audit: **zero reported vulnerabilities** after explicit `sharp` and
  `adm-zip` transitive fixes. The lockfile preserves the validated dependency graph.
- Live Netlify Chrome smoke: actual model download and WASM inference, three
  source matches, no notes/query/video in outgoing requests, Markdown export,
  stale-result invalidation, cancellation, empty-input validation, synchronous
  Worker failure recovery, and 390px mobile layout all passed. No page errors.
- Production `/api/health` and `/api/demo` return 200. POST requests return 405.
  `/.env` returns 404. Browser assets enforce a restrictive content policy.
- A separate local copy of an existing gameplay recording produced a retained
  **1080 × 1920, 12.267-second H.264/AAC MP4**, 6,360,648 bytes. Streaming returned
  HTTP 206 with `bytes 0-1023/6360648`; download attachment headers were correct.
  The export remains private and is not committed or hosted.
- The 32-migration verification database passed integrity/foreign-key checks.

Reproduce the browser checks with Google Chrome installed:

```sh
npm ci
npm run browser:build
npm run browser:dev
# In another terminal:
node scripts/browser-lab-smoke.mjs
# Or test the published site:
R6_BROWSER_URL=https://r6-creator-studio-poojan.netlify.app node scripts/browser-lab-smoke.mjs
```

The optional WebMCP brief-export contract is unit tested with a registry double.
Native experimental WebMCP registration was not verified in a supporting browser.

## Scope and limits

This is a free text-search/review companion. The complete SQLite, FFmpeg, replay,
Whisper, editing, and export workflow remains a private Mac app. Search does not
analyze video, prove match events, rate player skill, or infer missing outcomes.
Similarity is a ranking signal, not calibrated confidence. Review the full source.

Tiny generative models were tested and omitted because they invented unsupported
details. No live paid OpenAI request was made; its integration tests use mocked
provider responses. Budget estimates do not replace provider account controls.

Initial model/runtime downloads require internet and device memory. Hugging Face
receives those download requests; source notes and video stay local. Netlify's
existing legacy Free limits apply and were preserved with overages disabled.
Mobile layout was verified in Chrome emulation; physical iPhone Safari has not
been tested. Keyword search remains available if local AI cannot run.

Model reference: <https://huggingface.co/Xenova/all-MiniLM-L6-v2>

Netlify plan reference:
<https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-legacy-plans/legacy-pricing-plans/>
