-- Tables (spec 5.14): the club plays on a few numbered snooker tables, four unless a night says otherwise.
-- A match in play occupies one; Start hands out the lowest free table and Cancel start gives it back.
alter table competitions add column if not exists table_count smallint not null default 4 check (table_count between 1 and 16);
alter table matches add column if not exists table_number smallint check (table_number >= 1);
