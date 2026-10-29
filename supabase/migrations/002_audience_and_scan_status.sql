-- Adds "for members" opportunities and scan status. Run once in the Supabase SQL Editor.
-- (schema.sql already includes these columns for fresh setups.)

alter table funding_library
  add column if not exists audience text not null default 'club'
  check (audience in ('club', 'members'));

alter table opportunities
  add column if not exists audience text not null default 'club'
  check (audience in ('club', 'members'));

alter table scans
  add column if not exists status text not null default 'running'
  check (status in ('running', 'done', 'failed'));

alter table scans
  add column if not exists error text;
