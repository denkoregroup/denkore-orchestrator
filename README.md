# denkore-orchestrator

Control plane for Denkore agent runs. It tracks each run through a fixed set of
states (spec, design, build/test, verify, release, deploy), holds human approval
gates tied to a specific commit, hands steps to runners, and keeps an
append-only audit log.

Single user: only the Supabase Auth user in `DENKORE_OWNER_USER_ID` can sign in.

## Layout

| Path | What it is |
| --- | --- |
| `app/` | Next.js App Router: `/prompt` (start a run), `/runs` and `/runs/[id]`, `/approvals` (decide gates), `/audit`, `/sites` (stored audit reports), login, webhook and the audit report ingest route |
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
| `scripts/audit-run.ts` | `pnpm audit:run`: audits a site, writes the findings JSON, and with `--post` sends it to the app |
| `lib/site-health/` | Stored audit reports: the signed ingest handler, the Supabase store, owner reads for `/sites`, and `diffReports` (new, still open, fixed). Imports types from `lib/audits`; `lib/audits` never imports it |

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
   `003_functions.sql`, `004_registry_and_audit.sql`, then
   `005_audit_reports.sql`, in that order.
   Nothing runs migrations automatically.
3. Under Authentication, turn off **Allow new users to sign up**. Create the
   owner user by hand and put its UUID in `DENKORE_OWNER_USER_ID`.
4. Create a GitHub OAuth app (GitHub > Settings > Developer settings > OAuth
   Apps > New). Its **Authorization callback URL** is the Supabase project's
   own callback, `https://<project-ref>.supabase.co/auth/v1/callback`. Copy the
   client ID and generate a client secret.
5. In Supabase, under Authentication > Sign In / Providers, enable **GitHub**
   and paste in that client ID and secret.
6. Under URL Configuration, set the **Site URL** to the production URL and add
   these **Redirect URLs**:

   - `http://localhost:3000/**`
   - `https://denkore-orchestrator-*-denkoregroup.vercel.app/**` (Vercel
     previews, for example `denkore-orchestrator-git-<branch>-denkoregroup.vercel.app`)
   - `https://<production-domain>/**`

   The app asks GitHub to return to `<where you signed in from>/auth/callback`.
   Supabase only accepts an address on this list and otherwise falls back to the
   Site URL, so a new preview address or port needs an entry first.
7. Sign in once with the GitHub account whose **verified** email matches the
   owner's. Supabase links it to the existing owner user. If the first sign-in
   fails and the log shows `signup_disabled`, turn on **Allow new users to sign
   up**, sign in once, then turn it off again. Then check Authentication >
   Users: if a second user appeared, set `DENKORE_OWNER_USER_ID` (Vercel
   Production and Preview, and `.env.local`) to its id.
8. Afterwards you can turn off email and password sign-in in Supabase.
9. Under **Settings > API Keys > "Publishable and secret API keys"**, copy the
   publishable key into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and a secret key
   (`sb_secret_...`) into `SUPABASE_SECRET_KEY`. The secret key is server only:
   it acts as the `service_role` Postgres role, so never expose it to the
   browser. Then deactivate the legacy `anon` and `service_role` keys.
