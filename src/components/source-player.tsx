"use client";

import { useState } from "react";
import { AlertTriangle, Play } from "lucide-react";

export function SourcePlayer({
  projectId,
  title,
}: {
  projectId: string;
  title: string;
}) {
  const [failed, setFailed] = useState(false);

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
      id="source-recording-player"
      className="aspect-video w-full bg-black object-contain"
      controls
      preload="metadata"
      src={`/api/media/projects/${projectId}/source`}
      onError={() => setFailed(true)}
      aria-label={`Source recording: ${title}`}
    >
      Your browser does not support MP4 video playback.
    </video>
  );
}
