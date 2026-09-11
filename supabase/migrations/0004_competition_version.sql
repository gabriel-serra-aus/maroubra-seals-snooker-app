-- Every write to a night bumps competitions.updated_at inside the same transaction (lib/api/mutate.ts).
-- The bracket JSON carries it as `version` (spec 7.2) so a screen never replaces a newer bracket with
-- an older one: a poll that was in flight while a result was saved is dropped, not shown.
alter table competitions add column if not exists updated_at timestamptz not null default now();
