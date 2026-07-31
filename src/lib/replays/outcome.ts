import type { ReplayProviderDiagnostics } from "@/lib/replays/providers/provider-error";

export function decideReplayParseOutcome(input: {
  totalRoundCount: number;
  successfulRoundCount: number;
  failures: ReplayProviderDiagnostics[];
}) {
  const failedRoundCount = input.failures.length;
  const allFailedRoundsUnsupported =
    failedRoundCount > 0 &&
    input.failures.every((failure) => failure.unsupportedVersion);

  if (input.successfulRoundCount === input.totalRoundCount) {
    return {
      runStatus: "COMPLETED" as const,
      packageStatus: "PARSED" as const,
      allFailedRoundsUnsupported: false,
    };
  }
  if (input.successfulRoundCount > 0) {
    return {
      runStatus: "PARTIAL" as const,
      packageStatus: "PARTIALLY_PARSED" as const,
      allFailedRoundsUnsupported,
    };
  }
  return {
    runStatus: "ERROR" as const,
    packageStatus: allFailedRoundsUnsupported
      ? ("UNSUPPORTED_REPLAY" as const)
      : ("ERROR" as const),
    allFailedRoundsUnsupported,
  };
}
