import { MAX_CLIP_SECONDS, validateRange } from "./model";

export type TimeRange = { start: number; end: number };
const round = (seconds: number) => Math.round(seconds * 1000) / 1000;
export function clampTime(seconds: number, duration: number) {
  if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0)
    return 0;
  return Math.max(0, Math.min(duration, seconds));
}
export function checkedRange(
  start: number,
  end: number,
  duration: number,
): TimeRange | null {
  try {
    validateRange(start, end, duration);
    return { start, end };
  } catch {
    return null;
  }
}
export function trimRange(
  range: TimeRange,
  edge: "start" | "end",
  value: number,
  duration: number,
  snap = false,
): TimeRange {
  if (
    !checkedRange(range.start, range.end, duration) ||
    !Number.isFinite(value)
  )
    return range;
  const target = snap ? Math.round(value * 10) / 10 : round(value);
  const next =
    edge === "start"
      ? {
          start: Math.max(
            0,
            range.end - MAX_CLIP_SECONDS,
            Math.min(target, round(range.end - 0.1)),
          ),
          end: range.end,
        }
      : {
          start: range.start,
          end: Math.min(
            duration,
            range.start + MAX_CLIP_SECONDS,
            Math.max(target, round(range.start + 0.1)),
          ),
        };
  return checkedRange(next.start, next.end, duration) ? next : range;
}
export function windowAt(
  duration: number,
  span: number,
  center: number,
): TimeRange {
  const width = Math.min(duration, Math.max(0.1, span));
  const start = Math.max(
    0,
    Math.min(duration - width, clampTime(center, duration) - width / 2),
  );
  return { start, end: start + width };
}
export function fitRange(duration: number, range: TimeRange): TimeRange {
  return windowAt(
    duration,
    Math.max(1, (range.end - range.start) * 1.5),
    (range.start + range.end) / 2,
  );
}
export function positionInWindow(seconds: number, view: TimeRange) {
  return (100 * (seconds - view.start)) / (view.end - view.start);
}
