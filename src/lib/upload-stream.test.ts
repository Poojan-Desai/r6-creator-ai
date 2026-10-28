import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  streamMultipartReferenceVideo,
  streamMultipartVideo,
} from "@/lib/upload";

vi.mock("@/lib/config", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/config")>();
  return { appConfig: { ...original.appConfig, maxUploadBytes: 64 } };
});

const boundary = "r6-upload-boundary";
const header = `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="synthetic.mp4"\r\nContent-Type: video/mp4\r\n\r\n`;
const ending = `\r\n--${boundary}--\r\n`;
function request(
  body: string | ReadableStream<Uint8Array>,
  signal?: AbortSignal,
) {
  return new Request("http://localhost/api/projects", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body,
    signal,
    duplex: "half",
  } as RequestInit & { duplex: string });
}

let directory: string;
let temporaryPath: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "r6-stream-upload-"));
  temporaryPath = path.join(directory, "upload.processing.mp4");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("streamed ingestion failure recovery", () => {
  it("streams valid metadata and bytes into an owner-only temporary file", async () => {
    const result = await streamMultipartVideo(
      request(header + "video fixture" + ending),
      temporaryPath,
    );
    expect(result).toMatchObject({
      originalFilename: "synthetic.mp4",
      sizeBytes: 13,
    });
    expect(await readFile(temporaryPath, "utf8")).toBe("video fixture");
    expect((await stat(temporaryPath)).mode & 0o777).toBe(0o600);
  });

  it("rejects a missing final boundary and removes partial bytes", async () => {
    await expect(
      streamMultipartVideo(request(header + "incomplete"), temporaryPath),
    ).rejects.toMatchObject({ code: "UPLOAD_INTERRUPTED" });
    await expect(stat(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["disconnect", "abort"] as const)(
    "settles and cleans up an open write after %s",
    async (mode) => {
      let source!: ReadableStreamDefaultController<Uint8Array>;
      const controller = new AbortController();
      const body = new ReadableStream<Uint8Array>({
        start(value) {
          source = value;
          source.enqueue(new TextEncoder().encode(header + "partial bytes"));
        },
      });
      const outcome = expect(
        streamMultipartVideo(request(body, controller.signal), temporaryPath),
      ).rejects.toMatchObject({ code: "UPLOAD_INTERRUPTED" });
      await vi.waitFor(async () => {
        expect((await stat(temporaryPath)).isFile()).toBe(true);
      });
      if (mode === "abort") controller.abort();
      else source.error(new Error("connection lost"));
      await outcome;
      await expect(stat(temporaryPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  it("does not delete a pre-existing file after exclusive-create failure", async () => {
    await writeFile(temporaryPath, "prior owned data");
    await expect(
      streamMultipartVideo(
        request(header + "new data" + ending),
        temporaryPath,
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_INTERRUPTED" });
    expect(await readFile(temporaryPath, "utf8")).toBe("prior owned data");
  });

  it("rejects duplicate videos without retaining the first partial file", async () => {
    const second = header.replace(`--${boundary}`, `\r\n--${boundary}`);
    await expect(
      streamMultipartVideo(
        request(header + "first" + second + "second" + ending),
        temporaryPath,
      ),
    ).rejects.toMatchObject({ code: "TOO_MANY_FILES" });
    await expect(stat(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([4, 16])(
    "accepts the full supported metadata field count of %s",
    async (count) => {
      const fields = Array.from(
        { length: count },
        (_, index) =>
          `--${boundary}\r\nContent-Disposition: form-data; name="field${index}"\r\n\r\nvalue\r\n`,
      ).join("");
      const upload =
        count === 4 ? streamMultipartVideo : streamMultipartReferenceVideo;
      await expect(
        upload(request(fields + header + "bytes" + ending), temporaryPath),
      ).resolves.toMatchObject({ sizeBytes: 5 });
    },
  );

  it("rejects excess fields instead of silently dropping metadata", async () => {
    const fields = Array.from(
      { length: 5 },
      (_, index) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="field${index}"\r\n\r\nvalue\r\n`,
    ).join("");
    await expect(
      streamMultipartVideo(
        request(fields + header + "bytes" + ending),
        temporaryPath,
      ),
    ).rejects.toMatchObject({ code: "TOO_MANY_FIELDS" });
  });

  it("rejects truncated fields instead of accepting incomplete metadata", async () => {
    const field = `--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${"x".repeat(8_001)}\r\n`;
    await expect(
      streamMultipartVideo(
        request(field + header + "bytes" + ending),
        temporaryPath,
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_FIELD_TOO_LARGE" });
  });

  it("rejects oversized streaming input and removes the truncated output", async () => {
    await expect(
      streamMultipartVideo(
        request(header + "x".repeat(65) + ending),
        temporaryPath,
      ),
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    await expect(stat(temporaryPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps concurrent unique uploads isolated", async () => {
    const other = path.join(directory, "other.processing.mp4");
    await Promise.all([
      streamMultipartVideo(request(header + "one" + ending), temporaryPath),
      streamMultipartVideo(request(header + "two" + ending), other),
    ]);
    expect(await readFile(temporaryPath, "utf8")).toBe("one");
    expect(await readFile(other, "utf8")).toBe("two");
  });
});
