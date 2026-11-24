# Repos

Who owns each repo right now. Status, queues and approval details live in each repo's
`docs/AGENT_GUIDE.md` and on GitHub, not here. This repo is public, so private repos are listed by
name only.

| Repo | Owner session | Roadmap issue | Live systems (ask before any change) |
| --- | --- | --- | --- |
| [denkoregroup/honeybees](https://github.com/denkoregroup/honeybees) | scheduled run "HoneyBee repo run" (6:42am and 6:42pm ET; manual runs allowed) | [#76](https://github.com/denkoregroup/honeybees/issues/76) | Shopify admin, Vercel, DNS |
| denkoregroup/barzini-publishing (private) | scheduled run "Barzini repo run" (6:43am and 6:43pm ET; manual runs allowed) | #101 | Supabase (stricter rules in the repo guide), Vercel |
| [dclarktech302/ggrmusicgroup](https://github.com/dclarktech302/ggrmusicgroup) | scheduled run "GGR repo run" (6:44am and 6:44pm ET; manual runs allowed) | [#17](https://github.com/dclarktech302/ggrmusicgroup/issues/17) | Vercel, DNS, the Google Sheets webhook, the komi.io form |
| denkoregroup/denkore-orchestrator | conductor | none yet | Supabase, Vercel, GitHub Actions secrets |

A session that isn't the listed owner doesn't work in that repo. To change owners, update this
table first.

The **Conductor review** ("Conductor review" scheduled task, 7:37am and 7:37pm ET) reviews open
agent PRs in every repo above but doesn't build features; fixes go back to the repo's own run.
