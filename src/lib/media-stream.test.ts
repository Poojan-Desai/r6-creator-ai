import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { parseByteRange, streamLocalFile } from "@/lib/media-stream";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("parseByteRange", () => {
  it.each([
    ["bytes=0-99", { start: 0, end: 99, length: 100 }],
    ["bytes=100-", { start: 100, end: 999, length: 900 }],
    ["bytes=-50", { start: 950, end: 999, length: 50 }],
    ["bytes=900-2000", { start: 900, end: 999, length: 100 }],
  ])("parses %s", (header, expected) => {
    expect(parseByteRange(header, 1000)).toEqual(expected);
  });

  it("returns null when no range was requested", () => {
    expect(parseByteRange(null, 1000)).toBeNull();
  });

  it.each([
    "bytes=",
    "items=0-5",
    "bytes=1000-",
    "bytes=20-10",
    "bytes=0-1,4-5",
  ])("rejects %s", (header) => {
    expect(() => parseByteRange(header, 1000)).toThrow(AppError);
  });
});

describe("streamLocalFile", () => {
  it("streams a byte range and closes cleanly", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "r6-media-stream-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "fixture.bin");
    await writeFile(filePath, Buffer.from("0123456789"));

    const response = await streamLocalFile(
      new Request("http://localhost/media", {
        headers: { range: "bytes=2-5" },
      }),
      filePath,
      { contentType: "application/octet-stream" },
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await response.text()).toBe("2345");
  });

  it("allows a reader to cancel without a closed-controller error", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "r6-media-cancel-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "fixture.bin");
    await writeFile(filePath, Buffer.alloc(256 * 1024, 7));
    const response = await streamLocalFile(
      new Request("http://localhost/media"),
      filePath,
      { contentType: "application/octet-stream" },
    );
    const reader = response.body!.getReader();

    expect((await reader.read()).done).toBe(false);
    await expect(reader.cancel()).resolves.toBeUndefined();
  });
});
