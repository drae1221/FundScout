-- 005: spending limits (security phase 3).
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- One row per paid AI job started (scan, draft or re-check), for the daily limits.
create table if not exists usage_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  kind text not null check (kind in ('scan', 'draft', 'recheck')),
  user_email text,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_recent on usage_events (org_id, kind, created_at);

-- Only one running scan per organization. Old stuck scans are closed first so the rule can be added.
update scans set status = 'failed', finished_at = now(), error = 'Stopped: took too long.'
where status = 'running' and started_at < now() - interval '20 minutes';
create unique index if not exists one_running_scan_per_org on scans (org_id) where status = 'running';

alter table usage_events enable row level security;
revoke all on usage_events from anon, authenticated;

notify pgrst, 'reload schema';
select 'usage_events ready' as result;
