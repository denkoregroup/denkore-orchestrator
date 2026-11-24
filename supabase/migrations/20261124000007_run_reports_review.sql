-- 007_run_reports_review.sql
-- Lets run_reports hold the Conductor review's report (mode 'review'): a verdict on each open
-- agent PR, sent through the same Run report workflow as the repo runs. Widens one check and
-- touches nothing else; every existing row already passes it. Applied by the Supabase
-- migrations workflow.

alter table public.run_reports drop constraint run_reports_mode_check;

alter table public.run_reports
  add constraint run_reports_mode_check check (mode in ('finish-only', 'may-start', 'review'));
