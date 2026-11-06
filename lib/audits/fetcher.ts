/**
 * The only module in lib/audits that touches the network.
 *
 * - Plain node:http/https, GET only, with the DenkoreAudit user agent.
 * - Follows redirects itself, only within the target site (same hostname,
 *   www-insensitive). A redirect anywhere else is not followed; it comes back
 *   as a `cross_host_redirect` error for the checks to report.
 * - Refuses private, loopback and link-local addresses unless allowLocal is
 *   set. Without a proxy the check runs on the address actually connected to
 *   (a guarded DNS lookup), so a hostname cannot resolve one way for the check
 *   and another for the connection.
 * - Honours the standard HTTPS_PROXY / NO_PROXY variables by tunnelling with
 *   CONNECT. Behind a proxy the proxy resolves names, so only literal IPs,
 *   localhost names and whatever local DNS can resolve are checked.
 * - Per-request deadline, response size cap, and a pause between requests.
 *
 * Imports are relative (no @/ alias) so the CLI can load this under ts-node.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type Socket } from "node:net";
import tls from "node:tls";

export const USER_AGENT = "DenkoreAudit/1.0 (+https://denkoregroup.com)";

export const FETCH_DEFAULTS = {
  timeoutMs: 10_000,
  maxBytes: 2 * 1024 * 1024,
  delayMs: 250,
  maxRedirects: 5,
} as const;

export type FetchErrorKind =
  | "timeout"
  | "too_large"
  | "private_address"
  | "cross_host_redirect"
  | "too_many_redirects"
  | "network"
  | "invalid_url";

export interface RedirectHop {
  from: string;
  to: string;
  status: number;
}

export interface FetchResult {
  /** The URL that was asked for. */
  url: string;
  /** The last URL reached after following same-site redirects. */
  finalUrl: string;
  /** Status of the last response, or null if none arrived. */
  status: number | null;
  /** Lowercased header names; repeated headers joined with ", ". */
  headers: Record<string, string>;
  /** UTF-8 body; empty when there was an error. */
  body: string;
  /** Time to the first response headers of the last hop. */
  ttfbMs: number | null;
  redirects: RedirectHop[];
  error: { kind: FetchErrorKind; message: string; location?: string } | null;
}

export interface Fetcher {
  fetch(url: string): Promise<FetchResult>;
}

export interface FetcherOptions {
  timeoutMs?: number;
  maxBytes?: number;
  delayMs?: number;
  maxRedirects?: number;
  /** Allow private, loopback and link-local addresses. Tests only. */
  allowLocal?: boolean;
  /** Proxy URL; defaults to HTTPS_PROXY / https_proxy. Pass null for a direct connection. */
  proxy?: string | null;
  /** Hosts that bypass the proxy; defaults to NO_PROXY / no_proxy. */
  noProxy?: string;
  /** Extra trusted certificate authority (PEM), e.g. a test server's self-signed cert. */
  ca?: string;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** "example.com" and "www.example.com" are the same site. */
export function siteHostOf(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host.startsWith("www.") ? host.slice(4) : host;
}

export function isSameSite(a: URL, b: URL): boolean {
  return siteHostOf(a.hostname) === siteHostOf(b.hostname);
}

// ---------------------------------------------------------------------------
// Address safety

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

const PRIVATE_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata lives here)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 3], // multicast and reserved
];

