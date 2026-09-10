# Maroubra Seals Snooker — tournament app

A single-night, single-elimination snooker competition manager. One organiser runs the night from the admin pages on the club phone; everyone else watches the public bracket.

Two documents define this project:

- **[spec.md](spec.md)** — what the app does: the competition rules, screens, state machines, bracket logic, data model, API routes, and the organiser's rulings O-1 … O-16.
- **[CLAUDE.md](CLAUDE.md)** — how it is built: stack, architecture rules, local setup, deployment, cost.

## Run it locally

```
npm install
cp .env.example .env.local      # then set ADMIN_CODES, e.g. Gabriel:some-long-code
npm run db:seed                 # optional: 20 sample players
npm run dev                     # http://localhost:3000
```

No database service is needed. With `DATABASE_URL` unset the app runs on PGlite, an embedded Postgres kept under `.data/pglite`, and applies `supabase/migrations/` on first start. Open `/admin/login`, type one of the codes from `ADMIN_CODES`, and set up a competition.

## Checks

```
npm test          # logic unit tests + route-level integration tests (in-memory Postgres)
npm run typecheck
npm run lint
npm run build
```

The bracket logic lives in `lib/logic/` as pure functions and carries the tests listed in [spec.md 5.13](spec.md#513-test-coverage). Route handlers only validate, lock the competition row, run the logic on a snapshot, and persist the diff in one transaction.

## Deploy

Netlify + Supabase, both free tiers. Full steps, environment variables and the cost notes are in [CLAUDE.md](CLAUDE.md#deployment).

## Layout

```
app/                  Next.js App Router: pages under app/admin, API routes under app/api
components/           client components (bracket list and tree, dialogs, settings, override panel)
lib/logic/            pure bracket logic (draw, placement, close, the fixed tree, Force Pair,
                      complete/correct, ratings, override)
lib/db/               Postgres adapter (postgres.js / PGlite), snapshot loader, diff writer
lib/auth/             ADMIN_CODES parsing and the signed session cookie
lib/bracket/          the bracket JSON payload shared by the public and admin screens
supabase/migrations/  the schema (spec.md section 6), applied in filename order
tests/                vitest: tests/logic (pure), tests/integration (route handlers on PGlite)
public/, app/icon.png the club badge in the sizes the pages use; assets/ holds the original
```
