import { describe, expect, it } from "vitest";
import { isAllowedLocalRequest } from "./local-request-guard";
describe("private local studio access", () => {
  it.each(["localhost:3000", "127.0.0.1:3000", "[::1]:3000"])(
    "allows same-origin local requests at %s",
    (host) => {
      expect(
        isAllowedLocalRequest(new Headers({ host, origin: `http://${host}` })),
      ).toBe(true);
      expect(isAllowedLocalRequest(new Headers({ host }))).toBe(true);
    },
  );
  it.each([
    "evil.example",
    "localhost.evil.example",
    "localhost:3000@evil.example",
    "127.0.0.2",
    "",
  ])("rejects foreign/malformed host %s", (host) => {
    expect(isAllowedLocalRequest(new Headers({ host }))).toBe(false);
  });
  it.each([
    "https://evil.example",
    "null",
    "http://localhost:3001",
    "https://localhost:3000",
  ])("rejects foreign/null Origin %s", (origin) => {
    expect(
      isAllowedLocalRequest(new Headers({ host: "localhost:3000", origin })),
    ).toBe(false);
  });
  it("rejects browser cross-site requests even without Origin", () => {
    expect(
      isAllowedLocalRequest(
        new Headers({ host: "localhost:3000", "sec-fetch-site": "cross-site" }),
      ),
    ).toBe(false);
  });
});
