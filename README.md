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

### Local database

Writes during development should not touch production, so run Supabase locally. Needs Docker.

```sh
pnpm db:start   # starts the stack; `pnpm exec supabase status` prints the keys
pnpm db:reset   # applies supabase/migrations, then supabase/seed.sql; wipes local data
pnpm db:stop
```

Put the local block from `.env.example` in `.env.local`. The seed creates the owner (the id in that block) and demo reports (one made-up site with two, so `/sites` shows a diff, and one more linked to a project the owner owns).

**One-time: a GitHub OAuth app for local.** Make a second one, separate from production: GitHub > Settings > Developer settings > OAuth Apps > New, homepage `http://localhost:3000`, callback `http://127.0.0.1:54321/auth/v1/callback`. Put its client ID and a generated secret in `supabase/.env` (git-ignored) as `GITHUB_LOCAL_CLIENT_ID` and `GITHUB_LOCAL_SECRET`, then restart with `pnpm db:stop && pnpm db:start`.

The first GitHub sign-in links to the seeded owner by email, so the GitHub account's **primary, verified** email must be the seeded one. Any other email is refused with `signup_disabled` (sign-ups are off). If yours differs, set `enable_signup = true` in `supabase/config.toml` once, sign in, set `DENKORE_OWNER_USER_ID` in `.env.local` to the new user's id (Studio at `http://127.0.0.1:54323`, Authentication), and set it back to `false`. A reset removes that user, so repeat after one.

## One-time setup

**Supabase**

- [ ] Create the project. The free plan works: free projects pause after a period of inactivity, and the 5-minute Conductor tick keeps this one active.
- [ ] Schema: `supabase/migrations/` is deployed by the **Supabase migrations** workflow (below). Production already has the first five, so before its first run mark them applied, once. With `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` exported, run `pnpm exec supabase link --project-ref <project-ref>`, then `pnpm exec supabase migration repair --status applied <version> --remote` for each of the five version prefixes in `supabase/migrations/` (`--remote` matters: without it the command acts on the local stack). `pnpm exec supabase migration list --remote` should then show them all applied.
- [ ] Authentication: turn off **Allow new users to sign up**, and create the owner user by hand.
- [ ] Settings > API Keys: copy the publishable key and a secret key (`sb_secret_...`), then deactivate the legacy `anon` and `service_role` keys.
- [ ] Put `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DENKORE_OWNER_USER_ID` and `STEP_WEBHOOK_SECRET` in `.env.local`, then run `pnpm registry:sync`.
- [ ] Sign in with GitHub:
  - [ ] GitHub > Settings > Developer settings > OAuth Apps > New. The callback URL is `https://<project-ref>.supabase.co/auth/v1/callback`. Copy the client ID and generate a secret.
  - [ ] Supabase > Authentication > Sign In / Providers > GitHub: enable it with that client ID and secret.
  - [ ] Authentication > URL Configuration: Site URL is production. Redirect URLs: `http://localhost:3000/**`, `https://denkore-orchestrator-*-denkoregroup.vercel.app/**` (previews) and `https://<production-domain>/**`. Any other address is replaced by the Site URL.
  - [ ] Sign in once with the GitHub account whose **verified** email matches the owner's; Supabase links it to the owner user. If that fails and the log shows `signup_disabled`, turn sign-ups on, sign in once, turn them off. Then check Authentication > Users: if a second user appeared, set `DENKORE_OWNER_USER_ID` to its id (Vercel Production and Preview, and `.env.local`).
  - [ ] Afterwards, turn off email and password sign-in.

**GitHub Actions** (Settings > Secrets and variables > Actions), for the 5-minute Conductor tick, the daily site audit and the migration deploy

- [ ] Secret `STEP_WEBHOOK_SECRET`: the same value the app uses (the tick and the daily audit both sign with it).
- [ ] Variable `CONDUCTOR_TICK_URL`: `https://<production-domain>/api/conductor/tick`.
- [ ] Variable `AUDIT_REPORT_URL`: `https://<production-domain>/api/audits/report`.

**Deploying a migration.** Add a file to `supabase/migrations/` (`pnpm exec supabase migration new <name>`), merge it, then run **Supabase migrations** from the Actions tab. It lists what is pending, then applies it. Nothing deploys on merge. Needs the secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` and the variable `SUPABASE_PROJECT_REF`. Never edit a migration that has been applied; add a new one.

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
| `pnpm db:start`, `pnpm db:reset`, `pnpm db:stop` | The local database (see Local database) |
| `pnpm registry:sync` | Create or update one project row per `registry/*.yaml` entry |
| `pnpm conductor:simulate` | Fake a step completion against a local server (flags: `scripts/simulate-step.ts`) |
| `pnpm audit:run` | Audit a public site and optionally store the report; `--help` lists the flags |
| `pnpm audit:schedule` | The daily job: audit every registered site and store each report (what the workflow runs) |

CI runs typecheck, lint and tests on every pull request.

## Where things are

| Path | What it is |
| --- | --- |
| `app/` | Pages (`/prompt`, `/runs`, `/approvals`, `/sites`, `/activity`, `/login`) and the API routes. `/activity` is the event log; `/audit` redirects there |
| `proxy.ts` | Refreshes the session and keeps everyone but the owner out |
| `lib/conductor/` | Decides and applies each run's next step; its limits are in `limits.ts` |
| `lib/state-machine/` | Run states and allowed moves |
| `lib/audits/` | The site auditor (CLI: `scripts/audit-run.ts`) |
| `lib/site-check/` | The prospect site check: four lights, a headline and the top three fixes from one report (all wording in `copy.ts`) |
| `lib/site-health/` | Stored audit reports, what changed between two of them, and the missed-run watchdog the tick runs |
| `supabase/` | Migrations (schema, RLS, triggers), the local seed and the local stack config |
| `registry/` | One YAML file per project |
| `.github/workflows/` | CI, the Conductor tick, the daily site audit and the manual migration deploy |

Follow-ups are in `docs/backlog.md`; the audit slices are tracked in
[#15](https://github.com/denkoregroup/denkore-orchestrator/issues/15).
