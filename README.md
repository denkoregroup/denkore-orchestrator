# denkore-orchestrator

Control plane for Denkore agent runs. It moves each run through spec, design,
build, verify and deploy, holds approval gates tied to a commit, and keeps an
append-only audit log. Single user: only `DENKORE_OWNER_USER_ID` can sign in.

## Run locally

Needs Node 22+ and pnpm.

```sh
pnpm install
cp .env.example .env.local   # fill in the values; see the setup below
pnpm dev
```

## One-time setup

**Supabase**

- [ ] Create the project. The free plan works: free projects pause after a period of inactivity, and the 5-minute Conductor tick keeps this one active.
- [ ] SQL editor: run `supabase/sql/001_…` to `005_…` in order. Nothing runs migrations for you.
- [ ] Authentication: turn off **Allow new users to sign up**, and create the owner user by hand.
- [ ] Settings > API Keys: copy the publishable key and a secret key (`sb_secret_...`), then deactivate the legacy `anon` and `service_role` keys.
- [ ] Put `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DENKORE_OWNER_USER_ID` and `STEP_WEBHOOK_SECRET` in `.env.local`, then run `pnpm registry:sync`.
- [ ] Sign in with GitHub:
  - [ ] GitHub > Settings > Developer settings > OAuth Apps > New. The callback URL is `https://<project-ref>.supabase.co/auth/v1/callback`. Copy the client ID and generate a secret.
  - [ ] Supabase > Authentication > Sign In / Providers > GitHub: enable it with that client ID and secret.
  - [ ] Authentication > URL Configuration: Site URL is production. Redirect URLs: `http://localhost:3000/**`, `https://denkore-orchestrator-*-denkoregroup.vercel.app/**` (previews) and `https://<production-domain>/**`. Any other address is replaced by the Site URL.
  - [ ] Sign in once with the GitHub account whose **verified** email matches the owner's; Supabase links it to the owner user. If that fails and the log shows `signup_disabled`, turn sign-ups on, sign in once, turn them off. Then check Authentication > Users: if a second user appeared, set `DENKORE_OWNER_USER_ID` to its id (Vercel Production and Preview, and `.env.local`).
  - [ ] Afterwards, turn off email and password sign-in.

**GitHub Actions** (Settings > Secrets and variables > Actions), for the 5-minute Conductor tick and the daily site audit

- [ ] Secret `STEP_WEBHOOK_SECRET`: the same value the app uses (the tick and the daily audit both sign with it).
- [ ] Variable `CONDUCTOR_TICK_URL`: `https://<production-domain>/api/conductor/tick`.
- [ ] Variable `AUDIT_REPORT_URL`: `https://<production-domain>/api/audits/report`.

**Vercel** (Production and Preview)

- [ ] The five variables listed above. `SUPABASE_SECRET_KEY` is server only; never expose it to the browser.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the app on localhost:3000 |
| `pnpm test` | Jest and React Testing Library; no database needed |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint |
| `pnpm build` | Production build |
| `pnpm registry:sync` | Create or update one project row per `registry/*.yaml` entry |
| `pnpm conductor:simulate` | Fake a step completion against a local server (flags: `scripts/simulate-step.ts`) |
| `pnpm audit:run` | Audit a public site and optionally store the report; `--help` lists the flags |
| `pnpm audit:schedule` | The daily job: audit every registered site and store each report (what the workflow runs) |

CI runs typecheck, lint and tests on every pull request.

## Where things are

| Path | What it is |
| --- | --- |
| `app/` | Pages (`/prompt`, `/runs`, `/approvals`, `/sites`, `/activity`, `/login`, and `/check/[reportId]`, the site check for a phone and its one-page PDF) and the API routes. `/activity` is the event log; `/audit` redirects there |
| `proxy.ts` | Refreshes the session and keeps everyone but the owner out |
| `lib/conductor/` | Decides and applies each run's next step; its limits are in `limits.ts` |
| `lib/state-machine/` | Run states and allowed moves |
| `lib/audits/` | The site auditor (CLI: `scripts/audit-run.ts`) |
| `lib/site-check/` | The prospect site check: four lights, a headline and the top three fixes from one report (all wording, and the booking link, in `copy.ts`) |
| `components/site-check/` | The site check view and its QR code |
| `lib/audit-fixes/` | Fix with Conductor on a site report: what can be fixed in code (`lib/audits/checks/catalog.ts`), the run's prompt, and the buttons |
| `lib/site-health/` | Stored audit reports, what changed between two of them, and the missed-run watchdog the tick runs |
| `supabase/sql/` | Schema, RLS and triggers, pasted in by hand |
| `registry/` | One YAML file per project |
| `.github/workflows/` | CI, the Conductor tick and the daily site audit |

Follow-ups are in `docs/backlog.md`; the audit slices are tracked in
[#15](https://github.com/denkoregroup/denkore-orchestrator/issues/15).
