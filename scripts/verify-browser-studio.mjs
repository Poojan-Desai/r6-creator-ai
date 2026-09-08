// Runs only against a caller-selected local video. No fixture is uploaded or committed.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import ffprobe from "ffprobe-static";

const recording = process.argv[2];
if (!recording)
  throw new Error(
    "Usage: npm run browser:verify -- /absolute/path/to/owned-video.mp4",
  );
const base = process.env.R6_BROWSER_TEST_URL || "http://127.0.0.1:4176";
const output = path.resolve(
  process.env.R6_BROWSER_TEST_OUTPUT || "work/browser-verification",
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [],
  requests = [],
  checks = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) =>
  requests.push({ method: request.method(), url: request.url() }),
);
async function check(name, action) {
  await action();
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function selectProject() {
  await page
    .getByRole("button", { name: /verification recording.*clips/ })
    .click();
}
async function render(button) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await page
    .getByRole("heading", { name: "Ready to download" })
    .waitFor({ timeout: 120000 });
  await page
    .getByLabel("Rendered clip", { exact: true })
    .evaluate(async (video) => {
      if (video.readyState < 2)
        await new Promise((resolve, reject) => {
          video.onloadeddata = resolve;
          video.onerror = reject;
        });
      if (video.error) throw new Error(video.error.message);
    });
}
try {
  await page.goto(`${base}/studio/`);
  await check("ownership gate", async () =>
    assert.equal(
      await page.getByLabel("Choose video", { exact: true }).isDisabled(),
      true,
    ),
  );
  await page
    .getByRole("checkbox", {
      name: "I own this recording or have permission to use it.",
    })
    .check();
  await check("rejects fake MP4 bytes", async () => {
    await page.getByLabel("Choose video", { exact: true }).setInputFiles({
      name: "invalid.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("not a video"),
    });
    await page.getByRole("alert").waitFor();
  });
  await page.getByRole("checkbox", { name: /^Keep a copy/ }).check();
  await page
    .getByLabel("Choose video", { exact: true })
    .setInputFiles(path.resolve(recording));
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .waitFor();
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .fill("verification recording");
  await page
    .getByRole("textbox", { name: "Project name", exact: true })
    .press("Tab");
  const metadata = await page
    .getByLabel("Source recording", { exact: true })
    .evaluate(async (video) => {
      if (video.readyState < 1)
        await new Promise((resolve) => {
          video.onloadedmetadata = resolve;
        });
      return {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
    });
  assert(
    metadata.duration > 8,
    "Choose a real recording at least 8 seconds long",
  );
  await check("metadata and local playback", async () => {
    assert(metadata.width > 0);
    assert(metadata.height > 0);
  });
  await page.getByLabel("Clip start", { exact: true }).fill("5");
  await page.getByLabel("Clip end", { exact: true }).fill("2");
  await check("rejects invalid clip interval", async () => {
    await page.getByRole("button", { name: "Save clip", exact: true }).click();
    assert.match(
      await page.getByRole("alert").innerText(),
      /start before the end/,
    );
  });
  await page
    .getByLabel("Clip name", { exact: true })
    .fill("Verified browser clip");
  await page.getByLabel("Clip start", { exact: true }).fill("1.25");
  await page.getByLabel("Clip end", { exact: true }).fill("7.75");
  const audio = page.getByRole("combobox", {
    name: "Export audio",
    exact: true,
  });
  if ((await audio.locator("option").count()) > 1)
    await audio.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Save clip", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Notes / transcript", exact: true })
    .fill(
      "[00:02] We checked the doorway.\n[00:05] We moved together after the call.",
    );
  await page
    .getByRole("textbox", { name: "What are you looking for?", exact: true })
    .fill("doorway");
  await check("exact-source keyword search", async () => {
    await page
      .getByRole("button", { name: "Keyword search", exact: true })
      .click();
    await page
      .getByText(
        "Matches from your notes. Check the recording to verify them.",
        { exact: true },
      )
      .waitFor();
    assert.match(
      await page.locator(".search-result").innerText(),
      /We checked the doorway/,
    );
  });
  await check("real MP4 render, playback and downloadable file", async () => {
    await render("Export video");
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download video", exact: true })
      .click();
    const download = await downloadPromise;
    const saved = path.join(output, "verified-browser-export.mp4");
    await download.saveAs(saved);
    const probe = JSON.parse(
      execFileSync(
        ffprobe.path,
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", saved],
        { encoding: "utf8" },
      ),
    );
    assert(Math.abs(Number(probe.format.duration) - 6.5) < 0.25);
    assert.equal(
      probe.streams.find((s) => s.codec_type === "video").codec_name,
      "h264",
    );
    if ((await audio.locator("option").count()) > 1)
      assert.equal(
        probe.streams.find((s) => s.codec_type === "audio").codec_name,
        "aac",
      );
    await writeFile(
      path.join(output, "export-probe.json"),
      JSON.stringify(probe, null, 2),
    );
    await page.screenshot({
      path: path.join(output, "studio-desktop.png"),
      fullPage: true,
    });
  });
  let backup;
  await check("portable project backup", async () => {
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Project backup", exact: true })
      .click();
    const download = await pending;
    backup = path.join(output, "project.json");
    await download.saveAs(backup);
    const project = JSON.parse(await readFile(backup, "utf8"));
    assert.equal(project.clips[0].start, 1.25);
    assert.equal(project.clips[0].end, 7.75);
  });
  await check("reload persists notes, clips and optional source", async () => {
    await page.reload();
    await selectProject();
    assert.match(
      await page
        .getByRole("textbox", { name: "Notes / transcript", exact: true })
        .inputValue(),
      /doorway/,
    );
    await page
      .getByRole("button", { name: /^Verified browser clip 00:/ })
      .click();
    assert.equal(
      await page.getByLabel("Clip start", { exact: true }).inputValue(),
      "00:00:01.250",
    );
    await page.getByLabel("Source recording", { exact: true }).waitFor();
  });
  await check("cancellation leaves no partial result", async () => {
    await page
      .getByRole("button", { name: "Export video", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancel export", exact: true })
      .click();
    await page
      .getByText("Export cancelled. No partial download was kept.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.getByRole("heading", { name: "Ready to download" }).count(),
      0,
    );
  });
  await check("WebM preview with audio", async () => {
    await page
      .getByRole("combobox", { name: "Video format", exact: true })
      .selectOption("webm");
    await render("Render preview");
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download video", exact: true })
      .click();
    const saved = path.join(output, "verified-browser-preview.webm");
    await (await pending).saveAs(saved);
    const probe = JSON.parse(
      execFileSync(
        ffprobe.path,
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", saved],
        { encoding: "utf8" },
      ),
    );
    const video = probe.streams.find((s) => s.codec_type === "video");
    assert.equal(video.codec_name, "vp9");
    assert(Math.max(video.width, video.height) <= 640);
    assert(Math.abs(Number(probe.format.duration) - 6.5) < 0.25);
    await writeFile(
      path.join(output, "preview-probe.json"),
      JSON.stringify(probe, null, 2),
    );
  });
  await check("backup import requires matching source", async () => {
    await page
      .getByLabel("Import project backup", { exact: true })
      .setInputFiles(backup);
    await page
      .getByRole("heading", { name: "Reconnect your recording", exact: true })
      .waitFor();
    // The exported clip is valid video, but must not be accepted as the original source.
    await page
      .getByLabel("Reselect recording", { exact: true })
      .setInputFiles(path.join(output, "verified-browser-export.mp4"));
    await page.getByRole("alert").waitFor();
    assert.match(
      await page.getByRole("alert").innerText(),
      /different recording/,
    );
    await page
      .getByLabel("Reselect recording", { exact: true })
      .setInputFiles(path.resolve(recording));
    await page.getByLabel("Source recording", { exact: true }).waitFor();
  });
  await check("phone-width layout", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.screenshot({
      path: path.join(output, "studio-mobile.png"),
      fullPage: true,
    });
  });
  await check("no private uploads or runtime exceptions", async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(
      requests.filter((r) => !["GET", "HEAD"].includes(r.method)),
      [],
    );
    assert.equal(
      requests.some(
        (r) =>
          r.url.includes("doorway") || r.url.includes(path.basename(recording)),
      ),
      false,
    );
  });
  await check("lightweight companion preserved", async () => {
    await page.goto(base);
    await page.getByRole("link", { name: /Open Creator Studio/ }).waitFor();
    await page.getByRole("heading", { name: /Find the moment/ }).waitFor();
  });
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(
      {
        base,
        browser: await browser.version(),
        checks,
        media: metadata,
        errors,
        networkMethods: [...new Set(requests.map((r) => r.method))],
      },
      null,
      2,
    ),
  );
  console.log(
    `${checks.length} browser checks passed. Private artifacts: ${output}`,
  );
} finally {
  await browser.close();
}
