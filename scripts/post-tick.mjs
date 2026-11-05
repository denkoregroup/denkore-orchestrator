#!/usr/bin/env node
/**
 * Posts one signed tick to the Conductor's tick route.
 *
 *   TICK_URL=https://<app>/api/conductor/tick STEP_WEBHOOK_SECRET=... node scripts/post-tick.mjs
 *
 * The body is exactly `{}`; the signature is HMAC-SHA256 of those bytes with
 * STEP_WEBHOOK_SECRET, sent as `x-denkore-signature: sha256=<hex>`, the scheme
 * the route verifies. Retries once on a network error or a 5xx. Exits 0 on a
 * 2xx, 1 otherwise. Prints the status and response body; never the secret or
 * the signature.
 *
 * Plain Node (20 or later): no dependencies, no build step.
 */
import { createHmac } from "node:crypto";

const BODY = "{}";
const ATTEMPTS = 2;
const TIMEOUT_MS = Number(process.env.TICK_TIMEOUT_MS ?? 60_000);
const RETRY_DELAY_MS = Number(process.env.TICK_RETRY_DELAY_MS ?? 5_000);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const url = process.env.TICK_URL;
const secret = process.env.STEP_WEBHOOK_SECRET;
if (!url) fail("TICK_URL is not set.");
if (!secret) fail("STEP_WEBHOOK_SECRET is not set.");
try {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
} catch {
  fail("TICK_URL is not an http(s) URL.");
}

const signature = `sha256=${createHmac("sha256", secret).update(BODY, "utf8").digest("hex")}`;

/** One POST. Returns { status, body } or throws on a network error or timeout. */
async function post() {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-denkore-signature": signature },
    body: BODY,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: response.status, body: await response.text() };
}

/** Never echo the secret or signature, even if a server reflects them back. */
function redact(text) {
  return text.split(signature).join("[redacted]").split(secret).join("[redacted]");
}

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  let result;
  try {
    result = await post();
  } catch (error) {
    const reason = error?.name === "TimeoutError" ? `no response within ${TIMEOUT_MS} ms` : (error?.cause?.code ?? error?.message ?? "network error");
    console.log(`attempt ${attempt}: network error (${redact(String(reason))})`);
    if (attempt < ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      continue;
    }
    process.exit(1);
  }

  console.log(`attempt ${attempt}: status ${result.status}`);
  console.log(redact(result.body));
  if (result.status >= 200 && result.status < 300) process.exit(0);
  if (result.status >= 500 && attempt < ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    continue;
  }
  process.exit(1);
}
