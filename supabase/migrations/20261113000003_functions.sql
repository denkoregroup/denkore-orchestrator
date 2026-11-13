-- 003_functions.sql
-- Triggers and functions that enforce invariants the grants alone cannot.

-- ---------------------------------------------------------------------------
-- events is append-only, for every role including the table owner.
-- ---------------------------------------------------------------------------
create or replace function public.events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'events is append-only (% rejected)', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger events_no_update_delete
  before update or delete on public.events
  for each row execute function public.events_append_only();

create trigger events_no_truncate
  before truncate on public.events
  for each statement execute function public.events_append_only();

-- Approvals are history too.
create trigger approvals_no_update_delete
  before update or delete on public.approvals
  for each row execute function public.events_append_only();

create trigger approvals_no_truncate
  before truncate on public.approvals
  for each statement execute function public.events_append_only();

-- ---------------------------------------------------------------------------
-- Approvals: owner only, and only for the gate's current commit.
-- ---------------------------------------------------------------------------
-- Definer so it can lock the gate row; auth.uid()/auth.jwt() still describe the caller.
create or replace function public.approvals_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gate_sha text;
  v_gate_status public.gate_status;
  v_owner uuid;
begin
  -- Second line of defence behind the GRANTs in 002: machine callers never approve.
  if auth.uid() is null or coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    raise exception 'approvals can only be written by the signed-in owner'
      using errcode = 'insufficient_privilege';
  end if;

  select g.commit_sha, g.status, p.owner_id
    into v_gate_sha, v_gate_status, v_owner
  from public.gates g
  join public.runs r on r.id = g.run_id
  join public.projects p on p.id = r.project_id
  where g.id = new.gate_id
  for update of g;

  if v_owner is distinct from auth.uid() then
    raise exception 'not the owner of this gate' using errcode = 'insufficient_privilege';
  end if;
  if new.commit_sha <> v_gate_sha then
    raise exception 'approval is for %, but the gate now covers %', new.commit_sha, v_gate_sha
      using errcode = 'check_violation';
  end if;
  if v_gate_status <> 'pending' then
    raise exception 'gate is already %', v_gate_status using errcode = 'check_violation';
  end if;

  new.approved_by := auth.uid();
  return new;
end;
$$;

create trigger approvals_check
  before insert on public.approvals
  for each row execute function public.approvals_before_insert();

-- Applies the decision to the gate and logs it. Definer, because the owner
-- has no direct write access to gates or events.
create or replace function public.approvals_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  update public.gates
     set status = case new.decision when 'approve' then 'approved'::public.gate_status
                                    else 'changes_requested'::public.gate_status end,
         updated_at = now()
   where id = new.gate_id
  returning run_id into v_run_id;

  insert into public.events (run_id, kind, payload, actor)
  values (
    v_run_id,
    'gate.' || new.decision,
    jsonb_build_object('gate_id', new.gate_id, 'approval_id', new.id, 'commit_sha', new.commit_sha),
    'owner:' || new.approved_by
  );
  return new;
end;
$$;

create trigger approvals_apply
  after insert on public.approvals
  for each row execute function public.approvals_after_insert();

-- ---------------------------------------------------------------------------
-- Changing a gate's commit voids its approval.
-- Old approval rows stay as history; gate_approval_status ignores them
-- because their commit_sha no longer matches.
-- ---------------------------------------------------------------------------
create or replace function public.gates_sha_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.commit_sha is distinct from old.commit_sha then
    new.status := 'pending';
    new.updated_at := now();
    insert into public.events (run_id, kind, payload, actor)
    values (
      new.run_id,
      'gate.approval_voided',
      jsonb_build_object('gate_id', new.id, 'old_sha', old.commit_sha, 'new_sha', new.commit_sha),
      'system'
    );
  end if;
  return new;
end;
$$;

create trigger gates_void_on_sha_change
  before update of commit_sha on public.gates
  for each row execute function public.gates_sha_changed();

-- ---------------------------------------------------------------------------
-- Step completion: atomic and idempotent on step_key.
-- Returns true when recorded, false when the key was already seen (a replay).
-- ---------------------------------------------------------------------------
create or replace function public.record_step_completion(
  p_run_id uuid,
  p_step_key text,
  p_step public.step_name,
  p_output jsonb
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_event_id bigint;
begin
  insert into public.events (run_id, kind, payload, actor, idempotency_key)
  values (p_run_id, 'step.completed', p_output, 'runner', 'step-complete:' || p_step_key)
  on conflict (idempotency_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return false;
  end if;

  insert into public.steps (
    run_id, step, step_key, status, output, commit_sha, pr_url, cost_usd, session_id, completed_at
  )
  values (
    p_run_id,
    p_step,
    p_step_key,
    (p_output ->> 'status')::public.step_status,
    p_output -> 'result',
    p_output ->> 'commitSha',
    p_output ->> 'prUrl',
    (p_output ->> 'costUsd')::numeric,
    p_output ->> 'sessionId',
    now()
  )
  on conflict (step_key) do update
    set status = excluded.status,
        output = excluded.output,
        commit_sha = excluded.commit_sha,
        pr_url = excluded.pr_url,
        cost_usd = excluded.cost_usd,
        session_id = excluded.session_id,
        completed_at = excluded.completed_at;

  return true;
end;
$$;

revoke all on function public.record_step_completion(uuid, text, public.step_name, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_step_completion(uuid, text, public.step_name, jsonb)
  to service_role;

-- Trigger functions are not meant to be called directly.
revoke all on function public.events_append_only() from public, anon, authenticated, service_role;
revoke all on function public.approvals_before_insert() from public, anon, authenticated, service_role;
revoke all on function public.approvals_after_insert() from public, anon, authenticated, service_role;
revoke all on function public.gates_sha_changed() from public, anon, authenticated, service_role;
