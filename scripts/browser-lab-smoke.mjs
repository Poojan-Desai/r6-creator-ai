import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const base = process.env.R6_BROWSER_URL || "http://127.0.0.1:4176";
const output = path.resolve(
  process.env.R6_SMOKE_OUTPUT || "work/browser-smoke",
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  const failures = [];
  const outgoing = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("request", (request) =>
    outgoing.push({
      url: request.url(),
      method: request.method(),
      body: request.postData(),
    }),
  );
  await page.goto(base);
  await page.getByRole("heading", { name: "Your review workspace" }).waitFor();
  const sentinel = "PRIVATE_R6_SMOKE_81a9";
  const initial = await page
    .getByLabel("Observations or transcript")
    .inputValue();
  await page
    .getByLabel("Observations or transcript")
    .fill(
      `${initial}\n[02:10] ${sentinel}: This synthetic note stays on this device.`,
    );
  await page.getByRole("button", { name: "Find moments with AI" }).click();
  const progress = setInterval(
    async () =>
      console.log(
        "AI:",
        await page
          .getByRole("status")
          .textContent()
          .catch(() => "running"),
      ),
    15000,
  );
  try {
    await page
      .getByRole("status")
      .filter({ hasText: "AI search complete" })
      .waitFor({ timeout: 180000 });
  } finally {
    clearInterval(progress);
  }
  assert.equal(await page.locator(".result").count(), 3);
  assert.match(
    await page.locator(".result").first().innerText(),
    /teammate|together|flank/,
  );
  assert(
    !outgoing.some(
      (request) =>
        decodeURIComponent(request.url).includes(sentinel) ||
        request.body?.includes(sentinel),
    ),
  );
  assert(
    outgoing.every(
      (request) => request.method === "GET" || request.method === "HEAD",
    ),
  );
  checks.push(
    "Real pinned MiniLM WASM inference returned three source matches; no notes uploaded",
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download brief" }).click();
  const download = await downloadEvent;
  const downloadPath = path.join(output, "browser-review-brief.md");
  await download.saveAs(downloadPath);
  const markdown = await readFile(downloadPath, "utf8");
  assert.match(markdown, /Complete source line/);
  assert.match(markdown, /On-device AI/);
  checks.push(
    "Markdown export includes source, timestamp, mode, and full context",
  );
  await page.screenshot({
    path: path.join(output, "desktop.png"),
    fullPage: true,
  });
  await page
    .getByLabel("Observations or transcript")
    .fill("[00:08] The player waited behind cover.");
  assert.equal(await page.locator(".result").count(), 0);
  await page.getByLabel("What are you looking for?").fill("cover");
  await page.getByRole("button", { name: "Use keyword search" }).click();
  assert.equal(await page.locator(".result").count(), 1);
  checks.push(
    "Input edits invalidate stale results; honest keyword fallback works",
  );
  await page.getByRole("button", { name: "Find moments with AI" }).click();
  await page.getByRole("button", { name: "Cancel search" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Search cancelled" })
    .waitFor();
  assert.equal(await page.locator(".result").count(), 0);
  checks.push("Cancellation terminates inference without stale results");
  await page.getByLabel("Observations or transcript").fill("");
  await page.getByRole("button", { name: "Find moments with AI" }).click();
  await page.getByRole("alert").filter({ hasText: "at least one" }).waitFor();
  checks.push("Empty input shows actionable validation");
  await page.getByRole("button", { name: "Load example" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.screenshot({
    path: path.join(output, "mobile.png"),
    fullPage: true,
  });
  checks.push("390px mobile viewport has no horizontal overflow");
  const faulty = await browser.newPage();
  await faulty.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error("Synthetic unsupported Worker");
      }
    };
  });
  await faulty.goto(base);
  await faulty.getByRole("button", { name: "Find moments with AI" }).click();
  await faulty.getByRole("alert").waitFor();
  assert(
    await faulty
      .getByRole("button", { name: "Use keyword search" })
      .isVisible(),
  );
  checks.push("Synchronous Worker failure leaves fallback usable");
  assert.deepEqual(failures, []);
  await writeFile(
    path.join(output, "browser-test-results.json"),
    JSON.stringify(
      {
        base,
        passed: true,
        checks,
        networkRequests: outgoing.length,
        pageErrors: failures,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: true, checks, output }, null, 2));
} finally {
  await browser.close();
}
