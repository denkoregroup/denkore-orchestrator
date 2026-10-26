# denkore-orchestrator

Control plane for Denkore agent runs. It tracks each run through a fixed set of
states (spec, design, build/test, verify, release, deploy), holds human approval
gates tied to a specific commit, hands steps to runners, and keeps an
append-only audit log.

Single user: only the Supabase Auth user in `DENKORE_OWNER_USER_ID` can sign in.

## Layout

| Path | What it is |
| --- | --- |
| `app/` | Next.js App Router: `/prompt`, `/runs`, `/approvals`, `/audit`, login, webhook |
| `proxy.ts` | Refreshes the Supabase session and redirects anyone but the owner to `/login` |
| `lib/state-machine/` | Run states, allowed transitions, gates (pure functions) |
| `lib/step-runner/` | `StepRunner` interface and a stub GitHub Actions runner |
| `lib/registry/` | Zod schema and loader for `registry/*.yaml` |
| `lib/webhooks/` | HMAC verification and the idempotent step-complete handler |
| `supabase/sql/` | Schema, RLS, and triggers to paste into Supabase by hand |

## Run

Requires Node 22+ and pnpm.

```sh
pnpm install
cp .env.example .env.local   # fill in values
pnpm dev
```

Database: paste `supabase/sql/001_tables.sql`, `002_rls.sql`, then
`003_functions.sql` into the Supabase SQL editor. Nothing runs migrations
automatically.

## Test

```sh
pnpm test        # Jest + React Testing Library
pnpm typecheck
pnpm lint
```

CI runs all three on every pull request.
