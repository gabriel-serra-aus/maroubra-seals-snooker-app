-- A player's contact details (spec 3.2, 6.3, O-23): both optional, organiser's screens only. The route
-- stores them tidied (lib/contact.ts); the checks here only keep stray values out.
alter table players add column if not exists phone text check (char_length(phone) between 1 and 20);
alter table players add column if not exists email text check (char_length(email) between 3 and 254);