function inV4Range(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

/** True for addresses an auditor of public websites must never connect to. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(ip) === 4) return PRIVATE_V4.some(([base, bits]) => inV4Range(ip, base, bits));
  if (isIP(ip) === 6) {
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (ip === "::" || ip === "::1") return true;
    return /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip); // unique-local, link-local, multicast
  }
  return true; // not an IP at all: refuse rather than guess
}

function isLocalName(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal");
}

class PrivateAddressError extends Error {
  constructor(readonly address: string) {
    super(`refusing to connect to private address ${address}`);
  }
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** A dns.lookup replacement for http.request that refuses private results. */
function guardedLookup(allowLocal: boolean) {
  return (hostname: string, options: { all?: boolean; family?: number }, callback: LookupCallback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, []);
      const blocked = !allowLocal && addresses.find((a) => isPrivateAddress(a.address));
      if (blocked) return callback(new PrivateAddressError(blocked.address) as NodeJS.ErrnoException, []);
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

// ---------------------------------------------------------------------------
// Proxy

function proxyFor(target: URL, options: FetcherOptions): URL | null {
  const proxy = options.proxy === undefined ? process.env.HTTPS_PROXY ?? process.env.https_proxy : options.proxy;
  if (!proxy) return null;
  const noProxy = options.noProxy ?? process.env.NO_PROXY ?? process.env.no_proxy ?? "";
  const host = target.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  for (const raw of noProxy.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)) {
    if (raw === "*") return null;
    if (raw.includes("/") && isIP(host) === 4 && isIP(raw.split("/")[0]) === 4) {
      const [base, bits] = raw.split("/");
      if (inV4Range(host, base, Number(bits))) return null;
      continue;
    }
    const entry = raw.replace(/^\*?\./, "");
    if (host === entry || host.endsWith(`.${entry}`)) return null;
  }
  return new URL(proxy);
}

function openTunnel(proxy: URL, target: URL, deadline: AbortSignal): Promise<Socket> {
  const port = target.port || (target.protocol === "https:" ? "443" : "80");
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: "CONNECT",
      path: `${target.hostname}:${port}`,
      headers: { host: `${target.hostname}:${port}`, "user-agent": USER_AGENT },
      signal: deadline,
    });
    request.on("connect", (response, socket) => {
      if (response.statusCode === 200) resolve(socket);
      else {
        socket.destroy();
        reject(new Error(`proxy refused the connection (${response.statusCode})`));
      }
    });
    request.on("error", reject);
    request.end();
  });
}

// ---------------------------------------------------------------------------
// One request

interface RawResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  ttfbMs: number;
}

class FetchError extends Error {
  constructor(
    readonly kind: FetchErrorKind,
    message: string,
  ) {
    super(message);
  }
}

