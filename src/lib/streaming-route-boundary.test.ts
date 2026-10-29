import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";

import { config } from "../proxy";
import { localRequestRejection } from "./local-request-guard";

const uploads = [
  "/api/projects",
  "/api/references",
  "/api/replays",
  "/api/map-versions/version-id/blueprints",
  "/api/studio-projects/project-id/media-assets",
  "/api/studio-projects/project-id/voiceover/takes",
];

describe("compiled streaming-route Proxy boundary", () => {
  it.each(uploads)("bypasses cloning only at the guarded route %s", (route) => {
    for (const suffix of ["", "/", "?review=1"]) {
      expect(
        unstable_doesMiddlewareMatch({ config, url: route + suffix }),
      ).toBe(false);
    }
  });

  it.each([
    "/",
    "/studio",
    "/api/projects/id",
    "/api/projects/id/clips",
    "/api/projects-extra",
    "/api/references/youtube",
    "/api/replays/id",
    "/api/media/projects/id/source",
    "/api/map-versions/id/blueprints/id",
    "/api/map-versions/id/blueprints-extra",
    "/api/studio-projects/id/media-assets/id",
    "/api/studio-projects/id/voiceover/takes/id/process",
    "/api/studio-projects/id/voiceover/takes-extra",
  ])("preserves the Proxy guard at the nearby route %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });
});

describe("route-level local request boundary", () => {
  it.each(["localhost:4198", "127.0.0.1:4198", "[::1]:4198"])(
    "allows same-origin and local command-line clients at %s without reading a body",
    (host) => {
      for (const origin of [undefined, `http://${host}`]) {
        const request = new Request(`http://${host}/api/projects`, {
          method: "POST",
          headers: { host, ...(origin ? { origin } : {}) },
        });
        Object.defineProperty(request, "body", {
          get: () => {
            throw new Error("The boundary must not read or clone upload bytes");
          },
        });
        expect(localRequestRejection(request)).toBeNull();
      }
    },
  );

  const rejectedHeaders: Record<string, string>[] = [
    { host: "evil.example" },
    { host: "localhost.evil.example" },
    { host: "127.0.0.2" },
    { host: "127.0.0.1:4198", origin: "https://evil.example" },
    { host: "127.0.0.1:4198", origin: "null" },
    { host: "127.0.0.1:4198", origin: "http://127.0.0.1:4199" },
    { host: "127.0.0.1:4198", origin: "https://127.0.0.1:4198" },
    { host: "127.0.0.1:4198", "sec-fetch-site": "cross-site" },
  ];
  it.each(rejectedHeaders)(
    "rejects untrusted request metadata %o before body access",
    async (headers) => {
      const request = new Request("http://127.0.0.1:4198/api/projects", {
        method: "POST",
        headers,
      });
      Object.defineProperty(request, "body", {
        get: () => {
          throw new Error("Rejected uploads must not be consumed");
        },
      });
      const response = localRequestRejection(request);
      expect(response?.status).toBe(403);
      expect(await response?.json()).toMatchObject({
        error: { code: "LOCAL_ACCESS_ONLY" },
      });
    },
  );
});
