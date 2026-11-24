-- 006_run_reports.sql
-- What each scheduled Duet run reports when it finishes: its PR table, notes and
-- numbered decisions (docs/agents/scheduled-run.md). Additive: it creates one
-- table and touches nothing else. Applied by the Supabase migrations workflow.

create table public.run_reports (
  id uuid primary key default gen_random_uuid(),
  -- The registry entry (registry/<id>.yaml) the run worked on. The route only
  -- accepts registered projects, and only with the repo the registry names.
  registry_id text not null check (registry_id ~ '^[a-z0-9-]+$'),
  -- owner/name, lower case.
  repo text not null check (repo = lower(repo)),
  mode text not null check (mode in ('finish-only', 'may-start')),
  started_at timestamptz not null,
  finished_at timestamptz not null check (finished_at >= started_at),
  decision_count integer not null check (decision_count >= 0),
  -- The whole RunReport (lib/run-reports/schema.ts), schemaVersion 1.
  report jsonb not null,
  received_at timestamptz not null default now(),
  -- The same run sent twice is one row.
  unique (repo, started_at)
);

create index run_reports_registry_started on public.run_reports (registry_id, started_at desc);

alter table public.run_reports enable row level security;

-- Start from nothing; Supabase grants broad defaults on public tables.
revoke all on public.run_reports from anon, authenticated, service_role;

-- authenticated (owner): read only.
grant select on public.run_reports to authenticated;

-- service_role (the report route): read and insert. No update, no delete, so a
-- stored report can never be changed or removed through that credential.
grant select, insert on public.run_reports to service_role;

-- Run reports belong to no single project row, so they are visible to a user
-- who owns at least one project, the rule audit_reports uses for reports with
-- no project.
create policy run_reports_owner_select on public.run_reports
  for select to authenticated
  using (
    exists (select 1 from public.projects p where p.owner_id = (select auth.uid()))
  );
