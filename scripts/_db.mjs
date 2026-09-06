// Shared by the plain-JS scripts: opens DATABASE_URL with postgres.js, or the local PGlite database.
export async function openDb() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    const sql = postgres(url, { prepare: false, max: 1, ssl: isLocal ? undefined : "require" });
    return {
      label: "DATABASE_URL",
      query: (t, p = []) => sql.unsafe(t, p),
      transaction: (fn) => sql.begin((tx) => fn((t, p = []) => tx.unsafe(t, p))),
      close: () => sql.end(),
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.PGLITE_DATA_DIR || ".data/pglite";
  const pg = await PGlite.create(dataDir);
  // PGlite's parameterised query runs one statement; exec() runs many (migration files).
  const run = (r) => async (t, p = []) =>
    p.length === 0 ? ((await r.exec(t)).at(-1)?.rows ?? []) : (await r.query(t, p)).rows;
  return {
    label: `local PGlite database (${dataDir})`,
    query: run(pg),
    transaction: (fn) => pg.transaction((tx) => fn(run(tx))),
    close: () => pg.close(),
  };
}
