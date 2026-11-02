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
| `lib/audits/` | Public-URL site auditor: fetcher (the only network code), crawl, one module per check in `checks/`, report format |
| `scripts/audit-run.ts` | `pnpm audit:run`: audits a site and writes the findings JSON |

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
  many test failures, more than 20 steps, or more than $15 of cost. These
  limits are starting values in `lib/conductor/limits.ts`. Escalations show
  on the run's history with the reason.

State changes are compare-and-set on the run's state and `updated_at`, and
step and gate rows are protected by their unique keys, so two callers can
never apply the same move twice. The Conductor writes with the secret key
(`service_role`), which still cannot write approvals.

**Triggers.** It runs after the response is sent (`after()`), when:

1. you start a run on `/prompt`,
2. you approve or request changes on `/approvals`,
3. the step-complete webhook records a new completion (never for a replay).

**Tick route.** `POST /api/conductor/tick` is the safety net for runs that
stall: it advances up to 25 unfinished runs, oldest first. It is signed like
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

## Site audits

`pnpm audit:run` audits a public website: it reads a handful of pages on the
same site, runs fixed checks, prints a plain-language summary, and writes the
findings to a JSON file. No model calls, no credentials, no database.

```sh
pnpm audit:run --url https://example.com
pnpm audit:run --project example-app          # uses the registry entry's audits block
pnpm audit:run --url https://example.com --max-pages 10 --out report.json --fail-on warn
```

| Flag | Meaning |
| --- | --- |
| `--url` / `--project` | The site, or a registry entry whose `audits` block names it (`url`, optional `maxPages`, `ignorePaths`). Pass one. |
| `--max-pages` | Pages to read, default 25. |
| `--out` | Where to write the report, default `./audit-report.json` (git-ignored). |
| `--fail-on warn\|fail` | Exit with code 1 if there are findings at that level or worse. Default: never. |

**What it checks.** https and the http-to-https redirect, redirect chains and
redirects to other sites, www consistency, robots.txt, the sitemap, broken
internal links, server response time, security headers (informational only),
and on every page: title, description, one main heading, language, phone
viewport, canonical link, Open Graph tags, image alt text and structured data
(JSON-LD).

**How it behaves.** One request at a time, about 250 ms apart, with the user
agent `DenkoreAudit/1.0 (+https://denkoregroup.com)`. It stays on the site:
a redirect to another site is reported, never followed. It refuses private,
loopback and link-local addresses. Each request has a 10 s deadline and a
2 MB size cap. It respects robots.txt and honours `HTTPS_PROXY` / `NO_PROXY`.

**Finding format** (`lib/audits/types.ts`, `schemaVersion: 1`). The report is
`{ schemaVersion, target, startedAt, finishedAt, pagesChecked, findings, counts }`;
each finding is `{ id, check, severity, url, message, evidence? }`.

- `severity` is `fail` (clearly broken), `warn` (worth fixing) or `info`.
- `id` is a stable fingerprint of the check, the normalized URL and a
  check-specific key, so the same problem has the same id on every run.
  Later slices diff runs by id; changing how ids are made is a breaking change.
- `message` is written for the site owner, not a developer.
- Findings are sorted the same way every run: severity, check, URL, id.

**Later slices.** This is layer 1 of the "Scheduled audits" design: later
slices store this output, run it on a schedule, and triage it, using these
ids to tell new problems from known ones. The items held back for them
(storage, scheduling, an owner-facing view, model triage, Lighthouse and axe
checks) are in `docs/backlog.md`. The exact split into slices 2 to 6 follows
that design doc, which is not in this repository.

## Test

```sh
pnpm test        # Jest + React Testing Library, no live database
pnpm typecheck
pnpm lint
pnpm build
```

CI runs typecheck, lint, and tests on every pull request.
