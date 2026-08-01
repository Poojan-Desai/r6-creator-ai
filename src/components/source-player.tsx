"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Play } from "lucide-react";

export function SourcePlayer({
  projectId,
  title,
}: {
  projectId: string;
  title: string;
}) {
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const replayEndRef = useRef<number | null>(null);

  useEffect(() => {
    function seek(event: Event) {
      const detail = (
        event as CustomEvent<{ time?: number; play?: boolean; end?: number }>
      ).detail;
      const video = videoRef.current;
      if (!video || !Number.isFinite(detail?.time)) return;
      video.currentTime = Math.max(0, detail.time ?? 0);
      replayEndRef.current = Number.isFinite(detail.end)
        ? (detail.end ?? null)
        : null;
      if (detail.play) void video.play();
    }
    window.addEventListener("r6-seek-source", seek);
    return () => window.removeEventListener("r6-seek-source", seek);
  }, []);

  if (failed) {
    return (
      <div className="grid aspect-video place-items-center bg-black p-8 text-center">
        <div>
          <AlertTriangle
            className="mx-auto text-amber-300"
            aria-hidden="true"
            size={30}
          />
          <p className="mt-4 font-semibold text-white">
            The saved recording could not be played.
          </p>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
            The file may have moved, or its video codec may not be supported by
            this browser.
          </p>
          <button
            type="button"
            className="secondary-button mt-5"
            onClick={() => setFailed(false)}
          >
            <Play aria-hidden="true" size={16} /> Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      id="source-recording-player"
      className="aspect-video w-full bg-black object-contain"
      controls
      preload="metadata"
      src={`/api/media/projects/${projectId}/source`}
      onError={() => setFailed(true)}
      onTimeUpdate={(event) => {
        window.dispatchEvent(
          new CustomEvent("r6-source-time", {
            detail: {
              projectId,
              time: event.currentTarget.currentTime,
            },
          }),
        );
        if (
          replayEndRef.current !== null &&
          event.currentTarget.currentTime >= replayEndRef.current
        ) {
          event.currentTarget.pause();
          replayEndRef.current = null;
        }
      }}
      aria-label={`Source recording: ${title}`}
    >
      Your browser does not support MP4 video playback.
    </video>
  );
}
