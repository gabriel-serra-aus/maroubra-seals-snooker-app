-- Player photos (spec 6.6, O-18): one optional small image per player, shown beside the name.
-- The bytes live in their own table so `select * from players` never carries them; players.photo_at is the
-- version the photo URL carries, so a new photo busts every cache and an unchanged one is never refetched.
create table if not exists player_photos (
  player_id uuid primary key references players (id),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes bytea not null check (octet_length(bytes) between 1 and 300000),
  updated_at timestamptz not null default now()
);
alter table player_photos enable row level security;

alter table players add column if not exists photo_at timestamptz;
