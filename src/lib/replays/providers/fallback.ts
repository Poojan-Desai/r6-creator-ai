import { AppError } from "@/lib/errors";
import { ReplayProviderExecutionError } from "@/lib/replays/providers/provider-error";
import type {
  ReplayParserProvider,
  ReplayProviderParseResult,
} from "@/lib/replays/providers/types";

export async function parseReplayRoundWithFallback(input: {
  providers: ReplayParserProvider[];
  replayPath: string;
  sourceFileStableId: string;
  signal?: AbortSignal;
  onProgress?: (progress: number, stage: string) => void;
  onChild?: (child: import("node:child_process").ChildProcess) => void;
}): Promise<{
  provider: ReplayParserProvider;
  result: ReplayProviderParseResult;
  failedProviders: Array<{
    providerId: string;
    internalErrorCode: string;
  }>;
}> {
  const failedProviders: Array<{
    providerId: string;
    internalErrorCode: string;
  }> = [];
  let lastError: unknown = null;

  for (const provider of input.providers) {
    if (input.signal?.aborted) {
      throw new AppError(
        "Replay parsing was cancelled.",
        409,
        "REPLAY_PARSE_CANCELLED",
      );
    }
    const readiness = await provider.inspectReadiness();
    if (!readiness.ready) {
      failedProviders.push({
        providerId: provider.id,
        internalErrorCode: "REPLAY_PROVIDER_UNAVAILABLE",
      });
      continue;
    }
    try {
      const result = await provider.parseRound({
        replayPath: input.replayPath,
        sourceFileStableId: input.sourceFileStableId,
        signal: input.signal,
        onProgress: input.onProgress,
        onChild: input.onChild,
      });
      return { provider, result, failedProviders };
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === "REPLAY_PARSE_CANCELLED"
      ) {
        throw error;
      }
      lastError = error;
      failedProviders.push({
        providerId: provider.id,
        internalErrorCode:
          error instanceof ReplayProviderExecutionError
            ? error.diagnostics.internalErrorCode
            : error instanceof AppError
              ? error.code
              : "REPLAY_PROVIDER_UNKNOWN_FAILURE",
      });
    }
  }

  if (lastError) throw lastError;
  throw new AppError(
    "No reviewed local replay provider is currently available.",
    503,
    "REPLAY_PROVIDER_UNAVAILABLE",
  );
}
