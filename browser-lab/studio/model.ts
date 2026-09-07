import { z } from "zod";

export const MAX_SOURCE_BYTES = 4 * 1024 ** 3;
export const MAX_SOURCE_SECONDS = 6 * 3600;
export const MAX_CLIP_SECONDS = 300;
export const MAX_EXPORT_BYTES = 256 * 1024 ** 2;
export const MAX_KEEP_BYTES = 1024 ** 3;
export const LIMITS =
  "MP4, MOV or WebM · up to 4 GB / 6 hours · clips up to 5 minutes";

const finite = z.number().finite();
export const mediaSchema = z.object({
  name: z.string().min(1).max(255),
  size: finite.positive().max(MAX_SOURCE_BYTES),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  duration: finite.positive().max(MAX_SOURCE_SECONDS),
  width: finite.int().positive().max(8192),
  height: finite.int().positive().max(8192),
  codec: z.string().max(100),
  audio: z
    .array(
      z.object({
        number: z.number().int().positive(),
        name: z.string().max(255),
        codec: z.string().max(100),
      }),
    )
    .max(32),
});
export const clipSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  start: finite.nonnegative(),
  end: finite.positive(),
  audioTrack: z.number().int().positive().nullable(),
});
export const projectSchema = z
  .object({
    schema: z.literal("r6-browser-project/v1"),
    id: z.string().uuid(),
    title: z.string().trim().min(1).max(100),
    updatedAt: z.string().datetime(),
    ownershipConfirmed: z.literal(true),
    media: mediaSchema,
    notes: z.string().max(8000),
    clips: z.array(clipSchema).max(100),
    sourceSaved: z.boolean(),
  })
  .superRefine((project, ctx) => {
    for (const clip of project.clips) {
      try {
        validateRange(clip.start, clip.end, project.media.duration);
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid saved clip range." });
      }
      if (
        clip.audioTrack !== null &&
        !project.media.audio.some((t) => t.number === clip.audioTrack)
      )
        ctx.addIssue({
          code: "custom",
          message: "Saved clip refers to a missing audio track.",
        });
    }
    if (new Set(project.clips.map((c) => c.id)).size !== project.clips.length)
      ctx.addIssue({ code: "custom", message: "Duplicate saved clips." });
  });
export type MediaInfo = z.infer<typeof mediaSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Project = z.infer<typeof projectSchema>;

export function validateFile(file: Pick<File, "name" | "size" | "type">) {
  if (!/\.(mp4|mov|webm)$/i.test(file.name))
    throw new Error("Choose an MP4, MOV or WebM recording.");
  if (
    file.type &&
    ![
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "application/octet-stream",
    ].includes(file.type)
  )
    throw new Error("This file does not have a supported video type.");
  if (!file.size || file.size > MAX_SOURCE_BYTES)
    throw new Error(
      "Choose a nonempty recording under 4 GB. Use the local Studio for larger files.",
    );
}
export function validateRange(start: number, end: number, duration: number) {
  if (
    ![start, end, duration].every(Number.isFinite) ||
    start < 0 ||
    end <= start ||
    end > duration
  )
    throw new Error(
      "Set a start before the end, within the recording’s duration.",
    );
  if (end - start > MAX_CLIP_SECONDS)
    throw new Error("Keep each browser clip at 5 minutes or less.");
  if (end - start < 0.1)
    throw new Error("Choose at least 0.1 seconds of video.");
}
export function parseTime(value: string) {
  if (!/^(?:\d+:)?(?:\d{1,2}:)?\d+(?:\.\d{1,3})?$/.test(value.trim()))
    return NaN;
  const parts = value.trim().split(":").map(Number);
  if (parts.length > 1 && parts.slice(1).some((p) => p >= 60)) return NaN;
  return parts.reduce((sum, part) => sum * 60 + part, 0);
}
export function formatTime(seconds: number) {
  const ms = Math.round(seconds * 1000);
  return `${Math.floor(ms / 3600000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 60000) % 60)
    .toString()
    .padStart(2, "0")}:${((ms / 1000) % 60).toFixed(3).padStart(6, "0")}`;
}
export function safeDownloadName(title: string, extension: string) {
  return `${
    title
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "r6-clip"
  }.${extension}`;
}
// A bounded identity check for accidental relinks, not a full-file integrity checksum.
export async function fingerprint(file: Blob) {
  const edges = new Blob([
    file.slice(0, 65536),
    file.slice(Math.max(0, file.size - 65536)),
    String(file.size),
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await edges.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export function importProject(text: string): Project {
  if (text.length > 200000) throw new Error("Project backup is too large.");
  const project = projectSchema.parse(JSON.parse(text));
  return {
    ...project,
    id: crypto.randomUUID(),
    sourceSaved: false,
    updatedAt: new Date().toISOString(),
  };
}
