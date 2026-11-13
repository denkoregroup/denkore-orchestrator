-- 004_registry_and_audit.sql
-- Additive changes for the live control plane. Apply after 001, 002 and 003,
-- in the Supabase SQL editor. Do not edit 001-003; they may already be applied.
--
-- Untested until a database exists. Re-check the grants and triggers below
-- against the real Supabase project once it is created.

-- ---------------------------------------------------------------------------
-- Registry sync: `pnpm registry:sync` runs as service_role and upserts one
-- projects row per registry/*.yaml entry. It may set the owner on insert and
-- change the repo later; it can never reassign an existing project's owner.
-- ---------------------------------------------------------------------------
grant insert (registry_id, repo, owner_id) on public.projects to service_role;
grant update (repo) on public.projects to service_role;

-- ---------------------------------------------------------------------------
-- Audit trail for runs. Definer functions so the owner and the runner get an
-- events row without any direct write access to events.
-- ---------------------------------------------------------------------------
create or replace function public.runs_log_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select p.owner_id into v_owner from public.projects p where p.id = new.project_id;

  insert into public.events (run_id, kind, payload, actor)
  values (
    new.id,
    'run.created',
    jsonb_build_object(
      'run_id', new.id,
      'project_id', new.project_id,
      'prompt_length', char_length(new.prompt)
    ),
    'owner:' || coalesce(auth.uid(), v_owner)::text
  );
  return new;
end;
$$;

create trigger runs_created_event
  after insert on public.runs
  for each row execute function public.runs_log_created();

create or replace function public.runs_log_state_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.events (run_id, kind, payload, actor)
  values (
    new.id,
    'run.state_changed',
    jsonb_build_object('from', old.state, 'to', new.state),
    'system'
  );
  return new;
end;
$$;

create trigger runs_state_changed_event
  after update of state on public.runs
  for each row
  when (old.state is distinct from new.state)
  execute function public.runs_log_state_changed();

-- Trigger functions are not meant to be called directly.
revoke all on function public.runs_log_created() from public, anon, authenticated, service_role;
revoke all on function public.runs_log_state_changed() from public, anon, authenticated, service_role;
