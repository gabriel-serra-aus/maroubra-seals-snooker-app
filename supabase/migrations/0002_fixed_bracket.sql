-- Fixed-position bracket and one placement rule (spec 5.2, 5.4; rulings O-13, O-14).
-- The buy-back mode setting is gone: buy-backs are always placed at once. Match origins renamed to match.

alter table competitions drop column buyback_mode;
drop type buyback_mode;
alter type match_origin rename value 'sequential' to 'placement';
alter type match_origin rename value 'round_draw' to 'advance';
