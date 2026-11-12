const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** A forwarded header may hold a list ("https,http"); the first entry is the client-facing one. */
const first = (value: string | null) => value?.split(",")[0].trim() || null;

/**
 * The origin the browser used to reach the app, for links that must come back
 * to the same place (localhost, a Vercel preview, production).
 *
 * The Origin header when it is there; otherwise the host, with https unless the
 * host is local. There is deliberately no default: with neither, it throws,
 * rather than sending a sign-in link to a hardcoded address.
 */
export function requestOrigin(headers: Pick<Headers, "get">): string {
  const origin = headers.get("origin");
  // Browsers send the literal string "null" from opaque contexts; that is no origin at all.
  if (origin && origin !== "null") return new URL(origin).origin;

  const host = first(headers.get("x-forwarded-host")) ?? headers.get("host");
  if (!host) throw new Error("Cannot tell where the app is served from: the request has no Origin or Host header");
  const proto = first(headers.get("x-forwarded-proto")) ?? (LOCAL_HOST.test(host) ? "http" : "https");
  return new URL(`${proto}://${host}`).origin;
}
