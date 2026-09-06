-- Maroubra Seals Snooker — initial schema. This is the data model in functional-spec.md section 6 (O-2).
-- Keep section 6 in sync with this file.

create type match_state as enum ('not_started', 'in_play', 'finished');
create type competition_status as enum ('setup', 'in_progress', 'complete', 'abandoned');
create type buyback_mode as enum ('random_draw', 'sequential');
create type entry_source as enum ('draw', 'buyback');
create type buyback_decision as enum ('bought_back', 'declined', 'no_slots');
create type match_origin as enum ('draw', 'sequential', 'force_pair', 'close', 'round_draw', 'correction', 'override');

-- players: the club list. Never deleted (O-9); deactivated instead.
create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  -- Golf-style handicap: lower is better, negative allowed (rules 6, spec 5.6).
  rating integer not null check (rating between -100 and 200),
  active boolean not null default true,
  deactivated_at timestamptz check ((deactivated_at is null) = active),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index players_name_unique_ci on players (lower(name));

-- competitions: one row per night.
create table competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status competition_status not null default 'setup',
  bracket_size smallint not null check (bracket_size in (16, 32)),
  buyback_mode buyback_mode not null default 'random_draw',
  default_time_limit_minutes smallint not null default 25 check (default_time_limit_minutes between 1 and 180),
  -- Rating adjustment scale, snapshotted per competition (O-1).
  rating_top_count smallint not null default 3 check (rating_top_count >= 0),
  rating_top_delta smallint not null default -1,
  rating_bottom_count smallint not null default 3 check (rating_bottom_count >= 0),
  rating_bottom_delta smallint not null default 2,
  started_at timestamptz,
  buybacks_closed_at timestamptz,
  completed_at timestamptz,
  abandoned_at timestamptz check ((abandoned_at is null) = (status <> 'abandoned')),
  winner_entry_id uuid,
  created_at timestamptz not null default now()
);
-- At most one competition may be setup or in_progress at a time (spec 6.3). Abandon (5.11) frees it.
create unique index competitions_one_live on competitions ((1)) where status in ('setup', 'in_progress');

-- rating_changes: rules 13 audit trail of every rating change.
create table rating_changes (
  id bigint generated always as identity primary key,
  player_id uuid not null references players (id),
  competition_id uuid references competitions (id),
  old_rating integer,
  new_rating integer not null,
  changed_by text not null,
  reason text,
  changed_at timestamptz not null default now()
);
create index rating_changes_player on rating_changes (player_id, changed_at desc);

-- entries: one player in one slot of one competition. A buy-back is a second row (O-3, O-4).
create table entries (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions (id),
  player_id uuid not null references players (id),
  source entry_source not null,
  slot smallint check (slot between 1 and 32),
  buyback_seq integer,
  rebuy_of_entry_id uuid unique references entries (id),
  buyback_decision buyback_decision,
  rating_at_entry integer not null,
  -- The round the entry joined in: 1 for the draw and every buy-back; later only via the override (3.9).
  joined_round smallint not null default 1 check (joined_round >= 1),
  entered_at timestamptz not null default now(),
  constraint entries_slot_unique unique (competition_id, slot) deferrable initially deferred,
  constraint entries_buyback_seq_unique unique (competition_id, buyback_seq),
  -- "buy back once": at most one draw entry and one buyback entry per player per night.
  constraint entries_player_source_unique unique (competition_id, player_id, source),
  check (source = 'buyback' or (buyback_seq is null and rebuy_of_entry_id is null))
);
create index entries_competition on entries (competition_id);

alter table competitions
  add constraint competitions_winner_entry_fk foreign key (winner_entry_id) references entries (id);

-- matches: a row exists only when both slots of a pair are filled (spec 5.1, 6).
create table matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions (id),
  round smallint not null check (round >= 1),
  number smallint not null,
  player_a_id uuid not null references entries (id),
  player_b_id uuid not null references entries (id),
  rating_a integer not null,
  rating_b integer not null,
  start_points smallint not null check (start_points >= 0),
  start_entry_id uuid references entries (id),
  state match_state not null default 'not_started',
  origin match_origin not null,
  time_limit_minutes smallint check (time_limit_minutes between 1 and 180),
  started_at timestamptz,
  finished_at timestamptz,
  winner_id uuid references entries (id),
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  constraint matches_number_unique unique (competition_id, number) deferrable initially deferred,
  check (player_a_id <> player_b_id),
  -- Cancel start (5.8) must clear started_at and state together.
  check ((started_at is null) = (state = 'not_started')),
  check ((finished_at is null) = (state <> 'finished')),
  check ((winner_id is null) = (state <> 'finished')),
  check (winner_id is null or winner_id in (player_a_id, player_b_id)),
  check ((start_entry_id is null) = (start_points = 0)),
  check (start_entry_id is null or start_entry_id in (player_a_id, player_b_id))
);
create index matches_competition_round on matches (competition_id, round);
create index matches_competition_state on matches (competition_id, state);

-- free_passes: round one may hold several (O-4). Deliberately no unique (competition_id, from_round).
create table free_passes (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions (id),
  entry_id uuid not null references entries (id),
  from_round smallint not null check (from_round >= 1),
  granted_at timestamptz not null default now(),
  constraint free_passes_unique unique (competition_id, entry_id, from_round)
);

-- admin_actions: audit trail for Cancel start, Abandon and every master override (O-5, O-7, O-8).
create table admin_actions (
  id bigint generated always as identity primary key,
  competition_id uuid references competitions (id),
  actor text not null,
  action text not null,
  details jsonb not null,
  created_at timestamptz not null default now()
);
create index admin_actions_competition_time on admin_actions (competition_id, created_at desc);

-- RLS on with no policies: the anon key can read nothing; all access is server-side (spec 6.5).
alter table players enable row level security;
alter table rating_changes enable row level security;
alter table competitions enable row level security;
alter table entries enable row level security;
alter table matches enable row level security;
alter table free_passes enable row level security;
alter table admin_actions enable row level security;
