#!/usr/bin/env node
/**
 * Posts one Duet run report to the app, signed. Run by the Run report workflow
 * (.github/workflows/run-report.yml), which a scheduled run starts with its
 * report as the workflow's input. The runs never hold the signing secret.
 *
 *   REPORT_JSON='{"schemaVersion":1,...}' CONDUCTOR_TICK_URL=https://<app>/api/conductor/tick \
 *     STEP_WEBHOOK_SECRET=... node scripts/post-run-report.mjs
 *
 * The address is RUN_REPORT_URL when set, otherwise /api/conductor/run-report
 * on the same app as CONDUCTOR_TICK_URL. The app checks the report itself and
 * answers 400 with the reasons when it is wrong; that answer is printed and the
 * job fails. Retries once on a network error or a 5xx. Never prints the secret
 * or the signature.
 *
 * Plain Node (20 or later): no dependencies, no build step.
 */
import { createHmac } from "node:crypto";

const ATTEMPTS = 2;
const TIMEOUT_MS = Number(process.env.RUN_REPORT_TIMEOUT_MS ?? 30_000);
const RETRY_DELAY_MS = Number(process.env.RUN_REPORT_RETRY_DELAY_MS ?? 5_000);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const secret = process.env.STEP_WEBHOOK_SECRET;
if (!secret) fail("STEP_WEBHOOK_SECRET is not set.");

let url;
try {
  url = process.env.RUN_REPORT_URL
    ? new URL(process.env.RUN_REPORT_URL)
    : new URL("/api/conductor/run-report", process.env.CONDUCTOR_TICK_URL);
} catch {
  fail("Set RUN_REPORT_URL, or CONDUCTOR_TICK_URL so the address can be worked out.");
}
if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
  fail(`Only https addresses are allowed (http for localhost only), got ${url.protocol}//${url.host}`);
}

let report;
try {
  report = JSON.parse(process.env.REPORT_JSON ?? "");
} catch {
  fail("REPORT_JSON is not valid JSON.");
}
if (report === null || typeof report !== "object" || Array.isArray(report)) fail("REPORT_JSON must be a JSON object.");

// Sign the exact string that is sent.
const body = JSON.stringify(report);
const signature = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

function redact(text) {
  return text.split(signature).join("[redacted]").split(secret).join("[redacted]");
}

async function post() {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-denkore-signature": signature },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: response.status, body: await response.text() };
}

console.log(`Sending the ${report.registryId ?? "unnamed"} run report to ${url.origin}`);
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
