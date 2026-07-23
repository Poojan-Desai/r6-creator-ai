import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appConfig } from "@/lib/config";
import { parseAudioLevelWindows } from "@/lib/detectors/audio-detectors";
import { runFfmpegAudioMetadata } from "@/lib/detectors/ffmpeg-signals";
import type { DetectorRunContext } from "@/lib/detectors/types";

describe("audio metadata with real separate local tracks", () => {
  let fixtureDirectory = "";
  let fixturePath = "";

  beforeAll(async () => {
    if (!appConfig.ffmpegPath)
      throw new Error("FFmpeg test binary is missing.");
    fixtureDirectory = await mkdtemp(path.join(tmpdir(), "r6-audio-signals-"));
    fixturePath = path.join(fixtureDirectory, "separate-tracks.mp4");
    const generated = spawnSync(
      appConfig.ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=gray:s=320x180:r=12:d=4",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000:duration=0.5",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=180:sample_rate=48000:duration=0.5",
        "-filter_complex",
        "[1:a]adelay=500|500,apad,atrim=0:4[creator];[2:a]adelay=2500|2500,apad,atrim=0:4[game]",
        "-map",
        "0:v",
        "-map",
        "[creator]",
        "-map",
        "[game]",
        "-metadata:s:a:0",
        "title=Creator Microphone",
        "-metadata:s:a:1",
        "title=Game Audio",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        "-y",
        fixturePath,
      ],
      { encoding: "utf8" },
    );
    if (generated.status !== 0) {
      throw new Error(generated.stderr || "Could not generate audio fixture.");
    }
    await mkdir(path.join(fixtureDirectory, "temporary"));
    await mkdir(path.join(fixtureDirectory, "artifacts"));
  }, 30_000);

  afterAll(async () => {
    if (fixtureDirectory) {
      await rm(fixtureDirectory, { recursive: true, force: true });
    }
  });

  function context(overrides?: {
    cancelled?: () => boolean;
  }): DetectorRunContext {
    return {
      analysisJobId: "audio-test-job",
      detectorRunId: "audio-test-run",
      project: {
        id: "audio-test-project",
        durationSeconds: 4,
        width: 320,
        height: 180,
        frameRate: 12,
        sourcePath: fixturePath,
      },
      parameters: {},
      temporaryDirectory: path.join(fixtureDirectory, "temporary"),
      artifactDirectory: path.join(fixtureDirectory, "artifacts"),
      reportProgress: async () => undefined,
      isCancellationRequested: overrides?.cancelled ?? (() => false),
      throwIfCancellationRequested: () => {
        if (overrides?.cancelled?.())
          throw new Error("Analysis was cancelled.");
      },
      registerChildProcess: () => () => undefined,
    };
  }

  async function rmsForStream(streamIndex: number) {
    const output = await runFfmpegAudioMetadata({
      context: context(),
      streamIndex,
      stage: "Audio test",
      filterGraph:
        "aresample=16000,asetnsamples=n=8000:p=1,astats=metadata=1:reset=1,ametadata=mode=print:file=-",
    });
    return parseAudioLevelWindows({
      records: output.records,
      key: "lavfi.astats.Overall.RMS_level",
      durationSeconds: 4,
      windowSeconds: 0.5,
      streamIndex,
    });
  }

  it("keeps creator and game measurements separate", async () => {
    const [creator, game] = await Promise.all([
      rmsForStream(1),
      rmsForStream(2),
    ]);
    const creatorPeak = creator.reduce((selected, point) =>
      point.rawValue > selected.rawValue ? point : selected,
    );
    const gamePeak = game.reduce((selected, point) =>
      point.rawValue > selected.rawValue ? point : selected,
    );
    expect(creatorPeak.sourceStreamIndex).toBe(1);
    expect(gamePeak.sourceStreamIndex).toBe(2);
    expect(creatorPeak.timestampSeconds).toBeLessThan(1.5);
    expect(gamePeak.timestampSeconds).toBeGreaterThan(2);
  }, 30_000);

  it("returns a readable error for a missing selected stream", async () => {
    await expect(
      runFfmpegAudioMetadata({
        context: context(),
        streamIndex: 99,
        stage: "Missing stream test",
        filterGraph:
          "aresample=16000,asetnsamples=n=8000:p=1,astats=metadata=1:reset=1,ametadata=mode=print:file=-",
      }),
    ).rejects.toThrow(/FFmpeg signal analysis failed/);
  });
});
