import { z } from "zod";

import { appConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);

export type NormalizedYouTubeUrl = {
  videoId: string;
  canonicalUrl: string;
  embedUrl: string;
};

export type YouTubePublicMetadata = {
  title: string;
  creatorName: string;
  channelId: string;
  description: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
};

type YouTubeVideosResponse = {
  items?: Array<{
    snippet?: {
      title?: string;
      channelTitle?: string;
      channelId?: string;
      description?: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    contentDetails?: { duration?: string };
  }>;
  error?: { message?: string };
};

function validVideoId(value: string | null | undefined) {
  const id = value?.trim() ?? "";
  return VIDEO_ID_PATTERN.test(id) ? id : null;
}

export function parseYouTubeUrl(value: string): NormalizedYouTubeUrl {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AppError(
      "Paste a complete YouTube video or Shorts URL.",
      400,
      "INVALID_YOUTUBE_URL",
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AppError(
      "Use a normal https:// YouTube link.",
      400,
      "INVALID_YOUTUBE_URL",
    );
  }

  const hostname = url.hostname.toLowerCase();
  let videoId: string | null = null;

  if (hostname === "youtu.be" || hostname === "www.youtu.be") {
    videoId = validVideoId(url.pathname.split("/").filter(Boolean)[0]);
  } else if (YOUTUBE_HOSTS.has(hostname)) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/watch") {
      videoId = validVideoId(url.searchParams.get("v"));
    } else if (["shorts", "embed", "live"].includes(parts[0] ?? "")) {
      videoId = validVideoId(parts[1]);
    }
  }

  if (!videoId) {
    throw new AppError(
      "This is not a supported YouTube video or Shorts link.",
      400,
      "INVALID_YOUTUBE_URL",
    );
  }

  return {
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
  };
}

export function parseIso8601Duration(value: string | undefined) {
  if (!value) return null;
  const match =
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
      value,
    );
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const total = days * 86_400 + hours * 3_600 + minutes * 60 + seconds;
  return Number.isFinite(total) ? total : null;
}

function selectThumbnail(
  thumbnails: Record<string, { url?: string }> | undefined,
) {
  return (
    thumbnails?.maxres?.url ??
    thumbnails?.standard?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    null
  );
}

export function isYouTubeMetadataConfigured() {
  return Boolean(appConfig.youtubeDataApiKey);
}

export async function fetchYouTubePublicMetadata(
  videoId: string,
): Promise<YouTubePublicMetadata | null> {
  const key = appConfig.youtubeDataApiKey;
  if (!key) return null;
  if (!VIDEO_ID_PATTERN.test(videoId)) {
    throw new AppError(
      "The YouTube video ID is not valid.",
      400,
      "INVALID_YOUTUBE_URL",
    );
  }

  const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
  endpoint.searchParams.set("part", "snippet,contentDetails");
  endpoint.searchParams.set("id", videoId);
  endpoint.searchParams.set("key", key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = z
      .custom<YouTubeVideosResponse>()
      .parse((await response.json()) as unknown);
    if (!response.ok) {
      throw new AppError(
        payload.error?.message ||
          "YouTube metadata is unavailable. Enter the details manually.",
        502,
        "YOUTUBE_METADATA_FAILED",
      );
    }
    const item = payload.items?.[0];
    const snippet = item?.snippet;
    if (!item || !snippet?.title || !snippet.channelTitle) return null;

    return {
      title: snippet.title.trim(),
      creatorName: snippet.channelTitle.trim(),
      channelId: snippet.channelId?.trim() ?? "",
      description: snippet.description?.trim() ?? "",
      publishedAt: snippet.publishedAt ?? null,
      durationSeconds: parseIso8601Duration(item.contentDetails?.duration),
      thumbnailUrl: selectThumbnail(snippet.thumbnails),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "YouTube metadata could not be reached. Enter the details manually and try again.",
      502,
      "YOUTUBE_METADATA_FAILED",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export interface YouTubeOwnedChannelProvider {
  readonly id: string;
  getAuthorizationStatus(): Promise<"DISABLED" | "NOT_CONNECTED" | "READY">;
}

export class DisabledYouTubeOwnedChannelProvider implements YouTubeOwnedChannelProvider {
  readonly id = "youtube-oauth-future";

  async getAuthorizationStatus() {
    return "DISABLED" as const;
  }
}