function joinHeaders(raw: http.IncomingHttpHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    headers[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return headers;
}

async function requestOnce(url: URL, options: Required<Pick<FetcherOptions, "timeoutMs" | "maxBytes">> & FetcherOptions, now: () => number): Promise<RawResponse> {
  const allowLocal = options.allowLocal === true;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowLocal && ((isIP(host) && isPrivateAddress(host)) || isLocalName(host))) {
    throw new FetchError("private_address", `refusing to connect to private address ${host}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const started = now();
  try {
    const proxy = proxyFor(url, options);
    let createConnection: (() => Socket) | undefined;
    if (proxy) {
      // The proxy resolves the name. Check what local DNS can see; if it can't resolve, rely on the proxy.
      if (!allowLocal && !isIP(host)) {
        const addresses = await new Promise<LookupAddress[]>((resolve) =>
          dnsLookup(host, { all: true }, (err, list) => resolve(err ? [] : list)),
        );
        const blocked = addresses.find((a) => isPrivateAddress(a.address));
        if (blocked) throw new FetchError("private_address", `refusing to connect to private address ${blocked.address}`);
      }
      const tunnel = await openTunnel(proxy, url, controller.signal);
      const socket =
        url.protocol === "https:"
          ? tls.connect({ socket: tunnel, servername: isIP(host) ? undefined : host, ca: options.ca ? [...tls.rootCertificates, options.ca] : undefined })
          : tunnel;
      // Until the request takes the socket over, a reset must not crash the process.
      tunnel.on("error", () => {});
      createConnection = () => socket;
    }

    return await new Promise<RawResponse>((resolve, reject) => {
      const client = url.protocol === "https:" ? https : http;
      const request = client.request(url, {
        method: "GET",
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
          "accept-encoding": "identity",
        },
        signal: controller.signal,
        // Through a proxy: no agent at all, so Node uses the tunnelled socket.
        // (agent: false would make a fresh agent, which ignores createConnection
        // and connects directly, bypassing the proxy.)
        ...(createConnection
          ? { createConnection }
          : {
              agent: false,
              lookup: guardedLookup(allowLocal) as unknown as http.RequestOptions["lookup"],
              ...(options.ca && url.protocol === "https:" ? { ca: [...tls.rootCertificates, options.ca] } : {}),
            }),
      });
      request.on("response", (response) => {
        const ttfbMs = now() - started;
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            reject(new FetchError("too_large", `response is larger than ${options.maxBytes} bytes`));
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: joinHeaders(response.headers),
            body: new TextDecoder().decode(Buffer.concat(chunks)),
            ttfbMs,
          }),
        );
        response.on("error", reject);
      });
      request.on("error", reject);
      request.end();
    });
  } catch (e) {
    if (e instanceof FetchError) throw e;
    if (controller.signal.aborted) throw new FetchError("timeout", `no complete response within ${options.timeoutMs} ms`);
    if (e instanceof PrivateAddressError || (e as { cause?: unknown }).cause instanceof PrivateAddressError) {
      throw new FetchError("private_address", (e as Error).message);
    }
    throw new FetchError("network", (e as Error).message || "network error");
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createFetcher(options: FetcherOptions = {}): Fetcher {
  const settings = {
    ...options,
    timeoutMs: options.timeoutMs ?? FETCH_DEFAULTS.timeoutMs,
    maxBytes: options.maxBytes ?? FETCH_DEFAULTS.maxBytes,
  };
  const delayMs = options.delayMs ?? FETCH_DEFAULTS.delayMs;
  const maxRedirects = options.maxRedirects ?? FETCH_DEFAULTS.maxRedirects;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => performance.now());
  let lastRequestAt: number | null = null;

  async function politely<T>(work: () => Promise<T>): Promise<T> {
    if (lastRequestAt !== null) {
      const wait = delayMs - (now() - lastRequestAt);
      if (wait > 0) await sleep(wait);
    }
    try {
      return await work();
    } finally {
      lastRequestAt = now();
    }
  }

  return {
    async fetch(rawUrl: string): Promise<FetchResult> {
      const result: FetchResult = { url: rawUrl, finalUrl: rawUrl, status: null, headers: {}, body: "", ttfbMs: null, redirects: [], error: null };
      let current: URL;
      try {
        current = new URL(rawUrl);
        if (current.protocol !== "http:" && current.protocol !== "https:") throw new Error("not http(s)");
      } catch {
        result.error = { kind: "invalid_url", message: `not a web address: ${rawUrl}` };
        return result;
      }
      const origin = current;

      for (let hop = 0; ; hop++) {
        let response: RawResponse;
        try {
          response = await politely(() => requestOnce(current, settings, now));
        } catch (e) {
          const error = e instanceof FetchError ? e : new FetchError("network", String(e));
          result.error = { kind: error.kind, message: error.message };
          return result;
        }
        Object.assign(result, { finalUrl: current.toString(), status: response.status, headers: response.headers, ttfbMs: response.ttfbMs });

        const location = response.headers.location;
        if (response.status >= 300 && response.status < 400 && location) {
          let next: URL;
          try {
            next = new URL(location, current);
          } catch {
            result.error = { kind: "network", message: `redirect to an invalid address: ${location}` };
            return result;
          }
          if (!isSameSite(origin, next) || (next.protocol !== "http:" && next.protocol !== "https:")) {
            result.error = { kind: "cross_host_redirect", message: `redirects to another site: ${next.host}`, location: next.toString() };
            return result;
          }
          if (hop + 1 > maxRedirects) {
            result.error = { kind: "too_many_redirects", message: `more than ${maxRedirects} redirects` };
            return result;
          }
          result.redirects.push({ from: current.toString(), to: next.toString(), status: response.status });
          current = next;
          continue;
        }
        result.body = response.body;
        return result;
      }
    },
  };
}
