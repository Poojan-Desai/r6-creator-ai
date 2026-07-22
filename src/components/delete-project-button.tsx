"use client";

import { useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeProject() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        throw new Error(
          body.error?.message || "The project could not be deleted.",
        );
      }
      router.push("/");
      router.refresh();
    } catch (reason) {
      setBusy(false);
      setError(
        reason instanceof Error
          ? reason.message
          : "The project could not be deleted.",
      );
    }
  }

  if (confirming) {
    return (
      <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-4">
        <p className="text-sm font-semibold text-rose-100">
          Delete “{projectName}” and all of its clips?
        </p>
        <p className="mt-1 text-xs leading-5 text-rose-200/55">
          This permanently removes the local copies saved by this app.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="danger-button"
            onClick={removeProject}
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle
                className="animate-spin"
                aria-hidden="true"
                size={15}
              />
            ) : (
              <Trash2 aria-hidden="true" size={15} />
            )}
            Delete project
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setConfirming(false)}
            disabled={busy}
          >
            Keep it
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-rose-200">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="secondary-button text-rose-200!"
      onClick={() => setConfirming(true)}
    >
      <Trash2 aria-hidden="true" size={16} /> Delete project
    </button>
  );
}
