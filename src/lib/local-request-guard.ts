export function isAllowedLocalRequest(
  headers: Headers,
  protocol = "http:",
): boolean {
  const host = headers.get("host");
  if (!host || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host))
    return false;
  const origin = headers.get("origin");
  if (headers.get("sec-fetch-site") === "cross-site") return false;
  if (!origin) return true; // Local CLI/media clients do not send browser Origin.
  try {
    const source = new URL(origin);
    const expected = new URL(`${protocol}//${host}`);
    return source.origin === expected.origin;
  } catch {
    return false;
  }
}

/** Enforce the same loopback/origin boundary before an upload route reads a body.
 * These routes bypass Proxy because Next clones and buffers Proxy request bodies.
 */
export function localRequestRejection(request: Request): Response | null {
  let allowed = false;
  try {
    allowed = isAllowedLocalRequest(
      request.headers,
      new URL(request.url).protocol,
    );
  } catch {
    // A malformed URL must never bypass the local request boundary.
  }
  return allowed
    ? null
    : Response.json(
        {
          error: {
            message:
              "This private studio accepts same-origin requests on this Mac only.",
            code: "LOCAL_ACCESS_ONLY",
          },
        },
        { status: 403 },
      );
}
