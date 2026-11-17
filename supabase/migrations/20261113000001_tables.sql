-- 001_tables.sql
-- Core tables for the Denkore orchestrator control plane.
-- Paste into the Supabase SQL editor in order: 001, 002, 003. Not run automatically.

create extension if not exists pgcrypto;

create type public.run_state as enum (
  'queued', 'spec', 'spec_gate', 'design', 'design_gate', 'build_test', 'verify',
  'release_gate', 'deploy', 'post_deploy_check', 'done', 'failed', 'cancelled', 'escalated'
);

create type public.step_name as enum (
  'spec', 'design', 'build_test', 'verify', 'deploy', 'post_deploy_check'
);

create type public.step_status as enum ('dispatched', 'succeeded', 'failed');

create type public.gate_kind as enum ('spec', 'design', 'release');

create type public.gate_status as enum ('pending', 'approved', 'changes_requested');

create type public.approval_decision as enum ('approve', 'request_changes');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  registry_id text not null unique,
  repo text not null,
  owner_id uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  state public.run_state not null default 'queued',
  prompt text not null,
  test_failures integer not null default 0 check (test_failures >= 0),
  max_test_retries integer not null default 3 check (max_test_retries >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index runs_project_id_idx on public.runs (project_id);

create table public.steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id),
  step public.step_name not null,
  attempt integer not null default 1 check (attempt >= 1),
  -- Idempotency key echoed back by the runner on completion.
  step_key text not null unique,
  status public.step_status not null default 'dispatched',
  output jsonb,
  commit_sha text check (commit_sha ~ '^[0-9a-f]{7,40}$'),
  pr_url text check (pr_url ~ '^https://'),
  cost_usd numeric(12, 4) check (cost_usd >= 0),
  session_id text,
  dispatched_at timestamptz not null default now(),
  completed_at timestamptz
);

create index steps_run_id_idx on public.steps (run_id);

create table public.gates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id),
  kind public.gate_kind not null,
  -- The commit this gate covers. Changing it voids the approval (see 003).
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{7,40}$'),
  status public.gate_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, kind)
);

-- Approvals are immutable history. Only the authenticated owner may insert (see 002/003).
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  gate_id uuid not null references public.gates (id),
  -- The commit the owner reviewed. Must equal gates.commit_sha at insert time.
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{7,40}$'),
  decision public.approval_decision not null,
  note text,
  approved_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create index approvals_gate_id_idx on public.approvals (gate_id);

-- Append-only audit log. No updates, no deletes (see 002/003).
create table public.events (
  id bigint generated always as identity primary key,
  run_id uuid references public.runs (id),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  actor text not null,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create index events_run_id_idx on public.events (run_id, created_at);

-- An approval only counts while it matches the gate's current commit.
create view public.gate_approval_status
with (security_invoker = true) as
select
  g.id as gate_id,
  g.run_id,
  g.kind,
  g.commit_sha,
  g.status,
  a.id as approval_id,
  a.approved_by,
  a.created_at as approved_at,
  (a.id is not null) as is_approved
from public.gates g
left join lateral (
  select ap.*
  from public.approvals ap
  where ap.gate_id = g.id
    and ap.commit_sha = g.commit_sha
    and ap.decision = 'approve'
  order by ap.created_at desc
  limit 1
) a on true;
