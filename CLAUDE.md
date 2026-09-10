# Maroubra Seals Snooker — Tournament App

A single-night, single-elimination snooker competition manager for the Maroubra Seals club. One organiser runs the night from an admin page; everyone else watches a public bracket.

Keep your replies extremely concise and focus on conveying the key information. No unnecessary fluff, no long code snippets.

## Source of truth

**[spec.md](spec.md) defines what the app does** — rules, screens, state machines, bracket logic, data model, API routes, and the organiser's rulings O-1 … O-16. Read it before changing behaviour; do not restate or fork it here.

**This file defines how it is built** — stack, architecture, commands, deployment, cost. If the two disagree, spec.md wins on behaviour and this file wins on infrastructure.

Cite spec sections in code comments and PRs the way the existing code does: `spec 5.4`, `per O-13`, `§6`. **Those citations are load-bearing** — ~300 of them across the codebase — so never renumber a spec section; add new ones.

If a requirement is genuinely absent from spec.md, ask the organiser rather than inventing one.

## The domain in one paragraph

16 or 32 players are drawn at random into a round-one bracket. Every match is one frame with a 25-minute clock. **A rating is a golf-style handicap: lower is better, and it can be negative.** The weaker player — the one with the *higher* number — starts with two thirds of the difference, rounded (spec 5.6). Round-one losers may buy back once, optionally, and go straight into the bracket: a random empty match while one exists, then beside a random lone player (O-13); round-two losers are out. Buy-backs are capped by the open slots, first come first served. **The bracket is fixed** (O-14): a player's round-one slot sets their place in the whole tree, the winners of M1 and M2 meet in round two, and a winner moves up the moment their match ends. A free pass is what an empty other half gives you, in any round, possibly several in a row; when the buy-back window closes everyone still alone in round one gets one (O-4). The window closes only when the organiser taps **No More Buy-Backs / Late Entries**, never by itself (O-15). The organiser starts and completes each match in the app.

