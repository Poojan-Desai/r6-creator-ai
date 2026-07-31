import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { appConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import {
  classifyReplayProviderFailure,
  ReplayProviderExecutionError,
  sanitizeReplayProviderText,
} from "@/lib/replays/providers/provider-error";
import type {
  ParsedReplayRound,
  ReplayParserProvider,
} from "@/lib/replays/providers/types";

export const R6_DISSECT_PROVIDER_ID = "redraskal.r6-dissect";
export const R6_DISSECT_PROVIDER_COMMIT =
  "e6c2ca80f7f895e320ca0f8ded0f30136888ffac";
export const R6_DISSECT_PROVIDER_VERSION =
  "source-e6c2ca80+compat-1-2026-07-31";
export const R6_DISSECT_PATCH_ID = "r6-dissect-y11s2-solid-snake";

const replayParserManifestSchema = z.object({
  provider: z.object({
    id: z.literal(R6_DISSECT_PROVIDER_ID),
    commit: z.literal(R6_DISSECT_PROVIDER_COMMIT),
    version: z.literal(R6_DISSECT_PROVIDER_VERSION),
    license: z.literal("MIT"),
  }),
  binarySha256: z.string().length(64),
  compatibilityPatch: z.object({
    id: z.literal(R6_DISSECT_PATCH_ID),
    sha256: z.string().length(64),
  }),
});

const typeNameSchema = z
  .object({
    name: z.string().optional().nullable(),
  })
  .passthrough();

const r6DissectOutputSchema = z
  .object({
    gameVersion: z.string().optional().nullable(),
    codeVersion: z.number().optional().nullable(),
    timestamp: z.string().optional().nullable(),
    matchType: z.union([z.string(), typeNameSchema]).optional().nullable(),
    map: z.union([z.string(), typeNameSchema]).optional().nullable(),
    site: z.string().optional().nullable(),
    recordingPlayerID: z.union([z.string(), z.number()]).optional().nullable(),
    recordingProfileID: z.string().optional().nullable(),
    gamemode: z.union([z.string(), typeNameSchema]).optional().nullable(),
    roundNumber: z.number().optional().nullable(),
    matchID: z.string().optional().nullable(),
    teams: z
      .array(
        z
          .object({
            name: z.string().optional().nullable(),
            score: z.number().optional().nullable(),
            won: z.boolean().optional().nullable(),
            winCondition: z.string().optional().nullable(),
            role: z.string().optional().nullable(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
    players: z
      .array(
        z
          .object({
            id: z.union([z.string(), z.number()]).optional().nullable(),
            profileID: z.string().optional().nullable(),
            username: z.string().optional().nullable(),
            teamIndex: z.number().optional().nullable(),
            operator: z
              .object({ name: z.string().optional().nullable() })
              .passthrough()
              .optional()
              .nullable(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
    matchFeedback: z
      .array(
        z
          .object({
            type: z.union([z.string(), typeNameSchema]),
            username: z.string().optional().nullable(),
            target: z.string().optional().nullable(),
            headshot: z.boolean().optional().nullable(),
            time: z.string().optional().nullable(),
            timeInSeconds: z.number().optional().nullable(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
  })
  .passthrough();

function objectName(
  value: string | { name?: string | null } | null | undefined,
) {
  if (typeof value === "string") return value;
  return value?.name ?? null;
}

function preview(value: string, maxLength = 16_000) {
  return value.slice(0, maxLength);
}

async function fileSha256(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export function buildR6DissectInvocation(
  executablePath: string,
  replayPath: string,
) {
  return {
    executablePath,
    arguments: ["--format", "json", replayPath],
    workingDirectory: path.dirname(replayPath),
  };
}

function normalizeOutput(
  output: z.infer<typeof r6DissectOutputSchema>,
  sourceFileStableId: string,
): ParsedReplayRound {
  const recordingId =
    output.recordingPlayerID === undefined || output.recordingPlayerID === null
      ? null
      : String(output.recordingPlayerID);
  return {
    sourceFileStableId,
    gameVersion: output.gameVersion ?? null,
    codeVersion: output.codeVersion ?? null,
    matchId: output.matchID ?? null,
    timestamp: output.timestamp ?? null,
    matchType: objectName(output.matchType),
    mapName: objectName(output.map),
    site: output.site ?? null,
    gameMode: objectName(output.gamemode),
    // r6-dissect exposes the replay header's zero-based round number.
    // Normalize it once at the provider boundary for the app-owned model.
    roundNumber:
      output.roundNumber === null || output.roundNumber === undefined
        ? null
        : output.roundNumber + 1,
    recordingPlayerId: recordingId,
    recordingProfileId: output.recordingProfileID ?? null,
    teams: output.teams.map((team) => ({
      name: team.name ?? null,
      score: team.score ?? null,
      won: team.won ?? null,
      winCondition: team.winCondition ?? null,
      role: team.role ?? null,
    })),
    players: output.players.map((player, index) => {
      const rawId =
        player.id === undefined || player.id === null
          ? `player-${index + 1}`
          : String(player.id);
      return {
        replayLocalId: player.profileID || rawId,
        rawUsername: player.username ?? null,
        rawProfileId: player.profileID ?? null,
        teamIndex: player.teamIndex ?? null,
        operatorName: player.operator?.name ?? null,
        isRecordingPlayer:
          (output.recordingProfileID !== null &&
            output.recordingProfileID !== undefined &&
            player.profileID === output.recordingProfileID) ||
          rawId === recordingId,
      };
    }),
    feedback: output.matchFeedback.map((event) => ({
      type: objectName(event.type) ?? "Other",
      username: event.username ?? null,
      target: event.target ?? null,
      headshot: event.headshot ?? null,
      timeLabel: event.time ?? null,
      timeInSeconds: event.timeInSeconds ?? null,
    })),
    rawOutput: output,
  };
}

export async function runR6DissectProcess(input: {
  executablePath: string;
  replayPath: string;
  sourceFileStableId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number, stage: string) => void;
  onChild?: (child: ChildProcess) => void;
}) {
  const started = performance.now();
  if (input.signal?.aborted) {
    throw new AppError(
      "Replay parsing was cancelled. No partial canonical data was saved.",
      409,
      "REPLAY_PARSE_CANCELLED",
    );
  }
  input.onProgress?.(10, "Starting reviewed local replay parser");
  return new Promise<{
    stdout: string;
    stderr: string;
    durationMs: number;
    exitCode: 0;
    terminationSignal: null;
    timedOut: false;
    replayReadStarted: true;
    executableLabel: string;
    sanitizedArguments: string[];
    sanitizedWorkingDirectory: string;
  }>((resolve, reject) => {
    const invocation = buildR6DissectInvocation(
      input.executablePath,
      input.replayPath,
    );
    const child = spawn(invocation.executablePath, invocation.arguments, {
      cwd: invocation.workingDirectory,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        LANG: "C",
        LC_ALL: "C",
      },
    }) as ChildProcess;
    input.onChild?.(child);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;
    let pendingTermination: "cancelled" | "timeout" | undefined;
    const durationMs = () => Math.round(performance.now() - started);
    const diagnosticsFor = (options: {
      code: number | null;
      signal: NodeJS.Signals | null;
      timedOut?: boolean;
      spawnErrorCode?: string | null;
    }) =>
      classifyReplayProviderFailure({
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        stdoutBytes,
        exitCode: options.code,
        terminationSignal: options.signal,
        timedOut: options.timedOut ?? false,
        processingDurationMs: durationMs(),
        spawnErrorCode: options.spawnErrorCode,
      });
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      input.signal?.removeEventListener("abort", abort);
      if (error) reject(error);
    };
    const terminate = (reason: "cancelled" | "timeout") => {
      if (settled || pendingTermination) return;
      pendingTermination = reason;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 3_000);
      killTimer.unref();
    };
    const abort = () => {
      terminate("cancelled");
    };
    const timeout = setTimeout(() => {
      terminate("timeout");
    }, input.timeoutMs ?? 120_000);
    input.signal?.addEventListener("abort", abort, { once: true });
    if (input.signal?.aborted) {
      abort();
      return;
    }
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > 50 * 1024 * 1024) {
        pendingTermination = "cancelled";
        finish(
          new AppError(
            "Replay parser output exceeded the 50 MB safety limit.",
            413,
            "REPLAY_PARSE_OUTPUT_LIMIT",
          ),
        );
        child.kill("SIGTERM");
        return;
      }
      stdoutChunks.push(chunk);
      input.onProgress?.(65, "Validating replay parser output");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrBytes < 1024 * 1024) {
        stderrChunks.push(chunk);
        stderrBytes += chunk.length;
      }
    });
    child.on("error", (error: NodeJS.ErrnoException) =>
      finish(
        new ReplayProviderExecutionError(
          diagnosticsFor({
            code: null,
            signal: null,
            spawnErrorCode: error.code,
          }),
        ),
      ),
    );
    child.on("close", (code, signal) => {
      if (settled) return;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      input.signal?.removeEventListener("abort", abort);
      if (pendingTermination === "cancelled") {
        settled = true;
        reject(
          new AppError(
            "Replay parsing was cancelled. No partial canonical data was saved.",
            409,
            "REPLAY_PARSE_CANCELLED",
          ),
        );
        return;
      }
      if (pendingTermination === "timeout") {
        settled = true;
        reject(
          new ReplayProviderExecutionError(
            diagnosticsFor({ code, signal, timedOut: true }),
          ),
        );
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0) {
        settled = true;
        reject(
          new ReplayProviderExecutionError(diagnosticsFor({ code, signal })),
        );
        return;
      }
      settled = true;
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr,
        durationMs: durationMs(),
        exitCode: 0,
        terminationSignal: null,
        timedOut: false,
        replayReadStarted: true,
        executableLabel: "data/tools/replay-parsers/r6-dissect",
        sanitizedArguments: [
          "--format",
          "json",
          `<replay-file:${input.sourceFileStableId ?? "selected"}>`,
        ],
        sanitizedWorkingDirectory: "<app-managed-round-directory>",
      });
    });
  });
}

export function createR6DissectReplayProvider(
  executablePath = appConfig.r6DissectPath,
  timeoutMs = 120_000,
): ReplayParserProvider {
  return {
    id: R6_DISSECT_PROVIDER_ID,
    displayName: "r6-dissect",
    version: R6_DISSECT_PROVIDER_VERSION,
    sourceCommit: R6_DISSECT_PROVIDER_COMMIT,
    license: "MIT",
    supportedReplayVersions: [
      "Y8S1–Y9S1 verified by upstream fixtures",
      "Y11S2_Alpha04 verified on one user-approved real replay with the fingerprinted compatibility patch",
    ],
    claimedCapabilities: [
      "MATCH_METADATA",
      "MAP",
      "GAME_MODE",
      "ROUND_METADATA",
      "PLAYERS",
      "TEAMS",
      "OPERATORS",
      "KILLS",
      "DEATHS",
      "HEADSHOTS",
      "OBJECTIVE_EVENTS",
      "DEFUSER_EVENTS",
      "SCORES",
    ],
    executablePath,
    async inspectReadiness() {
      try {
        await access(executablePath);
        const binarySha256 = await fileSha256(executablePath);
        if (executablePath !== appConfig.r6DissectPath) {
          return {
            ready: true,
            binarySha256,
            message: "Injected replay parser executable is available.",
          };
        }
        const [manifestText, expectedPatchSha256] = await Promise.all([
          readFile(
            path.join(path.dirname(executablePath), "r6-dissect.manifest.json"),
            "utf8",
          ),
          fileSha256(
            path.join(
              process.cwd(),
              "scripts",
              "replay-parser-patches",
              "r6-dissect-y11s2-solid-snake.patch",
            ),
          ),
        ]);
        const manifest = replayParserManifestSchema.safeParse(
          JSON.parse(manifestText) as unknown,
        );
        if (
          !manifest.success ||
          manifest.data.binarySha256 !== binarySha256 ||
          manifest.data.compatibilityPatch.sha256 !== expectedPatchSha256
        ) {
          return {
            ready: false,
            binarySha256,
            message:
              "The local replay parser is from an older reviewed build. Run npm run replay:setup.",
          };
        }
        return {
          ready: true,
          binarySha256,
          message:
            "Reviewed MIT parser and current-replay compatibility patch are available locally.",
        };
      } catch {
        return {
          ready: false,
          binarySha256: null,
          message:
            "The reviewed replay parser has not been built locally. Run npm run replay:setup.",
        };
      }
    },
    async parseRound(input) {
      input.onProgress?.(5, "Checking replay parser");
      const readiness = await this.inspectReadiness();
      if (!readiness.ready) {
        throw new AppError(
          readiness.message,
          503,
          "REPLAY_PROVIDER_UNAVAILABLE",
        );
      }
      const result = await runR6DissectProcess({
        executablePath: this.executablePath,
        replayPath: input.replayPath,
        sourceFileStableId: input.sourceFileStableId,
        timeoutMs,
        signal: input.signal,
        onProgress: input.onProgress,
        onChild: input.onChild,
      });
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(result.stdout);
      } catch {
        throw new ReplayProviderExecutionError({
          failureKind: "PROVIDER_OUTPUT_VALIDATION_FAILURE",
          internalErrorCode: "REPLAY_PARSE_INVALID_JSON",
          safeSummary: "The replay parser returned malformed JSON.",
          suggestedAction:
            "Keep the imported replay and update the provider adapter before retrying.",
          stderrPreview: sanitizeReplayProviderText(result.stderr),
          stdoutPreview: "Provider stdout was rejected as malformed JSON.",
          exitCode: result.exitCode,
          terminationSignal: result.terminationSignal,
          timedOut: false,
          replayReadStarted: true,
          unsupportedVersion: false,
          processingDurationMs: result.durationMs,
        });
      }
      const parsed = r6DissectOutputSchema.safeParse(parsedJson);
      if (!parsed.success) {
        throw new ReplayProviderExecutionError({
          failureKind: "PROVIDER_OUTPUT_VALIDATION_FAILURE",
          internalErrorCode: "REPLAY_PARSE_SCHEMA_INVALID",
          safeSummary:
            "The replay parser output did not match the reviewed application schema.",
          suggestedAction:
            "Keep the imported replay and update the provider adapter before retrying.",
          stderrPreview: sanitizeReplayProviderText(result.stderr),
          stdoutPreview:
            "Provider stdout failed application schema validation.",
          exitCode: result.exitCode,
          terminationSignal: result.terminationSignal,
          timedOut: false,
          replayReadStarted: true,
          unsupportedVersion: false,
          processingDurationMs: result.durationMs,
        });
      }
      input.onProgress?.(90, "Replay output schema validated");
      return {
        round: normalizeOutput(parsed.data, input.sourceFileStableId),
        warnings: [
          {
            code: "PROVIDER_WORK_IN_PROGRESS",
            message:
              "r6-dissect describes its format as work in progress; every capability remains version-scoped.",
          },
          {
            code: "APPLICATION_COMPATIBILITY_PATCH",
            message:
              "This build includes a fingerprinted MIT compatibility patch for operator ID 444310693746.",
          },
        ],
        stdoutPreview: preview(result.stdout),
        stderrPreview: preview(sanitizeReplayProviderText(result.stderr)),
        processingDurationMs: result.durationMs,
        process: {
          exitCode: result.exitCode,
          terminationSignal: result.terminationSignal,
          timedOut: result.timedOut,
          replayReadStarted: result.replayReadStarted,
          executableLabel: result.executableLabel,
          sanitizedArguments: result.sanitizedArguments,
          sanitizedWorkingDirectory: result.sanitizedWorkingDirectory,
        },
      };
    },
  };
}

export const r6DissectReplayProvider = createR6DissectReplayProvider();

export { normalizeOutput as normalizeR6DissectOutput, r6DissectOutputSchema };
