import { describe, expect, it } from "vitest";

import {
  createEvidenceBoundedLongFormPlan,
  longFormSettingsSchema,
} from "@/lib/long-form-productions";
import {
  addLongFormTimelineItem,
  calculateLongFormTimelineMetrics,
  createLongFormTimelineFromPlan,
  createLongFormTimelineItem,
  deleteLongFormTimelineSection,
  duplicateLongFormTimelineSection,
  longFormTimelineDocumentSchema,
  moveLongFormTimelineItem,
  moveLongFormTimelineSection,
  rebalanceLongFormTimeline,
  replaceLongFormTimelineSection,
} from "@/lib/long-form-timeline-document";

function makeTimeline() {
  const settings = longFormSettingsSchema.parse({
    targetDurationSeconds: 1_200,
    storytellingStyle: "STORYTELLING",
    energyLevel: 60,
    humorLevel: 40,
    educationalLevel: 30,
    liveGameplayPercent: 75,
    voiceoverPercent: 25,
    matchOrRoundLimit: 4,
    excludeWeakSections: true,
    includeLosses: true,
    chronologicalOrder: true,
  });
  const plan = createEvidenceBoundedLongFormPlan({
    projectName: "Timeline fixture",
    focusAreas: ["Full ranked-match story"],
    contentInstructions: null,
    context: [],
    recordings: [
      {
        id: "source",
        name: "Owned source",
        durationSeconds: 1_238.157,
        sortOrder: 0,
      },
    ],
    candidates: [],
    selectedMatchesAndRounds: [],
    settings,
  });
  return createLongFormTimelineFromPlan({
    plan,
    sourcePlanRevisionId: "plan-revision",
    sourcePlanVersion: 1,
    sources: [
      {
        projectId: "source",
        name: "Owned source",
        durationSeconds: 1_238.157,
      },
    ],
  });
}

describe("U4 lockable long-form timeline", () => {
  it("creates a contiguous 20-minute horizontal timeline from the plan", () => {
    const timeline = makeTimeline();
    expect(longFormTimelineDocumentSchema.parse(timeline)).toEqual(timeline);
    expect(timeline.currentDurationSeconds).toBe(1_200);
    expect(timeline.aspectRatio).toBe("HORIZONTAL_16_9");
    expect(timeline.sections).toHaveLength(10);
    expect(timeline.items).toHaveLength(10);
    expect(timeline.items.at(-1)?.timelineStartSeconds).toBe(1_158);
  });

  it("fits unlocked footage while preserving a locked section", () => {
    let timeline = makeTimeline();
    const lockedSection = {
      ...timeline.sections.at(-1)!,
      locked: true,
    };
    timeline = replaceLongFormTimelineSection(timeline, lockedSection);
    const lockedItemBefore = timeline.items.find(
      (item) => item.sectionId === lockedSection.id,
    )!;
    const result = rebalanceLongFormTimeline(timeline, 1_100);
    const lockedItemAfter = result.document.items.find(
      (item) => item.id === lockedItemBefore.id,
    )!;

    expect(result.fitted).toBe(true);
    expect(result.document.currentDurationSeconds).toBe(1_100);
    expect(lockedItemAfter.sourceStartSeconds).toBe(
      lockedItemBefore.sourceStartSeconds,
    );
    expect(lockedItemAfter.sourceEndSeconds).toBe(
      lockedItemBefore.sourceEndSeconds,
    );
    expect(result.document.sections.at(-1)?.locked).toBe(true);
  });

  it("reports an honest shortfall when every section is locked", () => {
    const timeline = makeTimeline();
    const locked = {
      ...timeline,
      sections: timeline.sections.map((section) => ({
        ...section,
        locked: true,
      })),
    };
    const result = rebalanceLongFormTimeline(locked, 1_000);
    expect(result.fitted).toBe(false);
    expect(result.document.currentDurationSeconds).toBe(1_200);
    expect(result.warnings.join(" ")).toMatch(/locked/i);
  });

  it("supports cards and refuses to move a locked video item", () => {
    let timeline = makeTimeline();
    const card = createLongFormTimelineItem({
      id: "card",
      sectionId: timeline.sections[0]!.id,
      kind: "CARD",
      track: "VIDEO",
      order: 1,
      durationSeconds: 2,
      text: "Round recap",
      reason: "User-created recap card.",
    });
    timeline = addLongFormTimelineItem(timeline, card);
    const locked = { ...timeline.items[0]!, locked: true };
    timeline = {
      ...timeline,
      items: timeline.items.map((item) =>
        item.id === locked.id ? locked : item,
      ),
    };
    const moved = moveLongFormTimelineItem(timeline, locked.id, 1);
    expect(moved.items[0]?.id).toBe(locked.id);
    expect(calculateLongFormTimelineMetrics(timeline)).toMatchObject({
      cardAndTransitionSeconds: 2,
      sectionCount: 10,
      requiredCuts: 10,
    });
  });

  it("reorders, duplicates, and deletes unlocked sections without broken references", () => {
    const timeline = makeTimeline();
    const second = timeline.sections[1]!;
    const moved = moveLongFormTimelineSection(timeline, second.id, -1);
    expect(moved.sections[0]?.id).toBe(second.id);
    const sourceItems = moved.items.filter(
      (item) => item.sectionId === second.id,
    );
    const duplicated = duplicateLongFormTimelineSection(
      moved,
      second.id,
      "section-copy",
      sourceItems.map((_, index) => `copy-${index}`),
    );
    expect(duplicated.sections[1]).toMatchObject({
      id: "section-copy",
      locked: false,
    });
    expect(
      duplicated.items.some((item) => item.sectionId === "section-copy"),
    ).toBe(true);
    const deleted = deleteLongFormTimelineSection(duplicated, "section-copy");
    expect(
      deleted.items.some((item) => item.sectionId === "section-copy"),
    ).toBe(false);
    expect(() => longFormTimelineDocumentSchema.parse(deleted)).not.toThrow();
  });
});
