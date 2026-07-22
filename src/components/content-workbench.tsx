"use client";

import { useMemo, useState } from "react";
import {
  Captions,
  Check,
  FileText,
  ImageIcon,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  Save,
  TvMinimalPlay,
} from "lucide-react";

import type { ContentDraftDto } from "@/lib/projects";

type DraftValues = Omit<ContentDraftDto, "updatedAt">;

const fields: Array<{
  key: keyof DraftValues;
  label: string;
  description: string;
  placeholder: string;
  icon: typeof Lightbulb;
  compact?: boolean;
}> = [
  {
    key: "openingHook",
    label: "Opening hook",
    description: "The first line that earns the next second of attention.",
    placeholder: "They thought this round was already over…",
    icon: Lightbulb,
    compact: true,
  },
  {
    key: "youtubeTitle",
    label: "YouTube title",
    description: "A clear promise with enough tension to invite the click.",
    placeholder: "The 1v4 That Should Have Been Impossible",
    icon: TvMinimalPlay,
    compact: true,
  },
  {
    key: "thumbnailText",
    label: "Thumbnail text",
    description:
      "Two to five words that add context without repeating the title.",
    placeholder: "NO WAY OUT",
    icon: ImageIcon,
    compact: true,
  },
  {
    key: "voiceoverScript",
    label: "Voiceover script",
    description:
      "What you will say before, during, or after the gameplay moment.",
    placeholder:
      "I had one magazine, fifteen seconds, and the entire enemy team between me and the defuser…",
    icon: FileText,
  },
  {
    key: "shortFormCaption",
    label: "Short-form caption",
    description: "The post copy for TikTok, Shorts, or Reels.",
    placeholder:
      "The last five seconds changed everything. #RainbowSixSiege #R6",
    icon: Captions,
  },
  {
    key: "editingInstructions",
    label: "Editing instructions",
    description:
      "Notes for pacing, crop, subtitles, sound, zooms, and branded elements.",
    placeholder:
      "Open on the final kill, rewind to the setup, crop the kill feed into the safe area, then add a subtle bass hit on each elimination…",
    icon: ListChecks,
  },
];

export function ContentWorkbench({
  projectId,
  initialContent,
}: {
  projectId: string;
  initialContent: ContentDraftDto;
}) {
  const initialValues = useMemo<DraftValues>(
    () => ({
      voiceoverScript: initialContent.voiceoverScript,
      openingHook: initialContent.openingHook,
      youtubeTitle: initialContent.youtubeTitle,
      shortFormCaption: initialContent.shortFormCaption,
      thumbnailText: initialContent.thumbnailText,
      editingInstructions: initialContent.editingInstructions,
    }),
    [initialContent],
  );
  const [draft, setDraft] = useState(initialValues);
  const [lastSaved, setLastSaved] = useState(initialValues);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const dirty = fields.some(({ key }) => draft[key] !== lastSaved[key]);

  function updateField(key: keyof DraftValues, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setStatus("idle");
    setMessage(null);
  }

  async function save() {
    setStatus("saving");
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await response.json()) as {
        content?: ContentDraftDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.content) {
        throw new Error(
          body.error?.message || "The content package could not be saved.",
        );
      }
      setLastSaved({
        voiceoverScript: body.content.voiceoverScript,
        openingHook: body.content.openingHook,
        youtubeTitle: body.content.youtubeTitle,
        shortFormCaption: body.content.shortFormCaption,
        thumbnailText: body.content.thumbnailText,
        editingInstructions: body.content.editingInstructions,
      });
      setStatus("saved");
      setMessage("Saved locally");
    } catch (reason) {
      setStatus("error");
      setMessage(
        reason instanceof Error
          ? reason.message
          : "The content package could not be saved.",
      );
    }
  }

  return (
    <section
      className="panel mt-8 overflow-hidden"
      aria-labelledby="content-workbench-title"
    >
      <div className="flex flex-col gap-5 border-b border-white/8 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="section-kicker">Content package</p>
          <h2
            id="content-workbench-title"
            className="font-display mt-1 text-3xl font-bold text-white uppercase"
          >
            Build the story around the clip
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            These are private writing spaces—no AI service is connected yet.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <span
              className={`text-xs ${status === "error" ? "text-rose-200" : "text-[#d8ff8a]"}`}
              role={status === "error" ? "alert" : "status"}
            >
              {status === "saved" && (
                <Check className="mr-1 inline" aria-hidden="true" size={14} />
              )}
              {message}
            </span>
          )}
          <button
            type="button"
            className="primary-button"
            onClick={save}
            disabled={!dirty || status === "saving"}
          >
            {status === "saving" ? (
              <LoaderCircle
                className="animate-spin"
                aria-hidden="true"
                size={17}
              />
            ) : (
              <Save aria-hidden="true" size={17} />
            )}
            {status === "saving" ? "Saving…" : dirty ? "Save package" : "Saved"}
          </button>
        </div>
      </div>

      <div className="grid gap-px bg-white/8 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => {
          const Icon = field.icon;
          const inputId = `content-${field.key}`;
          return (
            <label
              key={field.key}
              className="block bg-[#0c1013] p-5 sm:p-6"
              htmlFor={inputId}
            >
              <span className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#b8ff2c]/8 text-[#b8ff2c]">
                  <Icon aria-hidden="true" size={17} />
                </span>
                <span>
                  <span className="block font-semibold text-white">
                    {field.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">
                    {field.description}
                  </span>
                </span>
              </span>
              {field.compact ? (
                <input
                  id={inputId}
                  className="field mt-5"
                  value={draft[field.key]}
                  onChange={(event) =>
                    updateField(field.key, event.target.value)
                  }
                  placeholder={field.placeholder}
                  maxLength={field.key === "openingHook" ? 2000 : 500}
                />
              ) : (
                <textarea
                  id={inputId}
                  className="field mt-5 min-h-40 resize-y leading-6"
                  value={draft[field.key]}
                  onChange={(event) =>
                    updateField(field.key, event.target.value)
                  }
                  placeholder={field.placeholder}
                  maxLength={field.key === "shortFormCaption" ? 5000 : 20000}
                />
              )}
            </label>
          );
        })}
      </div>
    </section>
  );
}
