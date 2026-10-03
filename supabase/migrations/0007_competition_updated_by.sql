-- Two organisers at once (spec 7.8, O-22): who made the night's last write, and from which device. A write
-- from a screen showing an older version than this, made from another device, is refused with the fresh
-- bracket and the organiser's name, so nobody overwrites a change they have not seen.
alter table competitions add column if not exists updated_by text;
alter table competitions add column if not exists updated_by_client text;
