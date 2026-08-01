import { describe, expect, it } from "vitest";

import {
  normalizeSharedEvidenceClass,
  SHARED_EVIDENCE_CONTRACT_VERSION,
} from "@/lib/evidence-inspector";

describe("U7 shared creator and coaching evidence contract", () => {
  it("keeps replay fact, observation, transcript, inference, conflict, and unknown separate", () => {
    expect(
      normalizeSharedEvidenceClass("COACHING", "REPLAY_CONFIRMED_FACT"),
    ).toBe("VERIFIED_REPLAY_FACT");
    expect(
      normalizeSharedEvidenceClass("COACHING", "DIRECT_VIDEO_OBSERVATION"),
    ).toBe("DIRECT_VIDEO_OBSERVATION");
    expect(
      normalizeSharedEvidenceClass("COACHING", "TRANSCRIPT_EVIDENCE"),
    ).toBe("TRANSCRIPT_STATEMENT");
    expect(normalizeSharedEvidenceClass("COACHING", "INFERENCE")).toBe(
      "INFERENCE",
    );
    expect(
      normalizeSharedEvidenceClass("COACHING", "CONFLICTING_EVIDENCE"),
    ).toBe("CONFLICT");
    expect(normalizeSharedEvidenceClass("COACHING", "MISSING_CONTEXT")).toBe(
      "UNKNOWN",
    );
  });

  it("never upgrades a Voiceover Studio inference or unknown into a fact", () => {
    expect(normalizeSharedEvidenceClass("VOICEOVER", "INFERENCE")).toBe(
      "INFERENCE",
    );
    expect(normalizeSharedEvidenceClass("VOICEOVER", "UNKNOWN")).toBe(
      "UNKNOWN",
    );
    expect(
      normalizeSharedEvidenceClass("VOICEOVER", "USER_CONFIRMED_CONTEXT"),
    ).toBe("USER_CONFIRMED_CONTEXT");
    expect(SHARED_EVIDENCE_CONTRACT_VERSION).toBe(
      "r6-creator-shared-evidence/v1",
    );
  });
});
