-- 006: data integrity (security phase 5).
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- 1. At most one draft per opportunity. "Rewrite draft" replaces it (upsert) instead of adding rows.
--    Older duplicate versions, if any, are removed first, keeping the newest.
delete from drafts d using drafts newer
where d.opportunity_id = newer.opportunity_id
  and (d.created_at < newer.created_at or (d.created_at = newer.created_at and d.id < newer.id));
do $$ begin
  alter table drafts add constraint drafts_one_per_opportunity unique (opportunity_id);
exception when duplicate_table or duplicate_object then null;
end $$;

-- 2. Confirmed facts get their own table: one answer per requirement per organization
--    (ignoring capitals and extra spaces), saved in a single atomic step.
create table if not exists org_facts (
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

-- Copy any facts saved the old way (the orgs.confirmed_facts list). The old column is left in
-- place, unused, so nothing is lost.
insert into org_facts (org_id, requirement, answer, added_by, added_at, from_opportunity)
select o.id, f->>'requirement', f->>'answer', coalesce(f->>'added_by', 'a club officer'),
       coalesce((f->>'added_at')::timestamptz, now()), f->>'from_opportunity'
from orgs o, jsonb_array_elements(o.confirmed_facts) f
where coalesce(f->>'requirement', '') <> '' and coalesce(f->>'answer', '') <> ''
on conflict (org_id, requirement_key) do nothing;

alter table org_facts enable row level security;
revoke all on org_facts from anon, authenticated;

notify pgrst, 'reload schema';
select (select count(*) from drafts) as drafts, (select count(distinct opportunity_id) from drafts) as opportunities_with_drafts,
       (select count(*) from org_facts) as facts;
