-- Profile page: facts the club has confirmed (e.g. "We meet this requirement because...").
-- Every agent reads them, so a fact confirmed once helps with every future opportunity.
alter table orgs add column if not exists confirmed_facts jsonb not null default '[]'::jsonb;

-- Tell Supabase's API to pick up the new column right away.
notify pgrst, 'reload schema';
