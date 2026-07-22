import { AppError } from "@/lib/app-error";

export function parseTimeInput(value: string | number) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  const input = value.trim();
  if (!input) return Number.NaN;

  if (/^\d+(?:\.\d+)?$/.test(input)) {
    return Number(input);
  }

  const pieces = input.split(":");
  if (pieces.length < 2 || pieces.length > 3) return Number.NaN;
  if (pieces.some((piece) => !/^\d+(?:\.\d+)?$/.test(piece))) return Number.NaN;

  const values = pieces.map(Number);
  const seconds = values.at(-1) ?? Number.NaN;
  const minutes = values.at(-2) ?? 0;
  const hours = values.at(-3) ?? 0;

  if (minutes >= 60 || seconds >= 60) return Number.NaN;
  return hours * 3600 + minutes * 60 + seconds;
}

export function validateClipRange(
  start: string | number,
  end: string | number,
  duration: number,
) {
  const startSeconds = parseTimeInput(start);
  const endSeconds = parseTimeInput(end);

  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
    throw new AppError(
      "Use seconds, MM:SS, or HH:MM:SS for both clip times.",
      400,
      "INVALID_TIMESTAMP",
    );
  }

  if (startSeconds < 0 || endSeconds <= startSeconds) {
    throw new AppError(
      "The end time must be later than the start time, and both must be positive.",
      400,
      "INVALID_CLIP_RANGE",
    );
  }

  if (endSeconds > duration + 0.01) {
    throw new AppError(
      "The clip end time is past the end of the recording.",
      400,
      "CLIP_OUT_OF_RANGE",
    );
  }

  return {
    startSeconds,
    endSeconds,
    durationSeconds: endSeconds - startSeconds,
  };
}

export function formatDuration(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const rounded = Math.floor(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;

  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    : `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
