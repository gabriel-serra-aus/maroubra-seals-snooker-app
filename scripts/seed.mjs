// Inserts 10 sample club players for local development. Skips names that already exist.
// Ratings are invented, golf-style (lower is better, negatives normal) per spec 5.6.
// Usage: npm run db:seed   (uses DATABASE_URL, or the local PGlite database when unset)
import { openDb } from "./_db.mjs";

const players = [
  ["Ronnie O'Sullivan", -12], ["Stephen Hendry", -8], ["Judd Trump", -6],
  ["Steve Davis", -4], ["John Higgins", -2], ["Mark Selby", 0],
  ["Neil Robertson", 3], ["Ding Junhui", 6], ["Jimmy White", 10],
  ["Alex Higgins", 14],
];

const { query, close, label } = await openDb();
let added = 0;
for (const [name, rating] of players) {
  const rows = await query(
    "insert into players (name, rating) select $1, $2 where not exists (select 1 from players where lower(name) = lower($1)) returning id",
    [name, rating],
  );
  if (rows.length) {
    await query(
      "insert into rating_changes (player_id, old_rating, new_rating, changed_by, reason) values ($1, null, $2, 'seed', 'seed')",
      [rows[0].id, rating],
    );
    added++;
  }
}
await close();
console.log(`Seeded ${added} players into ${label}`);
