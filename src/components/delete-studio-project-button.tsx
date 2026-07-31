"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteStudioProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !window.confirm(
        `Delete the unified project “${projectName}”? Its linked recordings, replays, references, clips, and transcripts will stay saved.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/studio-projects/${projectId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(
          result.error?.message ?? "The unified project could not be deleted.",
        );
      }
      router.push("/studio");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The unified project could not be deleted.",
      );
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="danger-button"
        disabled={busy}
        onClick={remove}
      >
        {busy ? (
          <LoaderCircle className="animate-spin" size={16} />
        ) : (
          <Trash2 size={16} />
        )}
        Delete unified project
      </button>
      {error && (
        <p className="mt-2 text-sm text-rose-200" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
