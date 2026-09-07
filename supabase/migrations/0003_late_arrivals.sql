-- Late arrivals are their own kind of entry (rules 3, 8.3): a player who joins after the draw takes an
-- open slot like a buy-back but is flagged 'late', keeps a first-life entry, and may still buy back once
-- if they lose in round one. The existing constraints already fit: a 'late' row has no buyback_seq and
-- no rebuy_of_entry_id, and the (competition_id, player_id, source) unique keeps "buy back once".
alter type entry_source add value if not exists 'late';
