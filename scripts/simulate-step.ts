/**
 * pnpm conductor:simulate --url http://localhost:3000 --run <id> --step spec [--attempt 1] [--fail]
 *
 * Fakes a step completion for hand testing: posts a correctly signed payload
 * to /api/webhooks/step-complete, signed with STEP_WEBHOOK_SECRET from
 * .env.local. Refuses non-localhost URLs unless --allow-remote is passed.
 * Prints what it sent, never the secret.
 */
import { buildSimulatedCompletion, parseSimulateArgs, USAGE } from "../lib/conductor/simulate";
import { SIGNATURE_HEADER, sign } from "../lib/webhooks/signature";

async function main() {
  const parsed = parseSimulateArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    console.error(USAGE);
    process.exit(1);
  }
  const { url, runId, step, attempt, fail } = parsed.args;

  const secret = process.env.STEP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Missing STEP_WEBHOOK_SECRET. Add it to .env.local (see .env.example).");
    process.exit(1);
  }

  const payload = buildSimulatedCompletion({ runId, step, attempt, fail });
  const body = JSON.stringify(payload);
  const endpoint = new URL("/api/webhooks/step-complete", url);

  console.log(`POST ${endpoint.href}`);
  console.log(JSON.stringify(payload, null, 2));

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", [SIGNATURE_HEADER]: sign(body, secret) },
    body,
  });
  const text = await response.text();
  console.log(`-> ${response.status} ${text}`);
  if (!response.ok) process.exit(1);
  if (text.includes('"duplicate"')) {
    console.log("Already recorded: nothing changed. Use --attempt to complete a later attempt.");
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "simulate failed");
  process.exit(1);
});
