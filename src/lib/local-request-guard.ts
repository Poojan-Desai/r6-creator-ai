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
