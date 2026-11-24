#!/usr/bin/env node
/**
 * Fetches David's answers to the newest run report of one project, signed, and prints them as
 * plain text in the job log. Run by the Run answers workflow (.github/workflows/run-answers.yml),
 * which a scheduled run starts before it works. The runs never hold the signing secret.
 *
 *   REGISTRY_ID=honeybees CONDUCTOR_TICK_URL=https://<app>/api/conductor/tick \
 *     STEP_WEBHOOK_SECRET=... node scripts/fetch-run-answers.mjs
 *
 * The address is RUN_ANSWERS_URL when set, otherwise /api/conductor/run-answers on the same app as
 * CONDUCTOR_TICK_URL. Retries once on a network error or a 5xx. Never prints the secret or the
 * signature.
 *
 * Plain Node (20 or later): no dependencies, no build step.
 */
import { createHmac } from "node:crypto";

const ATTEMPTS = 2;
const TIMEOUT_MS = Number(process.env.RUN_ANSWERS_TIMEOUT_MS ?? 30_000);
const RETRY_DELAY_MS = Number(process.env.RUN_ANSWERS_RETRY_DELAY_MS ?? 5_000);

function fail(message) {
  console.error(message);
  process.exit(1);
}

const secret = process.env.STEP_WEBHOOK_SECRET;
if (!secret) fail("STEP_WEBHOOK_SECRET is not set.");

const registryId = process.env.REGISTRY_ID ?? "";
if (!/^[a-z0-9-]+$/.test(registryId)) fail("REGISTRY_ID must be a registry id, like honeybees.");

let url;
try {
  url = process.env.RUN_ANSWERS_URL
    ? new URL(process.env.RUN_ANSWERS_URL)
    : new URL("/api/conductor/run-answers", process.env.CONDUCTOR_TICK_URL);
} catch {
  fail("Set RUN_ANSWERS_URL, or CONDUCTOR_TICK_URL so the address can be worked out.");
}
if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
  fail(`Only https addresses are allowed (http for localhost only), got ${url.protocol}//${url.host}`);
}

// Sign the exact string that is sent.
const body = JSON.stringify({ registryId });
const signature = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

function redact(text) {
  return text.split(signature).join("[redacted]").split(secret).join("[redacted]");
}

/** One line of plain text, with no "===", so an answer can't fake or cut the block's markers. */
function oneLine(value) {
  return String(value).replace(/\s+/g, " ").replace(/={3,}/g, "==").trim();
}

function print(result) {
  const header = `=== Answers from David for ${registryId} ===`;
  const lines = [header];
  if (!result.runStartedAt) {
    lines.push("No run report from this project yet.");
  } else if (result.answers.length === 0) {
    lines.push(`No answers yet to the run that started ${oneLine(result.runStartedAt)}.`);
  } else {
    lines.push(`To the run that started ${oneLine(result.runStartedAt)}:`);
    for (const a of result.answers) {
      lines.push(`${a.number}. ${oneLine(a.question)}`);
      lines.push(`   Answer: ${oneLine(a.answer)}`);
    }
  }
  lines.push("=== End of answers ===");
  console.log(lines.join("\n"));
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

console.log(`Fetching David's answers for ${registryId} from ${url.origin}`);
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
  if (result.status >= 200 && result.status < 300) {
    let parsed;
    try {
      parsed = JSON.parse(result.body);
    } catch {
      fail("The app's answer was not JSON.");
    }
    if (!parsed || !Array.isArray(parsed.answers)) fail("The app's answer had no answers list.");
    print(parsed);
    process.exit(0);
  }
  console.log(redact(result.body));
  if (result.status >= 500 && attempt < ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    continue;
  }
  process.exit(1);
}
