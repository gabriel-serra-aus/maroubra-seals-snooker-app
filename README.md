# Maroubra Seals Snooker — tournament app

A single-night, single-elimination snooker competition manager. One organiser runs the night from the admin pages on the club phone; everyone else watches the public bracket.

The behaviour is specified in three documents, which win over anything written here:

- [snooker-comp-rules.md](snooker-comp-rules.md) — the competition rules (Part A for players, Part B for the app).
- [functional-spec.md](functional-spec.md) — screens, state machines, bracket logic, data model, routes, and the organiser's rulings O-1 … O-14.
- [zzz_tournament-app-plan.md](zzz_tournament-app-plan.md) — hosting, framework, database, admin access, cost.

## Run it locally

```
npm install
cp .env.example .env.local      # then set ADMIN_CODES, e.g. Gabriel:some-long-code
npm run db:seed                 # optional: 20 sample players
npm run dev                     # http://localhost:3000
```

No database service is needed locally. With `DATABASE_URL` unset the app runs on PGlite, an embedded Postgres kept under `.data/pglite`, and applies `supabase/migrations/` on first start. Open `/admin/login`, type one of the codes from `ADMIN_CODES`, and set up a competition.

## Checks

```
npm test          # logic unit tests + route-level integration tests (in-memory Postgres)
npm run typecheck
npm run lint
npm run build
```

The bracket logic lives in `lib/logic/` as pure functions and carries the tests listed in functional-spec.md 5.13. Route handlers only validate, lock the competition row, run the logic on a snapshot, and persist the diff in one transaction.

## Deploy (Netlify + Supabase, both free tiers)

1. **Supabase**: create a project (Sydney). Copy the **Transaction** pooler connection string (port 6543) from Project settings → Database for the app, and the **Session** pooler string (port 5432) for migrations. Apply the schema:

   ```
   DATABASE_URL="postgresql://…:5432/postgres" npm run db:migrate
   ```

   It applies every file in `supabase/migrations/` that is not yet recorded, so run it again after pulling a change that adds one (or paste the new file into the SQL editor).

2. **Netlify**: Add new site → Import an existing project → this GitHub repo. Netlify detects Next.js; the build command is `npm run build` (already in `netlify.toml`). In Site configuration set the **functions region to Sydney (ap-southeast-2)**: the database is in Sydney, functions default to the US, and every tap on the club phone makes a handful of database round trips.

3. **Environment variables** (Site configuration → Environment variables, for Production and Deploy previews):

   | Variable | Value |
   | --- | --- |
   | `ADMIN_CODES` | `Name:code,Name:code` — one code per organiser; the code identifies who made each change |
   | `DATABASE_URL` | the Supabase pooler connection string. Server-only; never `NEXT_PUBLIC_` |
   | `CRON_SECRET` | any random string |

4. Deploy. `main` is production; other branches get deploy previews (they share the same database, so test on previews with a throwaway competition and abandon it afterwards).

5. The scheduled function in `netlify/functions/ping.mts` calls `/api/cron/ping` daily so the free Supabase project never idles for 7 days.

**Rotating an organiser's code**: edit `ADMIN_CODES`, trigger a redeploy. Only that organiser is logged out; everyone else's phone stays signed in.

## Layout

```
app/                Next.js App Router: pages under app/admin, API routes under app/api
components/         client components (bracket list and tree, dialogs, timer, settings, override panel)
lib/logic/          pure bracket logic (draw, placement, close, the fixed tree, Force Pair, complete/correct, ratings, override)
lib/db/             Postgres adapter (postgres.js / PGlite), snapshot loader, diff writer
lib/auth/           ADMIN_CODES parsing and the signed session cookie
lib/bracket/        the bracket JSON payload shared by the public and admin screens
supabase/migrations/ the schema (functional-spec.md section 6), applied in filename order
public/, app/icon.png the club badge in the sizes the pages use; assets/ holds the original
tests/              vitest: tests/logic (pure), tests/integration (route handlers on PGlite)
```
