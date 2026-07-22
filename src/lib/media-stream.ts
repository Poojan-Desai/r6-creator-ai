import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import { AppError } from "@/lib/errors";

export type ByteRange = {
  start: number;
  end: number;
  length: number;
};

export function parseByteRange(
  rangeHeader: string | null,
  fileSize: number,
): ByteRange | null {
  if (!rangeHeader) return null;
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) {
    throw new AppError(
      "The saved video file is empty.",
      404,
      "MEDIA_NOT_FOUND",
    );
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) {
    throw new AppError(
      "The requested video range is not valid.",
      416,
      "INVALID_RANGE",
    );
  }

  let start: number;
  let end: number;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new AppError(
        "The requested video range is not valid.",
        416,
        "INVALID_RANGE",
      );
    }
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : fileSize - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= fileSize ||
    end < start
  ) {
    throw new AppError(
      "The requested video range is outside this file.",
      416,
      "RANGE_NOT_SATISFIABLE",
    );
  }

  end = Math.min(end, fileSize - 1);
  return { start, end, length: end - start + 1 };
}

export async function streamLocalMp4(
  request: Request,
  absolutePath: string,
  options: { downloadName?: string } = {},
) {
  return streamLocalFile(request, absolutePath, {
    ...options,
    contentType: "video/mp4",
  });
}

export async function streamLocalFile(
  request: Request,
  absolutePath: string,
  options: { downloadName?: string; contentType: string },
) {
  let file;
  try {
    file = await stat(absolutePath);
  } catch {
    throw new AppError(
      "This saved file is missing. Restore it from a backup or import it again.",
      404,
      "MEDIA_NOT_FOUND",
    );
  }

  if (!file.isFile() || file.size <= 0) {
    throw new AppError(
      "This saved file is empty or unavailable.",
      404,
      "MEDIA_NOT_FOUND",
    );
  }

  const range = parseByteRange(request.headers.get("range"), file.size);
  const nodeStream = range
    ? createReadStream(absolutePath, { start: range.start, end: range.end })
    : createReadStream(absolutePath);
  let finished = false;
  const iterator = nodeStream[Symbol.asyncIterator]();
  const removeAbortListener = () =>
    request.signal.removeEventListener("abort", handleAbort);
  const handleAbort = () => {
    finished = true;
    nodeStream.destroy();
    removeAbortListener();
  };
  request.signal.addEventListener("abort", handleAbort, { once: true });
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return;
      try {
        const next = await iterator.next();
        if (finished) return;
        if (next.done) {
          finished = true;
          removeAbortListener();
          controller.close();
          return;
        }
        controller.enqueue(next.value);
      } catch (error) {
        if (finished) return;
        finished = true;
        removeAbortListener();
        controller.error(error);
      }
    },
    async cancel() {
      if (finished) return;
      finished = true;
      removeAbortListener();
      await iterator.return?.();
      nodeStream.destroy();
    },
  });
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Type": options.contentType,
    "Content-Length": String(range?.length ?? file.size),
  });

  if (range)
    headers.set(
      "Content-Range",
      `bytes ${range.start}-${range.end}/${file.size}`,
    );
  if (options.downloadName) {
    const encoded = encodeURIComponent(options.downloadName);
    headers.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encoded}`,
    );
  }

  return new Response(body, { status: range ? 206 : 200, headers });
}
