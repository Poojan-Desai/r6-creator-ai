import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  root: "",
  beforeClaim: null as (() => Promise<unknown>) | null,
  completeBeforeCancel: false,
  job: {
    id: "job",
    timelineId: "timeline",
    status: "QUEUED",
    cancelRequestedAt: null as Date | null,
    progress: 0,
    relativePath: null as string | null,
  },
  probe: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("@/lib/config", () => ({
  appConfig: { ffmpegPath: "/fixture/ffmpeg" },
}));
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => state.spawn(...args),
}));
vi.mock("@/lib/video", () => ({
  probeVideo: (...args: unknown[]) => state.probe(...args),
}));
vi.mock("@/lib/data-paths", () => ({
  dataPaths: {
    get root() {
      return state.root;
    },
  },
  ensureDataDirectories: async () => undefined,
  shortFormExportTemporaryDirectory: (id: string) =>
    path.join(state.root, "temp", id),
  shortFormExportDirectory: (id: string) =>
    path.join(state.root, "exports", id),
  toDataRelativePath: (value: string) => path.relative(state.root, value),
  resolveDataPath: (value: string) => path.join(state.root, value),
}));
vi.mock("@/lib/short-form-proxy", () => ({
  SHORT_FORM_EXPORT_PIPELINE_VERSION: "test-version",
  buildShortFormExportPlan: ({ outputPath }: { outputPath: string }) => ({
    arguments: [outputPath],
    specification: {},
    width: 640,
    height: 360,
    durationSeconds: 3,
  }),
}));
vi.mock("@/lib/timeline-document", () => ({
  timelineDocumentSchema: { parse: () => ({}) },
}));
vi.mock("@/lib/db", () => ({
  db: {
    shortFormExportJob: {
      findUnique: vi.fn(async () => ({
        ...state.job,
        timelineRevision: { documentJson: "{}" },
        timeline: {
          production: {
            studioProjectId: "studio",
            studioProject: {
              inputs: [],
              mediaAssets: [],
              selectedAudioTrackId: null,
            },
          },
        },
      })),
      findUniqueOrThrow: vi.fn(async () => ({ ...state.job })),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: {
            status?: string | { in: string[] };
            cancelRequestedAt?: null;
          };
          data: Partial<typeof state.job>;
        }) => {
          if (where.status === "QUEUED" && state.beforeClaim)
            await state.beforeClaim();
          if (data.cancelRequestedAt && state.completeBeforeCancel)
            state.job.status = "COMPLETED";
          const statuses =
            typeof where.status === "string"
              ? [where.status]
              : where.status?.in;
          if (
            (statuses && !statuses.includes(state.job.status)) ||
            ("cancelRequestedAt" in where &&
              state.job.cancelRequestedAt !== null)
          )
            return { count: 0 };
          Object.assign(state.job, data);
          return { count: 1 };
        },
      ),
    },
  },
}));

import {
  cancelShortFormExportJob,
  runShortFormExportJob,
} from "@/lib/short-form-exports";

const metadata = {
  width: 640,
  height: 360,
  durationSeconds: 3,
  frameRate: 30,
  audioTracks: [],
};
beforeEach(async () => {
  state.root = await mkdtemp(path.join(tmpdir(), "r6-export-lifecycle-"));
  state.job = {
    id: "job",
    timelineId: "timeline",
    status: "QUEUED",
    cancelRequestedAt: null,
    progress: 0,
    relativePath: null,
  };
  state.beforeClaim = null;
  state.completeBeforeCancel = false;
  state.probe.mockReset();
  state.probe.mockResolvedValue(metadata);
  state.spawn.mockReset();
  state.spawn.mockImplementation((_executable: string, args: string[]) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    });
    setImmediate(() => {
      void writeFile(args[0]!, "rendered fixture").then(() =>
        child.emit("close", 0, null),
      );
    });
    return child;
  });
});
afterEach(async () => {
  await rm(state.root, { recursive: true, force: true });
});

describe("short-form terminal-state arbitration", () => {
  it("completes a claimed verified export and retains its output", async () => {
    await runShortFormExportJob("job");
    expect(state.job.status).toBe("COMPLETED");
    expect(state.job.progress).toBe(100);
    expect(
      await readFile(path.join(state.root, state.job.relativePath!), "utf8"),
    ).toBe("rendered fixture");
    await expect(
      stat(path.join(state.root, "temp", "job")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("honors cancellation arriving during asynchronous FFprobe verification", async () => {
    let finishProbe!: (value: typeof metadata) => void;
    state.probe.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishProbe = resolve;
        }),
    );
    const running = runShortFormExportJob("job");
    await vi.waitFor(() => expect(state.probe).toHaveBeenCalledOnce());
    await cancelShortFormExportJob("job", "studio");
    finishProbe(metadata);
    await running;
    expect(state.job.status).toBe("CANCELLED");
    expect(state.job.relativePath).toBeNull();
    await expect(
      stat(path.join(state.root, "exports", "timeline", "job.mp4")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      stat(path.join(state.root, "temp", "job")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not resurrect an externally failed job after verification", async () => {
    let finishProbe!: (value: typeof metadata) => void;
    state.probe.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishProbe = resolve;
        }),
    );
    const running = runShortFormExportJob("job");
    await vi.waitFor(() => expect(state.probe).toHaveBeenCalledOnce());
    state.job.status = "ERROR";
    finishProbe(metadata);
    await running;
    expect(state.job.status).toBe("ERROR");
    expect(state.job.relativePath).toBeNull();
    await expect(
      stat(path.join(state.root, "exports", "timeline", "job.mp4")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not start cancelled work and leaves completed work untouched on cancel", async () => {
    state.job.status = "CANCELLED";
    await runShortFormExportJob("job");
    expect(state.spawn).not.toHaveBeenCalled();
    state.job.status = "COMPLETED";
    expect((await cancelShortFormExportJob("job", "studio")).status).toBe(
      "COMPLETED",
    );
    expect(state.job.cancelRequestedAt).toBeNull();
  });

  it("persists cancellation received between loading and claiming a queued job", async () => {
    state.beforeClaim = () => cancelShortFormExportJob("job", "studio");
    await runShortFormExportJob("job");
    expect(state.job.status).toBe("CANCELLED");
    expect(state.spawn).not.toHaveBeenCalled();
  });

  it("does not let a stale cancellation overwrite a concurrently completed job", async () => {
    state.job.status = "RUNNING";
    state.completeBeforeCancel = true;
    const result = await cancelShortFormExportJob("job", "studio");
    expect(result.status).toBe("COMPLETED");
    expect(state.job.cancelRequestedAt).toBeNull();
  });

  it("deduplicates concurrent in-process submissions of the same job", async () => {
    await Promise.all([
      runShortFormExportJob("job"),
      runShortFormExportJob("job"),
    ]);
    expect(state.spawn).toHaveBeenCalledOnce();
    expect(state.job.status).toBe("COMPLETED");
  });
});
