import { useState } from "react";
import { formatTime, type Clip } from "./model";
import {
  fitRange,
  positionInWindow,
  trimRange,
  windowAt,
  type TimeRange,
} from "./timeline-model";

type Props = {
  duration: number;
  playhead: number;
  range: TimeRange | null;
  clips: Clip[];
  selectedId: string | null;
  disabled: boolean;
  canPlay: boolean;
  onSeek: (seconds: number) => void;
  onRange: (range: TimeRange) => void;
  onClip: (clip: Clip) => void;
};
export function Timeline({
  duration,
  playhead,
  range,
  clips,
  selectedId,
  disabled,
  canPlay,
  onSeek,
  onRange,
  onClip,
}: Props) {
  const [view, setView] = useState<TimeRange>({ start: 0, end: duration });
  const [snap, setSnap] = useState(false);
  const span = view.end - view.start;
  const pct = (value: number) =>
    `${Math.max(0, Math.min(100, positionInWindow(value, view)))}%`;
  const moveWindow = (delta: number) =>
    setView(windowAt(duration, span, (view.start + view.end) / 2 + delta));
  function changeRange(edge: "start" | "end", value: number) {
    if (range) onRange(trimRange(range, edge, value, duration, snap));
  }
  return (
    <section className="timeline panel" aria-labelledby="timeline-title">
      <div className="timeline-toolbar">
        <div>
          <p className="eyebrow">Source timeline</p>
          <h2 id="timeline-title">Choose your moment</h2>
        </div>
        <div className="timeline-tools">
          <button
            disabled={disabled || span >= duration}
            onClick={() => setView(windowAt(duration, span * 2, playhead))}
            aria-label="Zoom out timeline"
          >
            −
          </button>
          <button
            disabled={disabled || span <= 1}
            onClick={() =>
              setView(windowAt(duration, Math.max(1, span / 2), playhead))
            }
            aria-label="Zoom in timeline"
          >
            +
          </button>
          <button
            disabled={disabled || !range}
            onClick={() => range && setView(fitRange(duration, range))}
          >
            Fit clip
          </button>
          <button
            disabled={disabled}
            onClick={() => setView({ start: 0, end: duration })}
          >
            Full recording
          </button>
        </div>
      </div>
      <div className="timeline-window">
        <button
          disabled={disabled || view.start <= 0}
          onClick={() => moveWindow(-span / 2)}
          aria-label="Earlier timeline window"
        >
          ←
        </button>
        <p>
          {formatTime(view.start)} — {formatTime(view.end)}
        </p>
        <button
          disabled={disabled || view.end >= duration}
          onClick={() => moveWindow(span / 2)}
          aria-label="Later timeline window"
        >
          →
        </button>
      </div>
      <div className="timeline-ruler" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i}>
            {span < 10
              ? `${(view.start + (span * i) / 4).toFixed(2)}s`
              : formatTime(view.start + (span * i) / 4).replace(/\.\d{3}$/, "")}
          </span>
        ))}
      </div>
      <label className="timeline-seek">
        Playhead <span>{formatTime(playhead)}</span>
        <input
          type="range"
          min={view.start}
          max={view.end}
          step="0.001"
          value={Math.max(view.start, Math.min(view.end, playhead))}
          disabled={disabled || !canPlay}
          aria-label="Timeline playhead"
          aria-valuetext={
            playhead < view.start || playhead > view.end
              ? `${formatTime(playhead)}; outside the visible window. Move slider to seek within this window.`
              : formatTime(playhead)
          }
          onChange={(e) => onSeek(Number(e.target.value))}
        />
      </label>
      <div className="timeline-selection" aria-label="Selected clip range">
        {range && range.end >= view.start && range.start <= view.end && (
          <div
            className="timeline-region"
            style={{
              left: pct(range.start),
              right: `${100 - Math.max(0, Math.min(100, positionInWindow(range.end, view)))}%`,
            }}
          >
            <span>Selected range</span>
          </div>
        )}
        {range && (
          <>
            <input
              type="range"
              className="trim-handle trim-start"
              hidden={range.start < view.start || range.start > view.end}
              min={view.start}
              max={view.end}
              step="any"
              value={Math.max(view.start, Math.min(view.end, range.start))}
              disabled={disabled}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(
                    e.key,
                  )
                ) {
                  e.preventDefault();
                  changeRange(
                    "start",
                    range.start +
                      (["ArrowLeft", "ArrowDown"].includes(e.key) ? -1 : 1) *
                        (snap ? 0.1 : 0.01),
                  );
                }
              }}
              aria-label="Timeline trim start"
              aria-valuetext={formatTime(range.start)}
              onChange={(e) => changeRange("start", Number(e.target.value))}
            />
            <input
              type="range"
              className="trim-handle trim-end"
              hidden={range.end < view.start || range.end > view.end}
              min={view.start}
              max={view.end}
              step="any"
              value={Math.max(view.start, Math.min(view.end, range.end))}
              disabled={disabled}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(
                    e.key,
                  )
                ) {
                  e.preventDefault();
                  changeRange(
                    "end",
                    range.end +
                      (["ArrowLeft", "ArrowDown"].includes(e.key) ? -1 : 1) *
                        (snap ? 0.1 : 0.01),
                  );
                }
              }}
              aria-label="Timeline trim end"
              aria-valuetext={formatTime(range.end)}
              onChange={(e) => changeRange("end", Number(e.target.value))}
            />
          </>
        )}
      </div>
      <div className="timeline-range-fields">
        <label>
          Trim start{" "}
          <input
            type="range"
            min="0"
            max={duration}
            step={snap ? "0.1" : "0.01"}
            value={range?.start ?? 0}
            disabled={disabled || !range}
            aria-label="Trim start"
            aria-valuetext={
              range ? formatTime(range.start) : "Set a valid range first"
            }
            onChange={(e) => changeRange("start", Number(e.target.value))}
          />
        </label>
        <label>
          Trim end{" "}
          <input
            type="range"
            min="0"
            max={duration}
            step={snap ? "0.1" : "0.01"}
            value={range?.end ?? duration}
            disabled={disabled || !range}
            aria-label="Trim end"
            aria-valuetext={
              range ? formatTime(range.end) : "Set a valid range first"
            }
            onChange={(e) => changeRange("end", Number(e.target.value))}
          />
        </label>
      </div>
      <div className="timeline-options">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={snap}
            disabled={disabled}
            onChange={(e) => setSnap(e.target.checked)}
          />
          Snap trim to 0.1 s
        </label>
        <p>
          {range
            ? `${formatTime(range.start)} → ${formatTime(range.end)} · ${(range.end - range.start).toFixed(2)} s`
            : "Enter a valid clip start/end to enable trimming."}
        </p>
      </div>
      {clips.length > 0 && (
        <div className="timeline-clips" aria-label="Saved timeline clips">
          {clips.map((clip) => (
            <button
              key={clip.id}
              className={clip.id === selectedId ? "active" : ""}
              aria-pressed={clip.id === selectedId}
              disabled={disabled}
              onClick={() => {
                onClip(clip);
                setView(fitRange(duration, clip));
              }}
            >
              <strong>{clip.name}</strong>
              <span>
                {formatTime(clip.start)} → {formatTime(clip.end)}
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="muted timeline-help">
        Drag the playhead to seek. Drag either range edge, or focus a trim
        slider and use arrow keys. Save clip keeps the range; the original
        recording stays unchanged. Zoom is temporary.
      </p>
    </section>
  );
}
