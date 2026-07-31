export type ReplayProviderCapability =
  | "MATCH_METADATA"
  | "MAP"
  | "GAME_MODE"
  | "ROUND_METADATA"
  | "PLAYERS"
  | "TEAMS"
  | "OPERATORS"
  | "KILLS"
  | "DEATHS"
  | "HEADSHOTS"
  | "DBNO"
  | "ASSISTS"
  | "OBJECTIVE_EVENTS"
  | "DEFUSER_EVENTS"
  | "SCORES"
  | "TIMER"
  | "POSITIONS"
  | "POSITION_TIMESTAMPS"
  | "VIEW_YAW"
  | "VIEW_PITCH"
  | "ORIENTATION"
  | "STANCE"
  | "HEALTH"
  | "WEAPONS"
  | "AMMUNITION"
  | "SHOTS"
  | "DAMAGE"
  | "GADGETS"
  | "REINFORCEMENTS"
  | "DRONES"
  | "DESTRUCTION"
  | "CAMERA_TARGET"
  | "PLAYER_POV_RECONSTRUCTION"
  | "ORIGINAL_VIDEO"
  | "ORIGINAL_AUDIO";

export type ProviderWarning = {
  code: string;
  message: string;
};

export type ParsedReplayTeam = {
  name: string | null;
  score: number | null;
  won: boolean | null;
  winCondition: string | null;
  role: string | null;
};

export type ParsedReplayPlayer = {
  replayLocalId: string;
  rawUsername: string | null;
  rawProfileId: string | null;
  teamIndex: number | null;
  operatorName: string | null;
  isRecordingPlayer: boolean;
};

export type ParsedReplayFeedback = {
  type: string;
  username: string | null;
  target: string | null;
  headshot: boolean | null;
  timeLabel: string | null;
  timeInSeconds: number | null;
};

export type ParsedReplayRound = {
  sourceFileStableId: string;
  gameVersion: string | null;
  codeVersion: number | null;
  matchId: string | null;
  timestamp: string | null;
  matchType: string | null;
  mapName: string | null;
  site: string | null;
  gameMode: string | null;
  roundNumber: number | null;
  recordingPlayerId: string | null;
  recordingProfileId: string | null;
  teams: ParsedReplayTeam[];
  players: ParsedReplayPlayer[];
  feedback: ParsedReplayFeedback[];
  rawOutput: unknown;
};

export type ReplayProviderParseResult = {
  round: ParsedReplayRound;
  warnings: ProviderWarning[];
  stdoutPreview: string;
  stderrPreview: string;
  processingDurationMs: number;
  process: {
    exitCode: number;
    terminationSignal: null;
    timedOut: false;
    replayReadStarted: true;
    executableLabel: string;
    sanitizedArguments: string[];
    sanitizedWorkingDirectory: string;
  };
};

export type ReplayParserProvider = {
  id: string;
  displayName: string;
  version: string;
  sourceCommit: string;
  license: string;
  supportedReplayVersions: string[];
  claimedCapabilities: ReplayProviderCapability[];
  executablePath: string;
  inspectReadiness(): Promise<{
    ready: boolean;
    binarySha256: string | null;
    message: string;
  }>;
  parseRound(input: {
    replayPath: string;
    sourceFileStableId: string;
    signal?: AbortSignal;
    onProgress?: (progress: number, stage: string) => void;
    onChild?: (child: import("node:child_process").ChildProcess) => void;
  }): Promise<ReplayProviderParseResult>;
};
