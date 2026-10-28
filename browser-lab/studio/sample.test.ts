import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { inspectMedia } from "./media";
import { fingerprint, projectSchema, type MediaInfo } from "./model";
import {
  createSampleProject,
  isSampleMedia,
  loadSample,
  SAMPLE,
} from "./sample";

let bytes: Uint8Array<ArrayBuffer>;
let media: MediaInfo;

beforeAll(async () => {
  bytes = new Uint8Array(
    await readFile(new URL("./sample/clip.mp4", import.meta.url)),
  );
  media = await inspectMedia(
    new File([bytes], SAMPLE.name, { type: "video/mp4" }),
  );
});

function response(contents: Uint8Array<ArrayBuffer> = bytes) {
  return new Response(contents, { headers: { "content-type": "video/mp4" } });
}

describe("original bundled browser sample", () => {
  it("matches its manifest and real media inspection", async () => {
    expect(bytes.byteLength).toBe(SAMPLE.size);
    expect(bytes.byteLength).toBeLessThan(2 * 1024 ** 2);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      SAMPLE.sha256,
    );
    expect(media).toMatchObject({
      name: SAMPLE.name,
      size: SAMPLE.size,
      fingerprint: SAMPLE.fingerprint,
      width: 640,
      height: 360,
      duration: 12,
      codec: "avc",
    });
    expect(media.audio).toHaveLength(1);
    expect(media.audio[0]?.codec).toBe("aac");
    expect(media.audio[0]?.name).toBe("Synthetic quiet tone");
    expect(SAMPLE.license).toBe("CC0-1.0");
  });

  it("fetches only the relative asset and verifies its bytes before returning a file", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const file = await loadSample({ fetcher });
    expect(fetcher).toHaveBeenCalledExactlyOnceWith("sample/clip.mp4", {
      signal: undefined,
      cache: "no-cache",
      credentials: "same-origin",
      redirect: "error",
    });
    expect(file.name).toBe(SAMPLE.name);
    expect(file.type).toBe("video/mp4");
    expect(file.size).toBe(SAMPLE.size);
    expect(await fingerprint(file)).toBe(SAMPLE.fingerprint);
  });

  it("creates independent schema-valid projects with precise silent ranges", () => {
    const project = createSampleProject(media);
    const another = createSampleProject(media);
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(project.id).not.toBe(another.id);
    expect(project.title).toContain("Synthetic");
    expect(project.notes).toContain("This is not gameplay");
    expect(project.ownershipConfirmed).toBe(true);
    expect(project.sourceSaved).toBe(false);
    expect(
      project.clips.map(({ start, end, audioTrack }) => ({
        start,
        end,
        audioTrack,
      })),
    ).toEqual([
      { start: 1.25, end: 5.75, audioTrack: null },
      { start: 6.25, end: 10.75, audioTrack: null },
    ]);
    expect(project.clips[0]?.id).not.toBe(another.clips[0]?.id);
  });

  it("requires name, size and fingerprint to identify the sample", () => {
    expect(isSampleMedia(media)).toBe(true);
    for (const change of [
      { name: "my-recording.mp4" },
      { size: SAMPLE.size + 1 },
      { fingerprint: "0".repeat(64) },
    ]) {
      const changed = { ...media, ...change };
      expect(isSampleMedia(changed)).toBe(false);
      expect(() => createSampleProject(changed)).toThrow("does not match");
    }
  });

  it("rejects unavailable responses", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    await expect(loadSample({ fetcher })).rejects.toThrow(
      "could not be loaded",
    );
  });

  it("rejects a truncated response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(bytes.slice(0, 100)));
    await expect(loadSample({ fetcher })).rejects.toThrow("incomplete");
  });

  it("cancels a stream as soon as it exceeds the exact expected size", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(SAMPLE.size + 1));
      },
      cancel,
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    await expect(loadSample({ fetcher })).rejects.toThrow(
      "exceeded its expected size",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels a response with a misleading size header before reading it", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(body, {
        headers: { "content-length": String(SAMPLE.size + 1) },
      }),
    );
    await expect(loadSample({ fetcher })).rejects.toThrow("size did not match");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("detects interior tampering even when the bounded relink fingerprint is unchanged", async () => {
    const changed = bytes.slice();
    const middle = Math.floor(changed.byteLength / 2);
    changed[middle] = (changed[middle] ?? 0) ^ 1;
    expect(await fingerprint(new Blob([changed]))).toBe(SAMPLE.fingerprint);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(changed));
    await expect(loadSample({ fetcher })).rejects.toThrow("integrity check");
  });

  it("does not start a request when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      loadSample({ signal: controller.signal, fetcher }),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
