-- 002_rls.sql
-- Row level security and grants.
--
-- Roles:
--   authenticated  the single owner, signed in through Supabase Auth
--   service_role   the step-complete webhook and runners (bypasses RLS, so it is
--                  restricted with GRANTs instead)
--   anon           nothing

alter table public.projects enable row level security;
alter table public.runs enable row level security;
alter table public.steps enable row level security;
alter table public.gates enable row level security;
alter table public.approvals enable row level security;
alter table public.events enable row level security;

-- Start from nothing; Supabase grants broad defaults on public tables.
revoke all on public.projects, public.runs, public.steps, public.gates, public.approvals, public.events
  from anon, authenticated, service_role;
revoke all on public.gate_approval_status from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- authenticated (owner)
-- ---------------------------------------------------------------------------
grant select on public.projects, public.runs, public.steps, public.gates, public.approvals, public.events
  to authenticated;
grant select on public.gate_approval_status to authenticated;
grant insert (project_id, prompt, max_test_retries) on public.runs to authenticated;
grant insert (gate_id, commit_sha, decision, note) on public.approvals to authenticated;

create policy projects_owner_select on public.projects
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy runs_owner_select on public.runs
  for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = runs.project_id and p.owner_id = (select auth.uid())
  ));

create policy runs_owner_insert on public.runs
  for insert to authenticated
  with check (
    state = 'queued'
    and exists (
      select 1 from public.projects p
      where p.id = runs.project_id and p.owner_id = (select auth.uid())
    )
  );

create policy steps_owner_select on public.steps
  for select to authenticated
  using (exists (
    select 1 from public.runs r join public.projects p on p.id = r.project_id
    where r.id = steps.run_id and p.owner_id = (select auth.uid())
  ));

create policy gates_owner_select on public.gates
  for select to authenticated
  using (exists (
    select 1 from public.runs r join public.projects p on p.id = r.project_id
    where r.id = gates.run_id and p.owner_id = (select auth.uid())
  ));

create policy approvals_owner_select on public.approvals
  for select to authenticated
  using (exists (
    select 1 from public.gates g
    join public.runs r on r.id = g.run_id
    join public.projects p on p.id = r.project_id
    where g.id = approvals.gate_id and p.owner_id = (select auth.uid())
  ));

-- The only write path for approvals. 003 adds a trigger that also checks the SHA.
create policy approvals_owner_insert on public.approvals
  for insert to authenticated
  with check (
    approved_by = (select auth.uid())
    and exists (
      select 1 from public.gates g
      join public.runs r on r.id = g.run_id
      join public.projects p on p.id = r.project_id
      where g.id = approvals.gate_id and p.owner_id = (select auth.uid())
    )
  );

create policy events_owner_select on public.events
  for select to authenticated
  -- Events with no run are visible only to a user who owns at least one project.
  using (
    (run_id is null and exists (select 1 from public.projects p where p.owner_id = (select auth.uid())))
    or exists (select 1 from public.runs r join public.projects p on p.id = r.project_id
               where r.id = events.run_id and p.owner_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- service_role (webhook, runners)
-- service_role has BYPASSRLS, so policies do not limit it. GRANTs do.
-- ---------------------------------------------------------------------------
grant select on public.projects, public.gate_approval_status to service_role;
grant select, insert, update on public.runs, public.steps to service_role;
-- Gates: the runner may open a gate and move it to a new commit, nothing else.
-- gates.status changes only through the security definer triggers in 003
-- (approvals_after_insert on an owner decision, gates_sha_changed on a new
-- commit), never from the runner or webhook credential. Column grants enforce
-- that: status, created_at and updated_at are not writable by this role.
grant select on public.gates to service_role;
grant insert (run_id, kind, commit_sha) on public.gates to service_role;
grant update (commit_sha) on public.gates to service_role;
grant select, insert on public.events to service_role;
-- Read-only on approvals: no insert, update, or delete.
grant select on public.approvals to service_role;
