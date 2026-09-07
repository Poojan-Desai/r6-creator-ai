import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import {
  fingerprint,
  mediaSchema,
  validateFile,
  type MediaInfo,
} from "./model";

export async function inspectMedia(file: File): Promise<MediaInfo> {
  validateFile(file);
  const input = new Input({
    source: new BlobSource(file),
    formats: ALL_FORMATS,
  });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("This file contains no readable video track.");
    const tracks = await input.getAudioTracks();
    return mediaSchema.parse({
      name: file.name,
      size: file.size,
      fingerprint: await fingerprint(file),
      duration: await video.computeDuration(),
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      codec: (await video.getCodec()) ?? "Unknown codec",
      audio: await Promise.all(
        tracks.map(async (track) => ({
          number: track.number,
          name: (await track.getName()) || `Audio track ${track.number}`,
          codec: (await track.getCodec()) ?? "Unknown codec",
        })),
      ),
    });
  } catch (error) {
    if (error instanceof Error && !error.message.startsWith("[")) throw error;
    throw new Error(
      "This video is unsupported or outside the browser limits (4 GB, 6 hours, 8K input). Try an H.264 MP4 or use the local Studio.",
    );
  } finally {
    input.dispose();
  }
}

export async function exportDirectory() {
  return (await navigator.storage.getDirectory()).getDirectoryHandle(
    "r6-studio-exports",
    { create: true },
  );
}
export async function removeExport(id: string) {
  try {
    await (await exportDirectory()).removeEntry(id);
  } catch {
    /* A download or unavailable storage may already have removed it. */
  }
}
export type ExportRequest = {
  file: File;
  id: string;
  start: number;
  end: number;
  audioTrack: number | null;
  format: "mp4" | "webm";
  preview: boolean;
};
export type ExportMessage =
  | { type: "progress"; progress: number }
  | {
      type: "complete";
      blob: Blob;
      width: number;
      height: number;
      duration: number;
      audio: boolean;
    }
  | { type: "error"; message: string };
