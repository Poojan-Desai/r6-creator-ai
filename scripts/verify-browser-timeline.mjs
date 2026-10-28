// Exercises only the packaged original sample; no private media is uploaded.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import ffprobe from "ffprobe-static";

const base = process.env.R6_BROWSER_TEST_URL || "http://127.0.0.1:4176";
const output = path.resolve(
  process.env.R6_BROWSER_TEST_OUTPUT || "work/timeline-verification",
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [],
  requests = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => requests.push({ method: r.method(), url: r.url() }));
async function check(name, action) {
  await action();
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function load() {
  await page
    .getByRole("button", { name: "Load sample project", exact: true })
    .click();
  await page.getByLabel("Source recording", { exact: true }).waitFor();
}
const start = () => page.getByLabel("Clip start", { exact: true });
const end = () => page.getByLabel("Clip end", { exact: true });
try {
  await page.goto(`${base}/studio/`);
  await check(
    "sample opens without private recording or ownership bypass for user files",
    async () => {
      assert(
        await page.getByLabel("Choose video", { exact: true }).isDisabled(),
      );
      await load();
      await page
        .getByText(
          "Synthetic editing sample · original geometric animation, not gameplay. CC0 licensed.",
          { exact: true },
        )
        .waitFor();
      const metadata = await page
        .getByLabel("Source recording", { exact: true })
        .evaluate(async (video) => {
          if (video.readyState < 1)
            await new Promise((resolve) =>
              video.addEventListener("loadedmetadata", resolve, { once: true }),
            );
          return { duration: video.duration, width: video.videoWidth };
        });
      assert.equal(metadata.duration, 12);
      assert.equal(metadata.width, 640);
      assert.equal(await start().inputValue(), "00:00:01.250");
    },
  );
  await check("sample playback and draggable playhead seek", async () => {
    const video = page.getByLabel("Source recording", { exact: true });
    await video.evaluate(async (v) => {
      await v.play();
      v.pause();
    });
    const slider = page.getByRole("slider", {
      name: "Timeline playhead",
      exact: true,
    });
    await slider.scrollIntoViewIfNeeded();
    const box = await slider.boundingBox();
    await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
    await page.waitForFunction(
      () =>
        document.querySelector('video[aria-label="Source recording"]')
          .currentTime > 6,
    );
  });
  await check("keyboard trim retains precise timestamps", async () => {
    await page.getByRole("slider", { name: "Trim start", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await start().inputValue(), "00:00:01.260");
    await page
      .getByRole("slider", { name: "Timeline trim end", exact: true })
      .focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(await end().inputValue(), "00:00:05.740");
  });
  await check(
    "dragging the timeline edge changes range without modifying media",
    async () => {
      const slider = page.getByRole("slider", {
        name: "Timeline trim end",
        exact: true,
      });
      await slider.scrollIntoViewIfNeeded();
      const box = await slider.boundingBox();
      await page.mouse.move(
        box.x + 8 + (box.width - 16) * (5.74 / 12),
        box.y + box.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, {
        steps: 12,
      });
      await page.mouse.up();
      assert(Number((await end().inputValue()).split(":").at(-1)) > 7);
    },
  );
  await check("snapping, zoom, pan and saved clip selection", async () => {
    await page
      .getByRole("checkbox", { name: "Snap trim to 0.1 s", exact: true })
      .check();
    await page.getByRole("slider", { name: "Trim start", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await start().inputValue(), "00:00:01.400");
    await page
      .getByRole("button", { name: "Zoom in timeline", exact: true })
      .click();
    assert(
      await page
        .getByRole("button", { name: "Zoom out timeline", exact: true })
        .isEnabled(),
    );
    assert(
      await page
        .getByRole("slider", {
          name: "Timeline trim start",
          exact: true,
          includeHidden: true,
        })
        .isHidden(),
      "Offscreen trim edges must not appear as false window boundaries",
    );
    assert(
      await page
        .getByRole("slider", { name: "Trim start", exact: true })
        .isEnabled(),
    );
    await page
      .getByRole("button", { name: "Full recording", exact: true })
      .click();
    await page.getByRole("button", { name: "Fit clip", exact: true }).click();
    await page
      .getByRole("button", { name: "Full recording", exact: true })
      .click();
  });
  await check(
    "saved trimmed range survives reload and packaged media reopens",
    async () => {
      await page
        .getByRole("button", { name: "Save clip", exact: true })
        .click();
      const expectedStart = await start().inputValue(),
        expectedEnd = await end().inputValue();
      await page.getByText("Saved in this browser", { exact: true }).waitFor();
      await page.reload();
      await page
        .getByRole("button", { name: /Synthetic motion study.*clips/ })
        .click();
      await page.getByLabel("Source recording", { exact: true }).waitFor();
      await page
        .locator(".clip-list button")
        .filter({ hasText: "Synthetic sample · first pass" })
        .click();
      assert.equal(await start().inputValue(), expectedStart);
      assert.equal(await end().inputValue(), expectedEnd);
    },
  );
  await check(
    "sample download failure preserves existing project",
    async () => {
      await page
        .getByRole("button", { name: "New project", exact: true })
        .click();
      await page.route("**/studio/sample/clip.mp4", (r) =>
        r.fulfill({ status: 503, body: "Unavailable" }),
      );
      await page
        .getByRole("button", { name: "Load sample project", exact: true })
        .click();
      await page.getByRole("alert").waitFor();
      await page.unroute("**/studio/sample/clip.mp4");
      await page
        .getByRole("button", { name: "Back to project", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("textbox", { name: "Project name", exact: true })
          .inputValue(),
        "Synthetic motion study · sample",
      );
    },
  );
  await check(
    "missing sample keeps clip editing and relinking resets playback time",
    async () => {
      await page.route("**/studio/sample/clip.mp4", (r) =>
        r.fulfill({ status: 503, body: "Unavailable" }),
      );
      await page.reload();
      await page
        .getByRole("button", { name: /Synthetic motion study.*clips/ })
        .click();
      await page
        .getByRole("heading", { name: "Reconnect your recording", exact: true })
        .waitFor();
      await page
        .locator(".clip-list button")
        .filter({ hasText: "Synthetic sample · second pass" })
        .click();
      assert(
        await page
          .getByRole("slider", { name: "Timeline playhead", exact: true })
          .isDisabled(),
      );
      assert(
        await page
          .getByRole("slider", { name: "Trim start", exact: true })
          .isEnabled(),
      );
      await page.unroute("**/studio/sample/clip.mp4");
      await page
        .getByLabel("Reselect recording", { exact: true })
        .setInputFiles(path.resolve("browser-lab/studio/sample/clip.mp4"));
      await page.getByLabel("Source recording", { exact: true }).waitFor();
      assert.equal(
        await page
          .getByRole("slider", { name: "Timeline playhead", exact: true })
          .inputValue(),
        "0",
      );
      assert.equal(
        await page
          .getByLabel("Source recording", { exact: true })
          .evaluate((v) => v.currentTime),
        0,
      );
    },
  );
  await check(
    "actual sample MP4 export and native metadata validation",
    async () => {
      await start().fill("1.25");
      await end().fill("5.75");
      await page
        .getByRole("button", { name: "Export video", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Ready to download", exact: true })
        .waitFor({ timeout: 120000 });
      const pending = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download video", exact: true })
        .click();
      const file = path.join(output, "sample-export.mp4");
      await (await pending).saveAs(file);
      const probe = JSON.parse(
        execFileSync(
          ffprobe.path,
          ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
          { encoding: "utf8" },
        ),
      );
      const video = probe.streams.find((s) => s.codec_type === "video");
      assert.equal(video.codec_name, "h264");
      assert.equal(video.width, 640);
      assert.equal(video.height, 360);
      assert(Math.abs(Number(probe.format.duration) - 4.5) < 0.25);
      await writeFile(
        path.join(output, "export-probe.json"),
        JSON.stringify(probe, null, 2),
      );
    },
  );
  await check("export cancellation leaves no partial output", async () => {
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
      await page
        .getByRole("heading", { name: "Ready to download", exact: true })
        .count(),
      0,
    );
  });
  await check("timeline fits desktop tablet and narrow phone", async () => {
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: path.join(output, `timeline-${width}.png`),
        fullPage: true,
      });
    }
  });
  await check("no uploads or browser runtime failures", async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(
      requests.filter((r) => !["GET", "HEAD"].includes(r.method)),
      [],
    );
  });
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(
      {
        base,
        browser: await browser.version(),
        checks,
        errors,
        fixture: "Original synthetic geometry/tone; not gameplay",
        networkMethods: [...new Set(requests.map((r) => r.method))],
      },
      null,
      2,
    ),
  );
  console.log(`${checks.length} timeline/sample checks passed.`);
} finally {
  await browser.close();
}
