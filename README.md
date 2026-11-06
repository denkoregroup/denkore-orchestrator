# denkore-orchestrator

Control plane for Denkore agent runs. It tracks each run through a fixed set of
states (spec, design, build/test, verify, release, deploy), holds human approval
gates tied to a specific commit, hands steps to runners, and keeps an
append-only audit log.

Single user: only the Supabase Auth user in `DENKORE_OWNER_USER_ID` can sign in.

## Layout

| Path | What it is |
| --- | --- |
| `app/` | Next.js App Router: `/prompt` (start a run), `/runs` and `/runs/[id]`, `/approvals` (decide gates), `/audit`, login, webhook |
| `proxy.ts` | Refreshes the Supabase session and redirects anyone but the owner to `/login` |
| `lib/data/` | Data access layer for pages and actions: checks the owner, then queries as the user (RLS applies); rows parsed with zod |
| `lib/approvals/` | Gate card types, the `gateReview` schema, approval mode, decision rules |
| `lib/runs/` | Plain-language labels for run states, steps and events; the prompt form schema |
| `lib/state-machine/` | Run states, allowed transitions, gates (pure functions) |
| `lib/step-runner/` | `StepRunner` interface and a stub GitHub Actions runner |
| `lib/registry/` | Zod schema and loader for `registry/*.yaml` |
| `lib/webhooks/` | HMAC verification and the idempotent step-complete handler |
| `lib/conductor/` | The Conductor: `decide()` (pure next action), `advanceRun()` (applies it), the shared agent contract, limits, and its stores |
| `supabase/sql/` | Schema, RLS, and triggers to paste into Supabase by hand |
| `scripts/registry-sync.ts` | `pnpm registry:sync`: upserts one project per registry entry |
| `scripts/simulate-step.ts` | `pnpm conductor:simulate`: fakes a step completion for hand testing |

## Run

Requires Node 22+ and pnpm.

```sh
pnpm install
cp .env.example .env.local   # fill in values
pnpm dev
```

The database is set up by hand; see [Supabase setup](#supabase-setup).

## Supabase setup

1. Create the project in a paid organization. Free projects pause after a week
   of inactivity, and a paused project drops incoming webhooks.
2. In the SQL editor, run `supabase/sql/001_tables.sql`, `002_rls.sql`,
   `003_functions.sql`, then `004_registry_and_audit.sql`, in that order.
   Nothing runs migrations automatically.
3. Under Authentication, turn off **Allow new users to sign up**. Create the
   owner user by hand and put its UUID in `DENKORE_OWNER_USER_ID`.
4. Edit the **Magic Link** email template so the link is:

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
   ```

5. Under URL Configuration, set the **Site URL** to the production URL and add
   redirect URLs for local and production, for example
   `http://localhost:3000/**` and `https://<production-domain>/**`.
6. Under **Settings > API Keys > "Publishable and secret API keys"**, copy the
   publishable key into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and a secret key
   (`sb_secret_...`) into `SUPABASE_SECRET_KEY`. The secret key is server only:
   it acts as the `service_role` Postgres role, so never expose it to the
   browser. Then deactivate the legacy `anon` and `service_role` keys.
7. Put `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` and
   `DENKORE_OWNER_USER_ID` in `.env.local`, then run `pnpm registry:sync`. It
   creates one project per `registry/*.yaml` entry and prints what it inserted,
   changed, or left alone. Run it again whenever the registry changes.

## Conductor

The Conductor moves each run through its states on its own. It dispatches
each step to the runner, reacts to completions and to your decisions, and
escalates when a run needs you. The runner is still a stub: nothing is sent
anywhere yet.

**How a run moves.** `advanceRun(runId)` loads the run, asks `decide()` for
the single next action, applies it, and repeats, at most 10 times:

- A new run starts and its plan step is dispatched.
- When a step finishes, the run moves on: plan and design go to a review gate
  at the step's commit, tests and final checks loop until they pass (up to the
  run's retry limit), go-live is followed by a live site check, then done.
- At a gate it waits for you. Approve moves forward; request changes sends it
  back with your note included in the next step's task. If the redo produces
  the same commit, it escalates ("no change was produced").
- It escalates when a step fails where retrying makes no sense, after too
  many test failures, more than 20 steps, or more than $15 of cost.
  Escalations show on the run's history with the reason.
- A step that never reports back (runner crashed, workflow cancelled, webhook
  lost) is marked failed 35 minutes after it was dispatched: the step timeout
  plus a grace period. Then the usual failure handling runs, so the build
  retries within the run's retry limit, and a plan step escalates. Each
  timed-out attempt counts toward the 20-step limit. If the lost completion
  turns up later it is recorded, but it never moves the run.

**Limits** (`lib/conductor/limits.ts`; starting values, to revisit once real
runs exist):

| Limit | Value | What happens |
| --- | --- | --- |
| `maxStepsPerRun` | 20 | A run that would need more steps escalates. Timed-out attempts count. |
| `maxCostUsd` | $15 | A run whose reported step costs pass this escalates. |
| `maxAdvanceLoops` | 10 | `advanceRun` applies at most this many actions per call. |
| `tickBatchSize` | 25 | The tick advances at most this many runs per call. |
| `maxTurns` | 30 | Agent turn cap, sent with every step. |
| `stepTimeoutSeconds` | 1800 (30 min) | Agent wall-clock cap, sent with every step. |
| `stepTimeoutGraceSeconds` | 300 (5 min) | Extra wait before a step that never reported back is marked failed. |

The model is set in one place, `lib/conductor/defaults.ts`: every step uses
`DEFAULT_MODEL` (Sonnet), and `MODEL_OVERRIDES` moves a single step to
another model with one line.

State changes are compare-and-set on the run's state and `updated_at`, and
step and gate rows are protected by their unique keys, so two callers can
never apply the same move twice. The Conductor writes with the secret key
(`service_role`), which still cannot write approvals.

**Triggers.** It runs after the response is sent (`after()`), when:

1. you start a run on `/prompt`,
2. you approve or request changes on `/approvals`,
3. the step-complete webhook records a new completion (never for a replay).

**Tick route.** `POST /api/conductor/tick` is the safety net for runs that
stall, and what notices timed-out steps: it advances up to 25 unfinished
runs, the longest-waiting first (least recently changed). It is signed like
the webhook (HMAC-SHA256 of the raw body with `STEP_WEBHOOK_SECRET`, in
`x-denkore-signature: sha256=<hex>`). Nothing calls it on a schedule yet.

**Simulator.** With `pnpm dev` running and `STEP_WEBHOOK_SECRET` in
`.env.local`, fake the step a run is waiting on:

```sh
pnpm conductor:simulate --url http://localhost:3000 --run <run id> --step spec
pnpm conductor:simulate --url http://localhost:3000 --run <run id> --state build_test --fail
pnpm conductor:simulate --url http://localhost:3000 --run <run id> --step build_test --attempt 2
```

`--step` names the step, or `--state` infers it from the run's state. Pass
`--attempt <n>` to complete a retry (the run page shows the try number).
It refuses any URL that is not localhost unless you add `--allow-remote`,
and prints what it sent, never the secret.

## Test

```sh
pnpm test        # Jest + React Testing Library, no live database
pnpm typecheck
pnpm lint
pnpm build
```

CI runs typecheck, lint, and tests on every pull request.
