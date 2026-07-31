import type { ChildProcess } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { createR6DissectReplayProvider } from "@/lib/replays/providers/r6-dissect";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function executable(source: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "r6-parser-process-"));
  temporaryDirectories.push(directory);
  const scriptPath = path.join(directory, "parser");
  const replayPath = path.join(directory, "round.rec");
  await writeFile(scriptPath, `#!/usr/bin/env node\n${source}\n`, "utf8");
  await writeFile(replayPath, "fixture", "utf8");
  await chmod(scriptPath, 0o755);
  return { scriptPath, replayPath };
}

describe("reviewed parser process boundary", () => {
  it("schema-validates structured output from a controlled executable", async () => {
    const fixture = await executable(`
      process.stdout.write(JSON.stringify({
        gameVersion: "Y9S1",
        map: { name: "Chalet" },
        gamemode: { name: "Bomb" },
        roundNumber: 0,
        players: [],
        teams: [],
        matchFeedback: []
      }));
    `);
    const provider = createR6DissectReplayProvider(fixture.scriptPath, 2_000);
    const result = await provider.parseRound({
      replayPath: fixture.replayPath,
      sourceFileStableId: "round",
    });
    expect(result.round).toMatchObject({
      gameVersion: "Y9S1",
      mapName: "Chalet",
      roundNumber: 1,
    });
  });

  it("rejects malformed parser JSON with a structured error", async () => {
    const fixture = await executable(
      `process.stdout.write("this is not JSON");`,
    );
    const provider = createR6DissectReplayProvider(fixture.scriptPath, 2_000);
    await expect(
      provider.parseRound({
        replayPath: fixture.replayPath,
        sourceFileStableId: "round",
      }),
    ).rejects.toMatchObject({
      code: "REPLAY_PARSE_INVALID_JSON",
    } satisfies Partial<AppError>);
  });

  it("times out and terminates a stalled parser", async () => {
    const fixture = await executable(`setInterval(() => {}, 1_000);`);
    const provider = createR6DissectReplayProvider(fixture.scriptPath, 30);
    const processState: { child: ChildProcess | null } = { child: null };
    await expect(
      provider.parseRound({
        replayPath: fixture.replayPath,
        sourceFileStableId: "round",
        onChild: (runningChild) => {
          processState.child = runningChild;
        },
      }),
    ).rejects.toMatchObject({
      code: "REPLAY_PARSE_TIMEOUT",
    } satisfies Partial<AppError>);
    expect(processState.child?.killed).toBe(true);
  });

  it("cancels and terminates a running parser", async () => {
    const fixture = await executable(`setInterval(() => {}, 1_000);`);
    const provider = createR6DissectReplayProvider(fixture.scriptPath, 2_000);
    const controller = new AbortController();
    const processState: { child: ChildProcess | null } = { child: null };
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const parsing = provider.parseRound({
      replayPath: fixture.replayPath,
      sourceFileStableId: "round",
      signal: controller.signal,
      onChild: (runningChild) => {
        processState.child = runningChild;
        markStarted?.();
      },
    });
    await started;
    controller.abort();
    await expect(parsing).rejects.toMatchObject({
      code: "REPLAY_PARSE_CANCELLED",
    } satisfies Partial<AppError>);
    expect(processState.child?.killed).toBe(true);
  });
});