10. Put `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` and
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
`x-denkore-signature: sha256=<hex>`). It answers with
`{ checked, advanced, stepsTimedOut, runs }`. A GitHub Actions workflow calls
it every 5 minutes; see [Scheduling the tick](#scheduling-the-tick).

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

## Scheduling the tick

`.github/workflows/conductor-tick.yml` runs `scripts/post-tick.mjs` every 5
minutes (and on demand from the Actions tab). The script posts one signed tick
to the app, retries once on a network error or a server error, and prints the
response, never the secret.

Two one-time steps, in the repository's **Settings > Secrets and variables >
Actions**:

1. Under **Secrets**, add `STEP_WEBHOOK_SECRET` with the same value the app
   uses (the one in Vercel's environment variables).
2. Under **Variables**, add `CONDUCTOR_TICK_URL`: the app's tick address, e.g.
   `https://<production-domain>/api/conductor/tick`.

**When it starts.** GitHub only runs scheduled workflows from the default
branch, so this starts once the stack (the Conductor and this change) is
merged to `main`. GitHub can also delay scheduled runs, sometimes by many
minutes, or skip them when it is busy, so treat every 5 minutes as "usually".
To try it by hand: `TICK_URL=... STEP_WEBHOOK_SECRET=... node scripts/post-tick.mjs`.

## Site audits

`pnpm audit:run` audits a public website: it reads a handful of pages on the
same site, runs fixed checks, prints a plain-language summary, and writes the
findings to a JSON file. No model calls. On its own it needs no credentials
and no database; `--post` (below) also stores the report in the app.

```sh
pnpm audit:run --url https://example.com
pnpm audit:run --project example-app          # uses the registry entry's audits block
pnpm audit:run --url https://example.com --max-pages 10 --out report.json --fail-on warn
pnpm audit:run --project example-app --post https://<app>/api/audits/report   # also store it, see below
```

| Flag | Meaning |
| --- | --- |
| `--url` / `--project` | The site, or a registry entry whose `audits` block names it (`url`, optional `maxPages`, `ignorePaths`). Pass one. |
| `--max-pages` | Pages to read, default 25. |
| `--out` | Where to write the report, default `./audit-report.json` (git-ignored). |
| `--fail-on warn\|fail` | Exit with code 1 if there are findings at that level or worse. Default: never. |
| `--post <url>` | Also send the report to the app's ingest route (see [Storing reports](#storing-reports-and-the-sites-page)). |

**What it checks.** https and the http-to-https redirect, redirect chains and
redirects to other sites, www consistency, robots.txt, the sitemap, broken
internal links, server response time, security headers (informational only),
and on every page: title, description, one main heading, language, phone
viewport, canonical link, Open Graph tags, image alt text and structured data
(JSON-LD).

**How it behaves.** One request at a time, about 250 ms apart, with the user
agent `DenkoreAudit/1.0 (+https://www.denkore.com)`. It stays on the site:
a redirect to another site is reported, never followed. It refuses private,
loopback and link-local addresses. Each request has a 10 s deadline and a
2 MB size cap. It respects robots.txt and honours `HTTPS_PROXY` / `NO_PROXY`.

**Finding format** (`lib/audits/types.ts`, `schemaVersion: 1`). The report is
`{ schemaVersion, target, startedAt, finishedAt, pagesChecked, findings, counts }`;
each finding is `{ id, check, severity, url, message, evidence? }`.

- `severity` is `fail` (clearly broken), `warn` (worth fixing) or `info`.
- `id` is a stable fingerprint of the check, the normalized URL and a
  check-specific key, so the same problem has the same id on every run.
  `/sites` and `diffReports` tell new from known problems by id; changing how
  ids are made is a breaking change.
- `message` is written for the site owner, not a developer.
- Findings are sorted the same way every run: severity, check, URL, id.

**Later slices.** This is layer 1 of the "Scheduled audits" design. Slice 2
(below) stores the output and shows it; later slices run it on a schedule and
triage it. The items held back for them (scheduling, model triage, Lighthouse
and axe checks, and follow-ups to storage) are in `docs/backlog.md`. The exact
split into slices 3 to 6 follows that design doc, which is not in this
repository.

### Storing reports and the Sites page

`--post <url>` sends the finished report to `POST /api/audits/report`, so the
app keeps it and `/sites` can show it.

1. Run `supabase/sql/005_audit_reports.sql` in the Supabase SQL editor. It
   adds one table, `audit_reports`: the owner can read it, the secret key can
   read and insert, and nobody can update or delete a row.
2. Put the same `STEP_WEBHOOK_SECRET` the app uses in your environment or
   `.env.local` (`pnpm audit:run` reads `.env.local`). No new variable.
3. Run `pnpm audit:run --project example-app --post https://<app>/api/audits/report`.
   With `--project`, the report is linked to that project once `pnpm registry:sync`
   has created it; with `--url` it is stored without a project.

The script checks the address and the secret before it crawls, refuses
`http://` unless the host is `localhost`, never follows a redirect, and never
prints the secret.

The route is signed like the step-complete webhook and the Conductor tick
(HMAC-SHA256 of the raw body, in `x-denkore-signature: sha256=<hex>`), and the
proxy skips it. It accepts only `schemaVersion: 1` reports whose `target` is a
web address, and answers 400 with the reasons otherwise. A report is identified
by its site and start time: posting the same one again is acknowledged
(`"status": "duplicate"`) but stored once.

**/sites** lists each audited site with its latest counts and date. Opening a
site shows that report grouped as Needs fixing, Worth fixing and Good to know,
and, compared with the report just before it, what is new and what was fixed.
Findings are matched by id, so a problem that changes from Worth fixing to
Needs fixing is still the same problem.

## Test

```sh
pnpm test        # Jest + React Testing Library, no live database
pnpm typecheck
pnpm lint
pnpm build
```

CI runs typecheck, lint, and tests on every pull request.
