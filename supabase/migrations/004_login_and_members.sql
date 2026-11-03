-- 004: login and club membership (security phase 2).
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- BEFORE running: replace YOUR_LOGIN_EMAIL near the bottom with the email you will log in with.

-- Who belongs to which organization. Stored by email so an officer can be added
-- before they have ever logged in. Emails are kept lower-case.
create table if not exists org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'member' check (role in ('owner', 'member')),
  added_by text,
  created_at timestamptz not null default now(),
  primary key (org_id, email)
);
create index if not exists org_members_email on org_members (email);

-- Who verified a deadline or changed a card's status, and when.
alter table opportunities
  add column if not exists deadline_verified_by text,
  add column if not exists deadline_verified_at timestamptz,
  add column if not exists status_changed_by text,
  add column if not exists status_changed_at timestamptz;

-- Who started a scan, and when its digest was last emailed (for the resend cooldown).
alter table scans
  add column if not exists started_by text,
  add column if not exists digest_sent_at timestamptz;

-- Lock every table to the backend. Row Level Security with no policies means the public
-- (anon) and logged-in (authenticated) keys can't read or write any row; Netlify Functions
-- use the service key, which bypasses RLS. Revoking table rights is a second lock.
alter table orgs enable row level security;
alter table funding_library enable row level security;
alter table scans enable row level security;
alter table opportunities enable row level security;
alter table drafts enable row level security;
alter table activity_log enable row level security;
alter table org_members enable row level security;
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Make you the owner of every current organization.
insert into org_members (org_id, email, role, added_by)
select id, lower(trim('YOUR_LOGIN_EMAIL')), 'owner', 'setup' from orgs
on conflict (org_id, email) do update set role = 'owner';

notify pgrst, 'reload schema';

-- Check: this should list every organization with your email as owner.
select o.name, m.email, m.role from org_members m join orgs o on o.id = m.org_id order by o.name;