Vocabulary is fixed in [spec.md](spec.md#vocabulary) — keep code and UI consistent with it.

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js (App Router, TypeScript) | Public pages + admin API in one project |
| Hosting | Netlify free tier | Auto-deploy from GitHub `main`. Not Vercel: Hobby is licensed for personal, non-commercial use, which a club competition with an entry fee does not clearly fit (O-10) |
| Database | Supabase (Postgres) via `DATABASE_URL` and postgres.js | Chosen over Turso for the row-editing web UI — useful for on-the-night manual fixes (O-11). Direct Postgres, not the Supabase JS client, because writes need transactions and row locks (spec 7). With `DATABASE_URL` unset the app and tests run on PGlite, an embedded Postgres under `.data/` — no local service needed |
| Auth | `ADMIN_CODES` env var (`Name:code` pairs) + signed session cookie | One code per organiser; the code identifies who, so "changed by" is never typed (O-8). No accounts, no resets, no email |
| Ratings | Integer, `-100..200`, **lower is better** | Golf-style handicap; negatives are normal for strong players (§6, spec 5.6) |

## Architecture rules

- **All bracket logic is server-side and pure.** Draw, pairing, Force Pair, free-pass allocation, advancement and handicap calculation live in plain testable functions (`lib/`), not in components or route handlers. Route handlers validate input, call the logic, persist, and return.
- **The database is the source of truth for match state**, not client state. The public page reads; only admin routes write.
- **Every write route checks the admin session cookie.** No exceptions, including "harmless" ones. Reads under `/api/admin/` check it too.
- **The timer is computed from a stored `started_at` timestamp**, never from a client-side counter — the countdown must survive navigation, refresh and a locked phone (spec 5.12).
- **Advancement is automatic on completion** and runs as one idempotent step after every write (`advanceAll` in `lib/logic/rounds.ts`): it pushes every waiting player up the fixed tree until nothing moves. It is reversible while the winner's next match has not started (spec 5.7). A mistaken Start is reversible too (O-5). Model corrections explicitly; don't rely on manual DB edits.
- **Every mutating route returns the fresh bracket**, and the admin screens use it instead of fetching again: one round trip per tap. Keep it that way — the club phone is on the far side of the Pacific from Netlify's default region.
- **Nothing is only fixable in the database.** The master override screen (spec 3.9, O-5) is the escape hatch for everything the normal guards refuse. Every override writes an `admin_actions` row naming the organiser.
- **No browser dialogs.** `alert()`, `confirm()` and `prompt()` are banned by an ESLint rule (`no-restricted-globals`); every question is the app's own centred card (spec 3.5).
- **Prefer boring and obvious.** This runs one night a week on a club phone. Fewer moving parts beats clever.

## Layout

```
app/                  App Router: pages under app/admin, API routes under app/api
components/           client components (bracket list and tree, dialogs, settings, override panel)
lib/logic/            pure bracket logic (draw, placement, close, the fixed tree, Force Pair,
                      complete/correct, ratings, override)
lib/db/               Postgres adapter (postgres.js / PGlite), snapshot loader, diff writer
lib/auth/             ADMIN_CODES parsing and the signed session cookie
lib/bracket/          the bracket JSON payload shared by the public and admin screens
supabase/migrations/  the schema (spec 6), applied in filename order
tests/                vitest: tests/logic (pure), tests/integration (route handlers on PGlite)
public/, app/icon.png the club badge; assets/ holds the original
```

## Local development

```
npm install
cp .env.example .env.local      # then set ADMIN_CODES, e.g. Gabriel:some-long-code
npm run db:seed                 # optional: 20 sample players
npm run dev                     # http://localhost:3000
```

No database service needed. With `DATABASE_URL` unset the app runs on PGlite under `.data/pglite` and applies `supabase/migrations/` on first start. New migrations apply themselves on the next start; to start clean, delete `.data/pglite` and re-run `npm run db:migrate && npm run db:seed`.

Open `/admin/login`, type a code from `ADMIN_CODES`, and set up a competition.

## Checks

```
npm test          # logic unit tests + route-level integration tests (in-memory PGlite)
npm run typecheck
npm run lint
npm run build
```

**Bracket logic is where the bugs will be, so it is where the tests go.** The required coverage is listed in [spec.md 5.13](spec.md#513-test-coverage) — keep it in sync rather than duplicating it here. UI can be checked by hand; the logic cannot.

Local tooling present: Node 25, npm 11, git. Netlify CLI and `gh` are **not** installed — install them before attempting a CLI deploy, or use the Netlify/GitHub web UI.

## Deployment

**Netlify + Supabase, both free tiers** (O-10, O-11).

1. **Supabase**: create a project, region **Sydney**. From Project settings → Database copy the **Transaction** pooler string (port 6543) for the app and the **Session** pooler string (port 5432) for migrations. Apply the schema:

   ```
   DATABASE_URL="postgresql://…:5432/postgres" npm run db:migrate
   ```

   It applies every file in `supabase/migrations/` not yet recorded in `schema_migrations`, so run it again whenever a migration is added. The first migration enables RLS on every table (spec 6.5).

2. **Netlify**: Add new site → Import an existing project → this GitHub repo. Netlify detects Next.js; build command `npm run build` (already in `netlify.toml`), no publish directory. **Set the functions region to Sydney (ap-southeast-2)** in Site configuration — the database is in Sydney, functions default to the US, and every tap on the club phone makes a handful of round trips.

3. **Environment variables** (Site configuration → Environment variables, for Production *and* Deploy previews):

   | Variable | Server-only? | Notes |
   | --- | --- | --- |
   | `ADMIN_CODES` | **Yes** | `Name:code,Name:code` — one code per organiser; the code identifies who made each change (O-8). Names 1–40 chars, no `:` or `,`. Codes 12+ chars; they are typed on a phone, so avoid ambiguous characters |
   | `DATABASE_URL` | **Yes, never expose** | The Supabase transaction-pooler string. Carries the database password: never prefix it `NEXT_PUBLIC_`, import it in a client component, or log it |
   | `CRON_SECRET` | Yes | Any random string |
   | `ADMIN_CODE` | Yes | Optional fallback for a single unnamed organiser. Used only when `ADMIN_CODES` is unset; treated as `Organiser:{value}` |

   No `NEXT_PUBLIC_*` variables are needed. **Never commit `.env*` files or real credentials**; `.env.example` carries blank values for onboarding.

4. Deploy. `main` is production; other branches get deploy previews. Previews share the same Supabase project, so test on them with a throwaway competition and **abandon it afterwards** (O-7) — otherwise production refuses to start a new one.

5. `netlify/functions/ping.mts` calls `/api/cron/ping` daily (`schedule = "0 3 * * *"`) so the free Supabase project never idles for 7 days.

**Rotating an organiser's code**: edit `ADMIN_CODES`, trigger a redeploy. Because each cookie is signed with the code that created it, only that organiser is logged out; everyone else's phone stays signed in. Deleting a name logs that person out and stops them logging back in.

## Cost

Expected monthly cost: **AUD 0** (Netlify Free + Supabase Free). An optional custom domain is ~AUD 10–15/year. Both free tiers permit club use — that is the whole reason for the move off Vercel Hobby (O-10).

Two limits actually matter:

- **Function invocations, 125,000/month on Netlify Free.** One night a week runs about 26,000. That depends entirely on the `s-maxage=5` cache on `/api/public/bracket` (spec 7.2): viewers refresh every 10 seconds, but at most one refresh every 5 seconds reaches a function. **Without that cache the same usage is roughly 138,000 — over the limit.** Treat it as a cost control, not a nicety. If it ever gets tight, lengthen the public refresh interval before paying anything.
- **Supabase pauses a free project after 7 days of inactivity**, and this app runs one night a week — exactly on the edge. The daily ping is what prevents it. If it pauses anyway, restore it from the Supabase dashboard in about a minute — do that *before* the night, not during.

Database size is under 10 MB after a year, and bandwidth ~2.6 GB/month against a 100 GB allowance. Neither is a concern.

## Working agreements

- **Ask before adding a dependency, a hosting service, or a paid tier** — cheap and self-contained is a hard requirement.
- Reference spec sections (`spec 5.4`) and organiser rulings (`per O-4`) when implementing or changing behaviour.
- Keep this file short. Behaviour belongs in [spec.md](spec.md); details belong in the code.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
