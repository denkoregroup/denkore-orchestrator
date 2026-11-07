/**
 * Sending a finished report to the app (`pnpm audit:run --post <url>`).
 *
 * The signature is the same HMAC-SHA256 scheme as lib/webhooks/signature.ts
 * (over the raw body, in x-denkore-signature as `sha256=<hex>`). It is written
 * out here because lib/audits may not import from the rest of the app; a test
 * checks the two stay compatible.
 */
import { createHmac } from "node:crypto";
import { z } from "zod";
import type { AuditReport } from "./types";

export const SIGNATURE_HEADER = "x-denkore-signature";
const TIMEOUT_MS = 30_000;

/** The address to post to. https, or http only for localhost. */
export function parsePostUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`--post needs a full address such as https://your-app.example/api/audits/report, got "${raw}"`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) {
    throw new Error(`--post only sends to https addresses (http is allowed for localhost only), got ${url.protocol}//${url.host}`);
  }
  return url;
}

/** The exact body and headers to send. Sign the string, send the same string. */
export function buildPostRequest(input: { report: AuditReport; registryId?: string; secret: string }) {
  const body = JSON.stringify(input.registryId === undefined ? { report: input.report } : { registryId: input.registryId, report: input.report });
  const signature = `sha256=${createHmac("sha256", input.secret).update(body, "utf8").digest("hex")}`;
  return { body, headers: { "content-type": "application/json", [SIGNATURE_HEADER]: signature } };
}

const responseSchema = z.object({ status: z.enum(["recorded", "duplicate"]), projectLinked: z.boolean() });
export type PostResult = z.infer<typeof responseSchema>;

/** Sends the request. Throws, with the server's answer, on anything but success. Never follows a redirect. */
export async function postReport(url: URL, request: ReturnType<typeof buildPostRequest>): Promise<PostResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    // fetch hides the reason in `cause` ("connect ECONNREFUSED ...", "getaddrinfo ENOTFOUND ...").
    // A name with several addresses (localhost) gives an AggregateError with no message, only a code.
    // A timeout has no cause at all.
    const error = e as Error;
    const cause = error.cause as (Error & { code?: string }) | undefined;
    throw new Error(`Could not send the report to ${url.origin}: ${cause?.message || cause?.code || error.message}`);
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`The app refused the report (${response.status}): ${text.slice(0, 500)}`);
  return responseSchema.parse(JSON.parse(text));
}
