import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { appConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import type {
  ParsedReplayRound,
  ReplayParserProvider,
} from "@/lib/replays/providers/types";

export const R6_DISSECT_PROVIDER_ID = "redraskal.r6-dissect";
export const R6_DISSECT_PROVIDER_COMMIT =
  "e6c2ca80f7f895e320ca0f8ded0f30136888ffac";
export const R6_DISSECT_PROVIDER_VERSION = "source-e6c2ca80-2025-09-15";

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
  }>((resolve, reject) => {
    const child = spawn(input.executablePath, [input.replayPath], {
      cwd: path.dirname(input.replayPath),
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
    let pendingTerminationError: Error | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      input.signal?.removeEventListener("abort", abort);
      if (error) reject(error);
    };
    const terminate = (error: Error) => {
      if (settled || pendingTerminationError) return;
      pendingTerminationError = error;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 3_000);
      killTimer.unref();
    };
    const abort = () => {
      terminate(
        new AppError(
          "Replay parsing was cancelled. No partial canonical data was saved.",
          409,
          "REPLAY_PARSE_CANCELLED",
        ),
      );
    };
    const timeout = setTimeout(() => {
      terminate(
        new AppError(
          "The replay parser exceeded the two-minute per-round limit.",
          504,
          "REPLAY_PARSE_TIMEOUT",
        ),
      );
    }, input.timeoutMs ?? 120_000);
    input.signal?.addEventListener("abort", abort, { once: true });
    if (input.signal?.aborted) {
      abort();
      return;
    }
    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > 50 * 1024 * 1024) {
        terminate(
          new AppError(
            "Replay parser output exceeded the 50 MB safety limit.",
            413,
            "REPLAY_PARSE_OUTPUT_LIMIT",
          ),
        );
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
    child.on("error", (error) => finish(error));
    child.on("close", (code, signal) => {
      if (settled) return;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      input.signal?.removeEventListener("abort", abort);
      if (pendingTerminationError) {
        settled = true;
        reject(pendingTerminationError);
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code !== 0) {
        settled = true;
        reject(
          new AppError(
            `The local replay parser stopped with ${signal ? `signal ${signal}` : `exit code ${code}`}.`,
            422,
            "REPLAY_PARSE_FAILED",
          ),
        );
        return;
      }
      settled = true;
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr,
        durationMs: Math.round(performance.now() - started),
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
    supportedReplayVersions: ["Y8S1–Y9S1 verified by upstream fixtures"],
    claimedCapabilities: [
      "MATCH_METADATA",
      "ROUND_METADATA",
      "PLAYERS",
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
        return {
          ready: true,
          binarySha256: await fileSha256(executablePath),
          message: "Reviewed MIT parser binary is available locally.",
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
        timeoutMs,
        signal: input.signal,
        onProgress: input.onProgress,
        onChild: input.onChild,
      });
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(result.stdout);
      } catch {
        throw new AppError(
          "The replay parser returned malformed JSON.",
          422,
          "REPLAY_PARSE_INVALID_JSON",
        );
      }
      const parsed = r6DissectOutputSchema.safeParse(parsedJson);
      if (!parsed.success) {
        throw new AppError(
          "The replay parser output did not match the reviewed schema.",
          422,
          "REPLAY_PARSE_SCHEMA_INVALID",
        );
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
        ],
        stdoutPreview: preview(result.stdout),
        stderrPreview: preview(result.stderr),
        processingDurationMs: result.durationMs,
      };
    },
  };
}

export const r6DissectReplayProvider = createR6DissectReplayProvider();

export { normalizeOutput as normalizeR6DissectOutput, r6DissectOutputSchema };
