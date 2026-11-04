-- 007: tighter spending limits.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.

-- Who created each organization (for the "3 new organizations per person" limit).
alter table orgs add column if not exists created_by text;
create index if not exists orgs_created_by on orgs (created_by);
create index if not exists usage_events_user_recent on usage_events (user_email, kind, created_at);

-- Checks and records one paid AI job in a single transaction. Locks make parallel requests
-- wait their turn, so two clicks at the same moment can't both slip under a limit.
-- Returns 'ok', 'org_limit' (the club's daily limit) or 'user_limit' (the person's daily
-- limit across all their clubs). The limits themselves come from netlify/lib/limits.ts.
create or replace function use_allowance(p_org uuid, p_kind text, p_email text, p_org_limit int, p_user_limit int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  -- Always org first, then user, so two requests can never wait on each other in a loop.
  perform pg_advisory_xact_lock(hashtext('allowance-org:' || p_org::text || ':' || p_kind));
  perform pg_advisory_xact_lock(hashtext('allowance-user:' || lower(p_email) || ':' || p_kind));

  select count(*) into n from usage_events
  where org_id = p_org and kind = p_kind and created_at > now() - interval '24 hours';
  if n >= p_org_limit then return 'org_limit'; end if;

  select count(*) into n from usage_events
  where user_email = lower(p_email) and kind = p_kind and created_at > now() - interval '24 hours';
  if n >= p_user_limit then return 'user_limit'; end if;

  insert into usage_events (org_id, kind, user_email) values (p_org, p_kind, lower(p_email));
  return 'ok';
end;
$$;
revoke all on function use_allowance(uuid, text, text, int, int) from public, anon, authenticated;
grant execute on function use_allowance(uuid, text, text, int, int) to service_role;

-- Hard limit on new organizations per person, checked inside the insert itself.
-- Keep this number in step with LIMITS.newOrgsPerUser in netlify/lib/limits.ts.
create or replace function limit_orgs_per_user() returns trigger
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  if new.created_by is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('orgs-created-by:' || lower(new.created_by)));
  select count(*) into n from orgs where created_by = new.created_by;
  if n >= 3 then
    raise exception 'org_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists orgs_limit_per_user on orgs;
create trigger orgs_limit_per_user before insert on orgs for each row execute function limit_orgs_per_user();

notify pgrst, 'reload schema';
select 'use_allowance and the org limit are ready' as result;
