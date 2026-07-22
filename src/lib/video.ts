import { spawn } from "node:child_process";

import { appConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

type ProbeStream = {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
  channels?: number;
  channel_layout?: string;
  tags?: {
    language?: string;
    title?: string;
    handler_name?: string;
  };
  disposition?: {
    default?: number;
  };
};

type ProbeOutput = {
  streams?: ProbeStream[];
  format?: {
    duration?: string;
  };
};

export type VideoMetadata = {
  durationSeconds: number;
  width: number;
  height: number;
  frameRate: number;
  audioTracks: AudioTrackMetadata[];
};

export type AudioTrackMetadata = {
  streamIndex: number;
  codecName: string;
  channels: number;
  channelLayout: string | null;
  language: string | null;
  title: string | null;
  isDefault: boolean;
  preferenceScore: number;
  preferenceReason: string | null;
};

type ProcessResult = {
  stdout: string;
  stderr: string;
};

function runProcess(
  executable: string,
  args: string[],
  timeoutMs = 60_000,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      if (!settled) {
        settled = true;
        reject(new Error("The video tool took too long to respond."));
      }
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < 2_000_000) stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 200_000) stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(
            stderr.trim() ||
              `Video tool exited with code ${code ?? "unknown"}.`,
          ),
        );
    });
  });
}

export function parseFrameRate(value: string | undefined) {
  if (!value) return Number.NaN;
  const [numeratorText, denominatorText = "1"] = value.split("/");
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return Number.NaN;
  }
  return numerator / denominator;
}

export function normalizeProbeOutput(output: ProbeOutput): VideoMetadata {
  const video = output.streams?.find((stream) => stream.codec_type === "video");
  if (!video) {
    throw new AppError(
      "This MP4 does not contain a readable video track.",
      415,
      "NO_VIDEO_STREAM",
    );
  }

  const durationSeconds = Number(output.format?.duration ?? video.duration);
  const frameRate = parseFrameRate(video.avg_frame_rate ?? video.r_frame_rate);
  const width = Number(video.width);
  const height = Number(video.height);

  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    !Number.isInteger(width) ||
    width <= 0 ||
    !Number.isInteger(height) ||
    height <= 0 ||
    !Number.isFinite(frameRate) ||
    frameRate <= 0
  ) {
    throw new AppError(
      "The video opened, but its duration, resolution, or frame rate could not be read.",
      415,
      "INVALID_VIDEO_METADATA",
    );
  }

  return {
    durationSeconds,
    width,
    height,
    frameRate,
    audioTracks: normalizeAudioTracks(output.streams ?? []),
  };
}

export function normalizeAudioTracks(
  streams: ProbeStream[],
): AudioTrackMetadata[] {
  const audioStreams = streams.filter(
    (stream): stream is ProbeStream & { index: number } =>
      stream.codec_type === "audio" && Number.isInteger(stream.index),
  );

  return audioStreams.map((stream) => {
    const title = (stream.tags?.title ?? stream.tags?.handler_name)?.trim();
    const searchableTitle = title?.toLowerCase() ?? "";
    const channels =
      Number.isInteger(stream.channels) && Number(stream.channels) > 0
        ? Number(stream.channels)
        : 1;
    let preferenceScore = 0;
    let preferenceReason: string | null = null;

    if (audioStreams.length === 1) {
      preferenceScore = 100;
      preferenceReason = "This is the recording's only audio track.";
    } else if (
      /(?:creator|microphone|\bmic\b|commentary|narration|voice)/i.test(
        searchableTitle,
      )
    ) {
      preferenceScore = 100;
      preferenceReason = "Its track name looks like a creator microphone.";
    } else if (
      /(?:teammate|team chat|party|discord|voice chat)/i.test(searchableTitle)
    ) {
      preferenceScore = -100;
      preferenceReason = "Its name suggests teammate or voice-chat audio.";
    } else if (/(?:game|desktop|system|music|mixed?)/i.test(searchableTitle)) {
      preferenceScore = -50;
      preferenceReason = "Its name suggests game, desktop, or mixed audio.";
    } else if (channels === 1) {
      preferenceScore = 25;
      preferenceReason =
        "This is a mono track, which may be an isolated microphone.";
    }

    return {
      streamIndex: stream.index,
      codecName: stream.codec_name?.trim() || "unknown",
      channels,
      channelLayout: stream.channel_layout?.trim() || null,
      language: stream.tags?.language?.trim() || null,
      title: title || null,
      isDefault: stream.disposition?.default === 1,
      preferenceScore,
      preferenceReason,
    };
  });
}

export async function probeVideo(filePath: string) {
  if (!appConfig.ffprobePath) {
    throw new AppError(
      "FFprobe is not available. Reinstall the application dependencies and try again.",
      503,
      "FFPROBE_UNAVAILABLE",
    );
  }

  try {
    const result = await runProcess(appConfig.ffprobePath, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);
    return normalizeProbeOutput(JSON.parse(result.stdout) as ProbeOutput);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "This file could not be read as an MP4 video. It may be incomplete or damaged.",
      415,
      "VIDEO_PROBE_FAILED",
    );
  }
}

export function buildClipArguments(
  inputPath: string,
  outputPath: string,
  startSeconds: number,
  durationSeconds: number,
) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    startSeconds.toFixed(3),
    "-i",
    inputPath,
    "-t",
    durationSeconds.toFixed(3),
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    "-avoid_negative_ts",
    "make_zero",
    "-y",
    outputPath,
  ];
}

export async function createVideoClip(
  inputPath: string,
  outputPath: string,
  startSeconds: number,
  durationSeconds: number,
) {
  if (!appConfig.ffmpegPath) {
    throw new AppError(
      "FFmpeg is not available. Reinstall the application dependencies and try again.",
      503,
      "FFMPEG_UNAVAILABLE",
    );
  }

  try {
    await runProcess(
      appConfig.ffmpegPath,
      buildClipArguments(inputPath, outputPath, startSeconds, durationSeconds),
      3_600_000,
    );
  } catch {
    throw new AppError(
      "The clip could not be created. Check that the selected range plays correctly and try again.",
      422,
      "CLIP_PROCESSING_FAILED",
    );
  }
}

export async function getVideoToolHealth() {
  const result = {
    ffmpeg: false,
    ffprobe: false,
  };

  await Promise.all([
    appConfig.ffmpegPath
      ? runProcess(appConfig.ffmpegPath, ["-version"], 15_000)
          .then(() => {
            result.ffmpeg = true;
          })
          .catch(() => undefined)
      : Promise.resolve(),
    appConfig.ffprobePath
      ? runProcess(appConfig.ffprobePath, ["-version"], 15_000)
          .then(() => {
            result.ffprobe = true;
          })
          .catch(() => undefined)
      : Promise.resolve(),
  ]);

  return result;
}
