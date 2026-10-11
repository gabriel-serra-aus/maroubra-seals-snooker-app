-- Rating change by finishing position (spec 5.9, O-24): four deltas replace the O-1 top/bottom groups.
-- Nights already played or under way keep the O-1 scheme they were reviewed with (`groups`); a night
-- still in setup and every new night use `finish`. The O-1 columns stay so old reviews still read.
alter table competitions add column if not exists rating_scheme text not null default 'groups'
  check (rating_scheme in ('groups', 'finish'));
alter table competitions alter column rating_scheme set default 'finish';
update competitions set rating_scheme = 'finish' where status = 'setup';

alter table competitions add column if not exists rating_final_delta smallint not null default -3;
alter table competitions add column if not exists rating_semi_delta smallint not null default -2;
alter table competitions add column if not exists rating_buyback_lost_delta smallint not null default 2;
alter table competitions add column if not exists rating_other_delta smallint not null default 1;

-- The end-of-night review is saved once (spec 3.7, O-27): after that a handicap changes only by hand on
-- the Players screen. A night already reviewed — any rating change against it after it completed — is
-- marked saved by whoever saved last.
alter table competitions add column if not exists rating_review_saved_at timestamptz;
alter table competitions add column if not exists rating_review_saved_by text;
update competitions c set rating_review_saved_at = r.changed_at, rating_review_saved_by = r.changed_by
from (
  select distinct on (rc.competition_id) rc.competition_id, rc.changed_at, rc.changed_by
  from rating_changes rc join competitions cc on cc.id = rc.competition_id
  where cc.completed_at is not null and rc.changed_at > cc.completed_at
  order by rc.competition_id, rc.changed_at desc
) r
where c.id = r.competition_id and c.rating_review_saved_at is null;
