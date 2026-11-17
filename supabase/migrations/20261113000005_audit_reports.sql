-- 005_audit_reports.sql
-- Stored site audit reports (audit slice 2). Apply after 001-004 in the
-- Supabase SQL editor. Additive: it creates one table and touches nothing else.
-- Nothing runs this automatically.
--
-- Untested until a database exists. After pasting, check the grants and the
-- policy below against the real project (see "Manual checks" in the PR).

create table public.audit_reports (
  id uuid primary key default gen_random_uuid(),
  -- Set when the poster named a registry entry that has a projects row.
  project_id uuid references public.projects (id),
  -- The audited address exactly as the report names it (report.target).
  target text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  pages_checked integer not null check (pages_checked >= 0),
  info_count integer not null check (info_count >= 0),
  warn_count integer not null check (warn_count >= 0),
  fail_count integer not null check (fail_count >= 0),
  -- The whole AuditReport (lib/audits/types.ts), schemaVersion 1.
  report jsonb not null,
  -- The same run posted twice is one row.
  unique (target, started_at)
);

alter table public.audit_reports enable row level security;

-- Start from nothing; Supabase grants broad defaults on public tables.
revoke all on public.audit_reports from anon, authenticated, service_role;

-- authenticated (owner): read only.
grant select on public.audit_reports to authenticated;

-- service_role (the ingest route): read and insert. No update, no delete, so a
-- stored report can never be changed or removed through that credential.
grant select, insert on public.audit_reports to service_role;

-- A report tied to a project is visible to that project's owner. A report with
-- no project is visible to a user who owns at least one project, the same rule
-- events use for rows with no run.
create policy audit_reports_owner_select on public.audit_reports
  for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.owner_id = (select auth.uid())
        and (audit_reports.project_id is null or p.id = audit_reports.project_id)
    )
  );
