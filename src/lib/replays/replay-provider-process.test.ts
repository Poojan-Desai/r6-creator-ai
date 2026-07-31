import type { ChildProcess } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { decideReplayParseOutcome } from "@/lib/replays/outcome";
import { parseReplayRoundWithFallback } from "@/lib/replays/providers/fallback";
import {
  ReplayProviderExecutionError,
  sanitizeReplayProviderText,
} from "@/lib/replays/providers/provider-error";
import {
  buildR6DissectInvocation,
  createR6DissectReplayProvider,
} from "@/lib/replays/providers/r6-dissect";

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
  it("constructs explicit JSON arguments for both file and folder inputs", () => {
    const file = buildR6DissectInvocation(
      "/app/r6-dissect",
      "/app/replays/Match With Spaces/round.rec",
    );
    const folder = buildR6DissectInvocation(
      "/app/r6-dissect",
      "/app/replays/Match With Spaces",
    );
    expect(file).toEqual({
      executablePath: "/app/r6-dissect",
      arguments: [
        "--format",
        "json",
        "/app/replays/Match With Spaces/round.rec",
      ],
      workingDirectory: "/app/replays/Match With Spaces",
    });
    expect(folder.arguments).toEqual([
      "--format",
      "json",
      "/app/replays/Match With Spaces",
    ]);
    expect(folder.workingDirectory).toBe("/app/replays");
  });

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

  it("preserves and classifies sanitized exit-code-2 diagnostics", async () => {
    const fixture = await executable(`
      process.stderr.write("panic: role unknown for operator ID 444310693746\\n/Users/PrivateName/replays/round.rec\\n");
      process.exit(2);
    `);
    const provider = createR6DissectReplayProvider(fixture.scriptPath, 2_000);
    try {
      await provider.parseRound({
        replayPath: fixture.replayPath,
        sourceFileStableId: "round",
      });
      throw new Error("Expected the provider to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ReplayProviderExecutionError);
      const diagnostics = (error as ReplayProviderExecutionError).diagnostics;
      expect(diagnostics).toMatchObject({
        failureKind: "UNSUPPORTED_REPLAY_VERSION",
        internalErrorCode: "REPLAY_PROVIDER_OPERATOR_UNKNOWN",
        exitCode: 2,
        unsupportedVersion: true,
      });
      expect(diagnostics.stderrPreview).toContain(
        "role unknown for operator ID 444310693746",
      );
      expect(diagnostics.stderrPreview).not.toContain("PrivateName");
      expect(diagnostics.stderrPreview).not.toContain("/Users/");
    }
  });

  it("uses a reviewed fallback provider after a version-specific failure", async () => {
    const unsupported = await executable(`
      process.stderr.write("panic: role unknown for operator ID 444310693746\\n");
      process.exit(2);
    `);
    const corrected = await executable(`
      process.stdout.write(JSON.stringify({
        gameVersion: "Y11S2_Alpha04",
        map: { name: "LairY10" },
        gamemode: { name: "Bomb" },
        roundNumber: 0,
        players: [],
        teams: [],
        matchFeedback: []
      }));
    `);
    const first = createR6DissectReplayProvider(unsupported.scriptPath, 2_000);
    const second = createR6DissectReplayProvider(corrected.scriptPath, 2_000);
    const parsed = await parseReplayRoundWithFallback({
      providers: [first, second],
      replayPath: corrected.replayPath,
      sourceFileStableId: "round",
    });
    expect(parsed.provider).toBe(second);
    expect(parsed.result.round.gameVersion).toBe("Y11S2_Alpha04");
    expect(parsed.failedProviders).toEqual([
      {
        providerId: first.id,
        internalErrorCode: "REPLAY_PROVIDER_OPERATOR_UNKNOWN",
      },
    ]);
  });

  it("parses multiple round inputs independently", async () => {
    const fixture = await executable(`
      process.stdout.write(JSON.stringify({
        gameVersion: "Y11S2_Alpha04",
        map: { name: "LairY10" },
        gamemode: { name: "Bomb" },
        roundNumber: 0,
        players: [],
        teams: [],
        matchFeedback: []
      }));
    `);
    const provider = createR6DissectReplayProvider(fixture.scriptPath, 2_000);
    const results = await Promise.all(
      ["round-1", "round-2"].map((sourceFileStableId) =>
        provider.parseRound({
          replayPath: fixture.replayPath,
          sourceFileStableId,
        }),
      ),
    );
    expect(results.map((result) => result.round.sourceFileStableId)).toEqual([
      "round-1",
      "round-2",
    ]);
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

describe("replay provider outcome classification", () => {
  const unsupportedFailure = {
    failureKind: "UNSUPPORTED_REPLAY_VERSION" as const,
    internalErrorCode: "REPLAY_PROVIDER_OPERATOR_UNKNOWN",
    safeSummary: "Unsupported operator.",
    suggestedAction: "Update.",
    stderrPreview: "",
    stdoutPreview: "",
    exitCode: 2,
    terminationSignal: null,
    timedOut: false,
    replayReadStarted: true,
    unsupportedVersion: true,
    processingDurationMs: 10,
  };

  it("keeps one failed round and successful rounds as an honest partial result", () => {
    expect(
      decideReplayParseOutcome({
        totalRoundCount: 3,
        successfulRoundCount: 2,
        failures: [unsupportedFailure],
      }),
    ).toEqual({
      runStatus: "PARTIAL",
      packageStatus: "PARTIALLY_PARSED",
      allFailedRoundsUnsupported: true,
    });
  });

  it("separates a fully unsupported replay from a successful correction", () => {
    expect(
      decideReplayParseOutcome({
        totalRoundCount: 1,
        successfulRoundCount: 0,
        failures: [unsupportedFailure],
      }).packageStatus,
    ).toBe("UNSUPPORTED_REPLAY");
    expect(
      decideReplayParseOutcome({
        totalRoundCount: 1,
        successfulRoundCount: 1,
        failures: [],
      }).runStatus,
    ).toBe("COMPLETED");
  });

  it("redacts private absolute paths from provider text", () => {
    expect(
      sanitizeReplayProviderText(
        "failed at /Users/PrivateName/Documents/replay.rec",
      ),
    ).toBe("failed at <private-absolute-path>");
  });
});
