// Inserts sample club players for local development. Skips names that already exist.
// Usage: npm run db:seed   (uses DATABASE_URL, or the local PGlite database when unset)
import { openDb } from "./_db.mjs";

const players = [
  ["Alice Chen", 45], ["Bob Smith", 20], ["Carl Diaz", 33], ["Dee Park", 30], ["Eve Long", 28],
  ["Fay Ng", 41], ["Gus Ray", 25], ["Hal Ito", 36], ["Ida Roy", 36], ["Ivan Poe", 28],
  ["Jo Kerr", 38], ["Kim Lau", 22], ["Lee Moss", 50], ["Max Bell", -3], ["Nia Ford", 15],
  ["Oli Hart", 44], ["Pat Quin", 31], ["Raj Sen", 27], ["Sam Wood", 40], ["Tia Yu", 18],
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
