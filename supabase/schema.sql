-- FundScout database schema (spec section 3).
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run: it drops and recreates the tables (this DELETES their data).

drop table if exists org_facts, usage_events, org_members, activity_log, drafts, opportunities, scans, funding_library, orgs cascade;

create table orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('student_club', 'nonprofit')),
  university text,
  member_count integer,
  is_registered_student_org boolean not null default false,
  is_501c3 boolean not null default false,
  has_nonprofit_partner boolean not null default false,
  mission text,
  activities text,
  funding_goals text,
  target_amount numeric,
  past_wins text,
  industry_ties text[] not null default '{}',
  funding_contacts text[] not null default '{}',
  confirmed_facts jsonb not null default '[]'::jsonb, -- old place for facts; now unused (see org_facts)
  created_at timestamptz not null default now()
);

create table funding_library (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text not null,
  type text not null check (type in ('university', 'grant', 'sponsor', 'award', 'competition')),
  funding_category text not null check (funding_category in ('events', 'operational', 'travel', 'general')),
  audience text not null default 'club' check (audience in ('club', 'members')), -- members = scholarships etc. for individual members
  eligibility_notes text,
  typical_amount text,
  deadline_notes text,
  url text not null, -- guardrail: every source links to its original page
  created_at timestamptz not null default now()
);

create table scans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sources_checked text[] not null default '{}',
  counts jsonb not null default '{}',
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  error text,
  started_by text,           -- email of the member who started it
  digest_sent_at timestamptz -- for the 1-hour resend cooldown
);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  scan_id uuid references scans(id) on delete set null,
  source text not null check (source in ('library', 'grants_gov', 'web', 'pasted')),
  library_id uuid references funding_library(id) on delete set null,
  audience text not null default 'club' check (audience in ('club', 'members')),
  title text not null,
  provider text,
  url text not null,
  amount text,
  deadline date,
  deadline_verified boolean not null default false, -- guardrail: "verify on source" until a human confirms
  deadline_verified_by text,
  deadline_verified_at timestamptz,
  status_changed_by text,
  status_changed_at timestamptz,
  verdict text check (verdict in ('apply', 'maybe', 'skip')),
  fit_score integer check (fit_score between 0 and 100),
  reasons text,
  eligibility_flags text[] not null default '{}',
  status text not null default 'new' check (status in ('new', 'in_progress', 'submitted', 'dismissed')),
  created_at timestamptz not null default now()
);

create table drafts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  draft_type text not null check (draft_type in ('cu_funding_request', 'grant_application', 'sponsor_pitch')),
  content text not null, -- markdown
  assumptions text[] not null default '{}',
  missing_items text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint drafts_one_per_opportunity unique (opportunity_id) -- a rewrite replaces the draft
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references scans(id) on delete cascade,
  step text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- Who belongs to which organization (by login email, lower-case).
create table org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'member' check (role in ('owner', 'member')),
  added_by text,
  created_at timestamptz not null default now(),
  primary key (org_id, email)
);

create index on org_members (email);

-- Facts a club officer confirmed (e.g. "We meet this"). One answer per requirement per org.
create table org_facts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  requirement text not null check (length(btrim(requirement)) between 1 and 300),
  answer text not null check (length(btrim(answer)) between 1 and 1000),
  requirement_key text generated always as (lower(regexp_replace(btrim(requirement), '\s+', ' ', 'g'))) stored,
  added_by text not null,
  added_at timestamptz not null default now(),
  from_opportunity text,
  constraint org_facts_one_per_requirement unique (org_id, requirement_key)
);

-- Paid AI jobs started, for the daily limits in netlify/lib/limits.ts.
create table usage_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references orgs(id) on delete cascade,
  kind text not null check (kind in ('scan', 'draft', 'recheck')),
  user_email text,
  created_at timestamptz not null default now()
);
create index on usage_events (org_id, kind, created_at);
create unique index one_running_scan_per_org on scans (org_id) where status = 'running';
create index on opportunities (org_id, verdict);
create index on activity_log (scan_id, created_at);

-- Lock every table to the backend. Netlify Functions use the service key, which
-- bypasses RLS; the public "anon" key gets nothing because there are no policies.
alter table orgs enable row level security;
alter table funding_library enable row level security;
alter table scans enable row level security;
alter table opportunities enable row level security;
alter table drafts enable row level security;
alter table activity_log enable row level security;
alter table org_members enable row level security;
alter table org_facts enable row level security;
alter table usage_events enable row level security;
revoke all on all tables in schema public from anon, authenticated;
