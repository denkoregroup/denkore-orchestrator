import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export interface Route {
  status?: number;
  headers?: Record<string, string>;
  body?: string | (() => string);
  /** Wait this long before sending headers. */
  delayMs?: number;
  /** Never respond. */
  hang?: boolean;
}

export type Routes = Record<string, Route | ((path: string) => Route)>;

export interface FixtureServer {
  origin: string;
  port: number;
  /** Request paths in arrival order, with the user agent that sent them. */
  hits: Array<{ path: string; userAgent: string | undefined }>;
  close(): Promise<void>;
}

/**
 * A throwaway self-signed certificate for 127.0.0.1, made with openssl at
 * test time and deleted straight away. Nothing is committed.
 */
export function makeTestCertificate(): { key: string; cert: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "audit-cert-"));
  try {
    execFileSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256", "-nodes", "-days", "1",
        "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
        "-keyout", path.join(dir, "key.pem"), "-out", path.join(dir, "cert.pem"),
      ],
      { stdio: "ignore" },
    );
    return { key: readFileSync(path.join(dir, "key.pem"), "utf8"), cert: readFileSync(path.join(dir, "cert.pem"), "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function handler(routes: Routes, fallback: Route, hits: FixtureServer["hits"]) {
  return (request: http.IncomingMessage, response: http.ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://fixture");
    hits.push({ path: url.pathname + url.search, userAgent: request.headers["user-agent"] });
    const entry = routes[url.pathname];
    const route = typeof entry === "function" ? entry(url.pathname) : (entry ?? fallback);
    if (route.hang) return; // keep the socket open, never answer
    const send = () => {
      if (response.destroyed) return;
      const body = typeof route.body === "function" ? route.body() : (route.body ?? "");
      response.writeHead(route.status ?? 200, { "content-type": "text/html; charset=utf-8", ...route.headers });
      response.end(body);
    };
    if (route.delayMs) setTimeout(send, route.delayMs);
    else send();
  };
}

export async function startServer(
  routes: Routes,
  options: { tls?: { key: string; cert: string }; fallback?: Route } = {},
): Promise<FixtureServer> {
  const hits: FixtureServer["hits"] = [];
  const sockets = new Set<net.Socket>();
  const fallback = options.fallback ?? { status: 404, body: "<html lang=en><title>Not found</title></html>" };
  const server = options.tls
    ? https.createServer({ key: options.tls.key, cert: options.tls.cert }, handler(routes, fallback, hits))
    : http.createServer(handler(routes, fallback, hits));
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    origin: `${options.tls ? "https" : "http"}://127.0.0.1:${port}`,
    port,
    hits,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

/** A minimal HTTP CONNECT proxy, to exercise the fetcher's proxy path. */
export async function startConnectProxy(): Promise<{ url: string; tunnels: string[]; close(): Promise<void> }> {
  const tunnels: string[] = [];
  const sockets = new Set<net.Socket>();
  const server = http.createServer((_req, res) => {
    res.writeHead(405);
    res.end();
  });
  server.on("connect", (request, client: net.Socket) => {
    tunnels.push(request.url ?? "");
    const [host, port] = (request.url ?? "").split(":");
    const upstream = net.connect(Number(port), host, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.pipe(client);
      client.pipe(upstream);
    });
    for (const s of [client, upstream]) {
      sockets.add(s);
      s.on("error", () => s.destroy());
      s.on("close", () => sockets.delete(s));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    tunnels,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
