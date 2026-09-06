// Database access. One tiny adapter over two drivers:
//   - postgres.js against DATABASE_URL (production: the Supabase pooler connection string)
//   - PGlite, an embedded Postgres, when DATABASE_URL is unset (local dev and tests)
// Both expose the same two calls: query(text, params) and transaction(fn). Placeholders are $1, $2, ...
// Everything else in the app talks to this module only.

import { runMigrations } from "./migrate";

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly kind: "pglite" | "postgres";
}

declare global {
  var __sealDb: Promise<Db> | undefined;
}

async function createPostgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  const sql = postgres(url, {
    // Supabase's transaction-mode pooler does not support prepared statements.
    prepare: false,
    max: 3,
    ssl: isLocal ? undefined : "require",
    idle_timeout: 20,
    connect_timeout: 15,
  });
  type Sql = typeof sql;
  const wrap = (s: Sql): Queryable => ({
    async query<T>(text: string, params: unknown[] = []) {
      return (await s.unsafe(text, params as never[])) as unknown as T[];
    },
  });
  return {
    kind: "postgres",
    ...wrap(sql),
    transaction: <T>(fn: (tx: Queryable) => Promise<T>) =>
      sql.begin((tx) => fn(wrap(tx as unknown as Sql))) as Promise<T>,
    close: () => sql.end(),
  };
}

async function createPgliteDb(dataDir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = await PGlite.create(dataDir);
  type Runner = {
    query<T>(q: string, p?: unknown[]): Promise<{ rows: T[] }>;
    exec(q: string): Promise<Array<{ rows: unknown[] }>>;
  };
  const wrap = (r: Runner): Queryable => ({
    async query<T>(text: string, params: unknown[] = []) {
      // PGlite's parameterised query runs exactly one statement; exec() runs many (migrations).
      if (params.length === 0) {
        const results = await r.exec(text);
        return (results.at(-1)?.rows ?? []) as T[];
      }
      return (await r.query<T>(text, params)).rows;
    },
  });
  const db: Db = {
    kind: "pglite",
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
  await runMigrations(db);
  return db;
}

export function getDb(): Promise<Db> {
  if (!globalThis.__sealDb) {
    const url = process.env.DATABASE_URL;
    globalThis.__sealDb = url
      ? createPostgresDb(url)
      : createPgliteDb(process.env.PGLITE_DATA_DIR || ".data/pglite");
  }
  return globalThis.__sealDb;
}

/** Tests only: drop the cached connection so the next getDb() starts fresh. */
export async function resetDbForTests(): Promise<void> {
  const pending = globalThis.__sealDb;
  globalThis.__sealDb = undefined;
  if (pending) await (await pending).close();
}
