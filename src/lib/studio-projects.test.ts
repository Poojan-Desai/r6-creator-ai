import { describe, expect, it } from "vitest";

import {
  buildStudioInputSpecs,
  studioProjectSettingsSchema,
} from "@/lib/studio-projects";

const base = {
  name: "Ranked story",
  outputGoal: "YOUTUBE_SHORT" as const,
  inputMode: "SCREEN_RECORDING_ONLY" as const,
  referenceMode: "NONE" as const,
  focusAreas: ["Best kills"],
  contentInstructions: "Keep enough setup to understand the final play.",
  coachingGoals: "",
  primaryRecordingId: "recording-one",
  additionalRecordingIds: [],
  replayPackageId: null,
  referenceVideoId: null,
  styleProfileId: null,
  selectedPlayerStableId: null,
  selectedAudioTrackId: null,
  mapId: null,
  mapVersionId: null,
  bombSiteId: null,
  side: "UNKNOWN" as const,
  operatorId: null,
  operatorVersionId: null,
  roundResult: null,
  contextUserConfirmed: false,
};

describe("unified Studio Project settings", () => {
  it("accepts recording-only mode and creates one primary input", () => {
    const settings = studioProjectSettingsSchema.parse(base);
    expect(buildStudioInputSpecs(settings)).toEqual([
      {
        kind: "PRIMARY_RECORDING",
        videoProjectId: "recording-one",
        sortOrder: 0,
      },
    ]);
  });

  it("requires both inputs for combined mode", () => {
    expect(() =>
      studioProjectSettingsSchema.parse({
        ...base,
        inputMode: "SCREEN_RECORDING_AND_REPLAY",
      }),
    ).toThrow(/requires both/i);
  });

  it("supports replay-only work without inventing a video input", () => {
    const settings = studioProjectSettingsSchema.parse({
      ...base,
      inputMode: "MATCH_REPLAY_ONLY",
      primaryRecordingId: null,
      replayPackageId: "replay-one",
      selectedPlayerStableId: "player-stable-one",
    });
    expect(buildStudioInputSpecs(settings)).toEqual([
      {
        kind: "MATCH_REPLAY",
        replayPackageId: "replay-one",
        sortOrder: 0,
      },
    ]);
  });

  it("keeps primary, additional, replay, and reference inputs distinct", () => {
    const settings = studioProjectSettingsSchema.parse({
      ...base,
      inputMode: "SCREEN_RECORDING_AND_REPLAY",
      additionalRecordingIds: ["recording-two", "recording-three"],
      replayPackageId: "replay-one",
      referenceMode: "LOCAL_REFERENCE",
      referenceVideoId: "reference-one",
    });
    expect(buildStudioInputSpecs(settings)).toEqual([
      {
        kind: "PRIMARY_RECORDING",
        videoProjectId: "recording-one",
        sortOrder: 0,
      },
      {
        kind: "ADDITIONAL_RECORDING",
        videoProjectId: "recording-two",
        sortOrder: 1,
      },
      {
        kind: "ADDITIONAL_RECORDING",
        videoProjectId: "recording-three",
        sortOrder: 2,
      },
      {
        kind: "MATCH_REPLAY",
        replayPackageId: "replay-one",
        sortOrder: 0,
      },
      {
        kind: "LOCAL_REFERENCE",
        referenceVideoId: "reference-one",
        sortOrder: 0,
      },
    ]);
  });

  it("rejects a mismatched reference choice", () => {
    expect(() =>
      studioProjectSettingsSchema.parse({
        ...base,
        referenceMode: "STYLE_PROFILE",
        referenceVideoId: "reference-one",
      }),
    ).toThrow(/style profile/i);
  });

  it("rejects duplicate or primary-as-additional recordings", () => {
    expect(() =>
      studioProjectSettingsSchema.parse({
        ...base,
        additionalRecordingIds: ["recording-one"],
      }),
    ).toThrow(/cannot also be an additional/i);
    expect(() =>
      studioProjectSettingsSchema.parse({
        ...base,
        additionalRecordingIds: ["recording-two", "recording-two"],
      }),
    ).toThrow(/only once/i);
  });

  it("requires audio and player selections to belong to an applicable input", () => {
    expect(() =>
      studioProjectSettingsSchema.parse({
        ...base,
        inputMode: "MATCH_REPLAY_ONLY",
        primaryRecordingId: null,
        replayPackageId: "replay-one",
        selectedAudioTrackId: "track-one",
      }),
    ).toThrow(/audio track requires/i);
    expect(() =>
      studioProjectSettingsSchema.parse({
        ...base,
        selectedPlayerStableId: "player-one",
      }),
    ).toThrow(/player requires/i);
  });
});
