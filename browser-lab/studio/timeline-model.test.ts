import { describe, expect, it } from "vitest";
import {
  checkedRange,
  clampTime,
  fitRange,
  positionInWindow,
  trimRange,
  windowAt,
} from "./timeline-model";

describe("non-destructive browser timeline", () => {
  it("clamps seeking, including invalid numbers and source bounds", () => {
    expect(clampTime(-1, 12)).toBe(0);
    expect(clampTime(50, 12)).toBe(12);
    expect(clampTime(NaN, 12)).toBe(0);
    expect(clampTime(1.257, 12)).toBe(1.257);
  });
  it("rejects incomplete/invalid text ranges instead of silently changing them", () => {
    expect(checkedRange(NaN, 5, 12)).toBeNull();
    expect(checkedRange(5, 2, 12)).toBeNull();
    expect(checkedRange(1.25, 7.75, 12)).toEqual({ start: 1.25, end: 7.75 });
  });
  it("keeps handles ordered with the minimum clip length", () => {
    const range = { start: 1, end: 5 };
    expect(trimRange(range, "start", 9, 12)).toEqual({ start: 4.9, end: 5 });
    expect(trimRange(range, "end", -1, 12)).toEqual({ start: 1, end: 1.1 });
    expect(trimRange(range, "start", -9, 12).start).toBe(0);
    expect(trimRange(range, "end", 50, 12).end).toBe(12);
  });
  it("never extends a long recording clip beyond five minutes", () => {
    expect(trimRange({ start: 300, end: 500 }, "start", 0, 21600).start).toBe(
      200,
    );
    expect(trimRange({ start: 300, end: 500 }, "end", 1000, 21600).end).toBe(
      600,
    );
  });
  it("accepts exact decimal five-minute ranges without a floating-point false failure", () => {
    const result = trimRange(
      { start: 212.003, end: 500.003 },
      "end",
      21600,
      21600,
    );
    expect(
      checkedRange(result.start, Number(result.end.toFixed(3)), 21600),
    ).not.toBeNull();
    expect(result.end).toBeCloseTo(512.003, 6);
  });
  it("optionally snaps to tenths without exceeding a fractional source boundary", () => {
    expect(
      trimRange({ start: 1.25, end: 5.75 }, "start", 2.26, 12, true).start,
    ).toBe(2.3);
    expect(
      trimRange({ start: 1.25, end: 5.75 }, "end", 12, 11.957, true).end,
    ).toBe(11.957);
    expect(
      trimRange({ start: 1.25, end: 5.75 }, "start", 2.263, 12).start,
    ).toBe(2.263);
  });
  it("does not mutate saved ranges or accept invalid movement", () => {
    const range = { start: 1, end: 5 };
    trimRange(range, "start", 2, 12);
    expect(range).toEqual({ start: 1, end: 5 });
    expect(trimRange(range, "start", NaN, 12)).toBe(range);
  });
  it("keeps zoom and panning within a six-hour source", () => {
    expect(windowAt(21600, 300, 0)).toEqual({ start: 0, end: 300 });
    expect(windowAt(21600, 300, 21600)).toEqual({ start: 21300, end: 21600 });
    expect(windowAt(12, 100, 6)).toEqual({ start: 0, end: 12 });
    const view = fitRange(21600, { start: 17800.25, end: 17800.75 });
    expect(view.end - view.start).toBe(1);
    expect(positionInWindow(17800.5, view)).toBe(50);
  });
});
