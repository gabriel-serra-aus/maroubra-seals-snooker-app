-- Access (spec 6.5): RLS on every table with no policies, so the anon key reads nothing. schema_migrations
-- is created by the migrate script, not 0001, so it missed 0001's list and Supabase's advisor flagged it.
alter table schema_migrations enable row level security;
