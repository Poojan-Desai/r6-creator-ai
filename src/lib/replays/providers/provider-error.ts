import { appConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

export type ReplayProviderFailureKindValue =
  | "UNSUPPORTED_REPLAY_VERSION"
  | "MALFORMED_REPLAY_PACKAGE"
  | "PARSER_INVOCATION_FAILURE"
  | "PARSER_DEPENDENCY_FAILURE"
  | "PROVIDER_OUTPUT_VALIDATION_FAILURE"
  | "UNKNOWN_PROVIDER_FAILURE";

export type ReplayProviderDiagnostics = {
  failureKind: ReplayProviderFailureKindValue;
  internalErrorCode: string;
  safeSummary: string;
  suggestedAction: string;
  stderrPreview: string;
  stdoutPreview: string;
  exitCode: number | null;
  terminationSignal: string | null;
  timedOut: boolean;
  replayReadStarted: boolean;
  unsupportedVersion: boolean;
  processingDurationMs: number;
};

export class ReplayProviderExecutionError extends AppError {
  constructor(public readonly diagnostics: ReplayProviderDiagnostics) {
    super(
      diagnostics.safeSummary,
      diagnostics.timedOut ? 504 : 422,
      diagnostics.internalErrorCode,
    );
    this.name = "ReplayProviderExecutionError";
  }
}

export function sanitizeReplayProviderText(value: string, maxLength = 16_000) {
  let sanitized = value.replaceAll(/\u001b\[[0-9;]*m/g, "");
  const replacements: Array<[string, string]> = [
    [appConfig.dataRoot, "<app-data>"],
    [process.cwd(), "<project>"],
  ];
  for (const [privatePath, label] of replacements) {
    sanitized = sanitized.replaceAll(privatePath, label);
  }
  sanitized = sanitized
    .replaceAll(/\/Users\/[^/\s:]+(?:\/[^\s:]+)*/g, "<private-absolute-path>")
    .replaceAll(
      /\/(?:private\/)?(?:tmp|var\/folders)\/[^\s:]+/g,
      "<temporary-path>",
    )
    .replaceAll(
      /(["']?(?:username|profile_?id|recordingProfileID)["']?\s*[:=]\s*)["'][^"']+["']/gi,
      "$1<redacted>",
    );
  return sanitized.slice(0, maxLength);
}

export function classifyReplayProviderFailure(input: {
  stderr: string;
  stdoutBytes: number;
  exitCode: number | null;
  terminationSignal: string | null;
  timedOut: boolean;
  processingDurationMs: number;
  spawnErrorCode?: string | null;
}) {
  const stderrPreview = sanitizeReplayProviderText(input.stderr);
  const normalized = stderrPreview.toLowerCase();
  const replayReadStarted =
    input.stdoutBytes > 0 ||
    /dissect\.(?:\(\*reader\)\.)?read|dissect\.readplayer|main\.writeround/.test(
      normalized,
    );
  const stdoutPreview =
    input.stdoutBytes > 0
      ? `${input.stdoutBytes.toLocaleString("en-US")} stdout bytes were discarded because the provider did not exit successfully.`
      : "No stdout was produced.";

  if (input.timedOut) {
    return {
      failureKind: "UNKNOWN_PROVIDER_FAILURE",
      internalErrorCode: "REPLAY_PARSE_TIMEOUT",
      safeSummary:
        "The local replay parser exceeded its per-round safety limit.",
      suggestedAction:
        "Retry once. If the same round times out again, keep it imported and review the other recovered rounds.",
      stderrPreview,
      stdoutPreview,
      exitCode: input.exitCode,
      terminationSignal: input.terminationSignal,
      timedOut: true,
      replayReadStarted,
      unsupportedVersion: false,
      processingDurationMs: input.processingDurationMs,
    } satisfies ReplayProviderDiagnostics;
  }

  if (
    input.spawnErrorCode === "ENOENT" ||
    input.spawnErrorCode === "EACCES" ||
    input.spawnErrorCode === "ENOEXEC"
  ) {
    return {
      failureKind: "PARSER_DEPENDENCY_FAILURE",
      internalErrorCode: "REPLAY_PROVIDER_EXECUTABLE_FAILED",
      safeSummary:
        "The reviewed replay parser executable could not be started.",
      suggestedAction: "Run npm run replay:setup, then retry this local parse.",
      stderrPreview,
      stdoutPreview,
      exitCode: input.exitCode,
      terminationSignal: input.terminationSignal,
      timedOut: false,
      replayReadStarted: false,
      unsupportedVersion: false,
      processingDurationMs: input.processingDurationMs,
    } satisfies ReplayProviderDiagnostics;
  }

  if (
    /role unknown for operator id|unsupported (?:replay )?version|version (?:is )?not supported/.test(
      normalized,
    )
  ) {
    const unknownOperator = /role unknown for operator id/.test(normalized);
    return {
      failureKind: "UNSUPPORTED_REPLAY_VERSION",
      internalErrorCode: unknownOperator
        ? "REPLAY_PROVIDER_OPERATOR_UNKNOWN"
        : "REPLAY_VERSION_UNSUPPORTED",
      safeSummary: unknownOperator
        ? "This round uses an operator that this parser build does not recognize."
        : "This round appears newer than the reviewed parser can decode.",
      suggestedAction:
        "Update the local reviewed parser, then retry. Other round files will continue independently.",
      stderrPreview,
      stdoutPreview,
      exitCode: input.exitCode,
      terminationSignal: input.terminationSignal,
      timedOut: false,
      replayReadStarted,
      unsupportedVersion: true,
      processingDurationMs: input.processingDurationMs,
    } satisfies ReplayProviderDiagnostics;
  }

  if (
    /usage of |specify a valid match replay|unknown flag|flag provided but not defined/.test(
      normalized,
    )
  ) {
    return {
      failureKind: "PARSER_INVOCATION_FAILURE",
      internalErrorCode: "REPLAY_PROVIDER_INVOCATION_FAILED",
      safeSummary:
        "The application invoked the local replay parser incorrectly.",
      suggestedAction:
        "Update R6 Creator AI before retrying. The imported replay remains safe.",
      stderrPreview,
      stdoutPreview,
      exitCode: input.exitCode,
      terminationSignal: input.terminationSignal,
      timedOut: false,
      replayReadStarted,
      unsupportedVersion: false,
      processingDurationMs: input.processingDurationMs,
    } satisfies ReplayProviderDiagnostics;
  }

  if (
    /unexpected eof|invalid (?:replay|header|magic)|not a (?:valid )?replay|malformed/.test(
      normalized,
    )
  ) {
    return {
      failureKind: "MALFORMED_REPLAY_PACKAGE",
      internalErrorCode: "REPLAY_FILE_MALFORMED",
      safeSummary:
        "The parser could not read a complete valid replay structure from this round file.",
      suggestedAction:
        "Keep the imported package and confirm the replay finished recording before it was copied.",
      stderrPreview,
      stdoutPreview,
      exitCode: input.exitCode,
      terminationSignal: input.terminationSignal,
      timedOut: false,
      replayReadStarted,
      unsupportedVersion: false,
      processingDurationMs: input.processingDurationMs,
    } satisfies ReplayProviderDiagnostics;
  }

  return {
    failureKind: "UNKNOWN_PROVIDER_FAILURE",
    internalErrorCode: "REPLAY_PROVIDER_UNKNOWN_FAILURE",
    safeSummary: input.terminationSignal
      ? `The local replay parser stopped with signal ${input.terminationSignal}.`
      : `The local replay parser stopped with exit code ${input.exitCode ?? "unknown"}.`,
    suggestedAction:
      "Inspect the sanitized diagnostics, then retry only after the cause is understood.",
    stderrPreview,
    stdoutPreview,
    exitCode: input.exitCode,
    terminationSignal: input.terminationSignal,
    timedOut: false,
    replayReadStarted,
    unsupportedVersion: false,
    processingDurationMs: input.processingDurationMs,
  } satisfies ReplayProviderDiagnostics;
}
