/**
 * Phase 3B.2-O defines this contract for later detector work. No Phase 3B.2
 * implementation creates these results, and a single weak clue must never be
 * promoted to an operator identification.
 */
export type FutureOperatorDetectionSource =
  | "USER_SELECTION"
  | "LOADING_SCREEN_CARD"
  | "HUD_ICON"
  | "SPECTATOR_OVERLAY"
  | "SCOREBOARD"
  | "WEAPON_MODEL"
  | "ABILITY_ICON"
  | "GADGET_ANIMATION"
  | "ABILITY_AUDIO_CUE"
  | "OCR"
  | "TELEMETRY"
  | "TRANSCRIPT"
  | "MATCH_REPLAY"
  | "MANUAL_LABEL";

export type FutureOperatorDetectionStatus =
  | "USER_CONFIRMED_OPERATOR"
  | "POSSIBLE_OPERATOR"
  | "POSSIBLE_GADGET_USE"
  | "ABILITY_RELATED_EVENT"
  | "OPERATOR_UNCERTAIN";

export interface FutureOperatorDetectionResult {
  status: FutureOperatorDetectionStatus;
  possibleOperatorStableId: string | null;
  possibleOperatorVersionStableId: string | null;
  possibleAbilityStableId: string | null;
  possibleGadgetStableId: string | null;
  startSeconds: number;
  peakSeconds: number;
  endSeconds: number;
  confidence: number;
  supportingEvidence: Array<{
    source: FutureOperatorDetectionSource;
    description: string;
  }>;
  conflictingEvidence: Array<{
    source: FutureOperatorDetectionSource;
    description: string;
  }>;
  alternativeOperatorStableIds: string[];
  missingEvidence: string[];
  operatorVersionCompatibility: "COMPATIBLE" | "INCOMPATIBLE" | "UNKNOWN";
}

export const FUTURE_OPERATOR_GROUND_TRUTH_CATEGORIES = [
  "OPERATOR_SELECTED",
  "OPERATOR_VISIBLE",
  "UNIQUE_ABILITY_EQUIPPED",
  "UNIQUE_ABILITY_DEPLOYED",
  "UNIQUE_ABILITY_ACTIVATED",
  "UNIQUE_ABILITY_DESTROYED",
  "UNIQUE_ABILITY_DISABLED",
  "UNIQUE_ABILITY_SUCCESSFUL",
  "UNIQUE_ABILITY_UNSUCCESSFUL",
  "GADGET_INTERACTION",
  "GADGET_COUNTER",
  "OPERATOR_SYNERGY",
  "OPERATOR_MISTAKE",
  "MISSED_UTILITY_OPPORTUNITY",
  "UTILITY_SAVED",
  "UTILITY_WASTED",
  "OPERATOR_EDUCATIONAL_MOMENT",
] as const;

export type FutureOperatorGroundTruthCategory =
  (typeof FUTURE_OPERATOR_GROUND_TRUTH_CATEGORIES)[number];
