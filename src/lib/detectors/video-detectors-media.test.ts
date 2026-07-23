import { spawnSync, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appConfig } from "@/lib/config";
import type { DetectorRunContext } from "@/lib/detectors/types";
import {
  actionIntensityDetector,
  blackIntervalDetector,
  sceneChangeDetector,
  staticIntervalDetector,
} from "@/lib/detectors/video-detectors";

describe("general video detectors with real local media", () => {
  let fixtureDirectory = "";
  let fixturePath = "";

  beforeAll(async () => {
    if (!appConfig.ffmpegPath)
      throw new Error("FFmpeg test binary is missing.");
    fixtureDirectory = await mkdtemp(path.join(tmpdir(), "r6-video-signals-"));
    fixturePath = path.join(fixtureDirectory, "fixture.mp4");
    const generated = spawnSync(
      appConfig.ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=320x180:r=12:d=1.5",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=320x180:r=12:d=1.5",
        "-f",
        "lavfi",
        "-i",
        "color=c=white:s=320x180:r=12:d=1.5",
        "-filter_complex",
        "[0:v][1:v][2:v]concat=n=3:v=1:a=0",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-y",
        fixturePath,
      ],
      { encoding: "utf8" },
    );
    if (generated.status !== 0) {
      throw new Error(generated.stderr || "Could not generate media fixture.");
    }
    await mkdir(path.join(fixtureDirectory, "temporary"));
    await mkdir(path.join(fixtureDirectory, "artifacts"));
  }, 30_000);

  afterAll(async () => {
    if (fixtureDirectory) {
      await rm(fixtureDirectory, { recursive: true, force: true });
    }
  });

  function context(): DetectorRunContext {
    const children = new Set<ChildProcess>();
    return {
      analysisJobId: "test-job",
      detectorRunId: "test-run",
      project: {
        id: "test-project",
        durationSeconds: 4.5,
        width: 320,
        height: 180,
        frameRate: 12,
        sourcePath: fixturePath,
      },
      parameters: { sampleRate: 2, minimumDuration: 1 },
      temporaryDirectory: path.join(fixtureDirectory, "temporary"),
      artifactDirectory: path.join(fixtureDirectory, "artifacts"),
      reportProgress: async () => undefined,
      isCancellationRequested: () => false,
      throwIfCancellationRequested: () => undefined,
      registerChildProcess: (child) => {
        children.add(child);
        return () => children.delete(child);
      },
    };
  }

  it("extracts reproducible scene, action, dark, brightness, and static curves", async () => {
    const [scene, action, black, staticFrames] = await Promise.all([
      sceneChangeDetector.run(context()),
      actionIntensityDetector.run(context()),
      blackIntervalDetector.run(context()),
      staticIntervalDetector.run(context()),
    ]);

    expect(scene.curves?.[0]?.points.length).toBeGreaterThan(5);
    expect(
      scene.events.some((event) => event.eventType === "PROBABLE_EDITED_CUT"),
    ).toBe(true);
    expect(action.curves?.[0]?.kind).toBe("ACTION_INTENSITY");
    expect(
      action.events.some((event) => event.eventType === "ACTION_SPIKE"),
    ).toBe(true);
    expect(black.curves?.map((item) => item.kind)).toEqual([
      "BLACK_PIXEL_RATIO",
      "BRIGHTNESS",
    ]);
    expect(
      black.events.some(
        (event) => event.eventType === "PROBABLE_BLACK_TRANSITION",
      ),
    ).toBe(true);
    expect(staticFrames.curves?.[0]?.kind).toBe("STATIC_SIMILARITY");
    expect(
      staticFrames.events.some(
        (event) => event.eventType === "PROBABLE_STATIC_FRAME",
      ),
    ).toBe(true);
  }, 30_000);
});
