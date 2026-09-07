# Maroubra Seals Snooker — Tournament App

A single-night, single-elimination snooker competition manager for the Maroubra Seals club.
One organiser runs the night from an admin page; everyone else watches a public bracket.

## Source of truth

Three documents define this project. **Read them before changing behaviour — do not restate or fork their contents here.**

- [snooker-comp-rules.md](snooker-comp-rules.md) — the competition rules.
  - **Part A** = player-facing rules (format, fees, buy-backs, time limit, handicaps, conduct).
  - **Part B** = the app specification (setup/start, buy-back placement, Force Pair, closing buy-backs and the fixed bracket, timer and match states, handicap ratings). Part B section numbers 8–13 are the functional requirements; cite them in code comments and PRs.
- [functional-spec.md](functional-spec.md) — screens, state machines, bracket logic, data model, routes. It carries the organiser's rulings on everything the other two left open, numbered O-1 … O-15; cite those the same way (e.g. "per O-4").
- [tournament-app-plan.md](tournament-app-plan.md) — hosting, framework, database, admin access, cost.

If they conflict, the rules file wins on behaviour and the plan file wins on infrastructure — **except** where the functional spec records an organiser ruling, which supersedes both. All three files have been synced to the O-1 … O-15 rulings (spec 10.2 lists what changed in the rules file), so a disagreement between them now means one of them is stale — fix it rather than picking a side. If a requirement is genuinely absent from all three, ask the organiser rather than inventing one.

## The domain in one paragraph

16 or 32 players are drawn at random into a round-one bracket. Every match is one frame with a 25-minute clock. **A rating is a golf-style handicap: lower is better, and it can be negative.** The weaker player — the one with the *higher* number — starts with two thirds of the difference, rounded (§6 says "lower-rated player", meaning lower in ability; spec 5.6). Round-one losers may buy back once, optionally, and go straight into the bracket: a random empty match while one exists, then beside a random lone player (O-13); round-two losers are out. Buy-backs are capped by the open slots, first come first served. **The bracket is fixed** (O-14): a player's round-one slot sets their place in the whole tree, the winners of M1 and M2 meet in round two, and a winner moves up the moment their match ends. A free pass is what an empty other half gives you, in any round, possibly several in a row; when the buy-back window closes everyone still alone in round one gets one (O-4). The window closes only when the organiser taps **No More Buy-Backs / Late Entries**, never by itself, so late entries and buy-backs are taken right through round one (O-15). The organiser starts and completes each match in the app.

A **late arrival** joins after the draw through Add late arrival: they take an open slot and are placed like a buy-back, but are a `late` entry, not a buy-back, and may still buy back once if they lose (§3, §8.3). A round-one loser who changes their mind buys back through Review result on their match, not through that button.

Vocabulary used throughout code and UI (keep it consistent with the rules doc): **waiting player**, **buy-back**, **late arrival**, **free pass**, **Force Pair**, **Close Buy-Backs** (the button reads "No More Buy-Backs / Late Entries"), **End night here** (closing a night that ran out of time: complete, no winner, "completed (unfinished)" — O-16, and not the same thing as **Abandon**), **bracket size**, **slot**, **box** (a position in the tree), **rating**, **start** (the handicap head start), **master override**.

## Stack

| Layer    | Choice | Notes |
| -------- | ------ | ----- |
| Framework | Next.js (App Router, TypeScript) | Public pages + admin API in one project |
| Hosting   | Netlify free tier | Auto-deploy from GitHub `main`. Not Vercel: Hobby is licensed for personal, non-commercial use (O-10) |
| Database  | Supabase (Postgres) via `DATABASE_URL` and postgres.js | Chosen over Turso for the row-editing web UI — useful for on-the-night manual fixes (O-11). Direct Postgres, not the Supabase JS client, because writes need transactions and row locks (spec 7). With `DATABASE_URL` unset the app and tests run on PGlite, an embedded Postgres under `.data/` — no local service needed |
| Auth      | `ADMIN_CODES` env var (`Name:code` pairs) + session cookie | One code per organiser; the code identifies who, so "changed by" is never typed (O-8). No accounts, no resets, no email |
| Ratings   | Integer, `-100..200`, **lower is better** | Golf-style handicap; negatives are normal for strong players (§6, spec 5.6) |

Local tooling present: Node 25, npm 11, git. Netlify CLI and `gh` are **not** installed — install them before attempting a CLI deploy, or use the Netlify/GitHub web UI. `npm run dev` needs no database service (PGlite); `npm test` runs the logic unit tests and the route-level integration tests on in-memory PGlite. New migrations apply themselves to `.data/pglite` on the next start; to start from scratch delete `.data/pglite` and re-run `npm run db:migrate && npm run db:seed`.

## Architecture rules

- **All bracket logic is server-side and pure.** Draw, pairing, Force Pair, free-pass allocation, advancement and handicap calculation live in plain testable functions (`lib/`), not in components or route handlers. Route handlers validate input, call the logic, persist, and return.
- **The database is the source of truth for match state**, not client state. The public page reads; only admin routes write.
- **Every write route checks the admin session cookie.** No exceptions, including "harmless" ones.
- **The timer is computed from a stored `started_at` timestamp**, never from a client-side counter — the countdown must survive navigation, refresh and a locked phone (rules §12).
- **Advancement is automatic on completion** and runs as one idempotent step after every write (`advanceAll` in `lib/logic/rounds.ts`): it pushes every waiting player up the fixed tree until nothing moves. It is reversible while the winner's next match has not started (rules §12). A mistaken Start is reversible too (O-5). Model corrections explicitly; don't rely on manual DB edits.
- **Every mutating route returns the fresh bracket**, and the admin screens use it instead of fetching again: one round trip per tap. Keep it that way — the club phone is on the far side of the Pacific from Netlify's default region.
- **Nothing is only fixable in the database.** The master override screen (spec 3.9, O-5) is the escape hatch for everything the normal guards refuse — adding and removing players, resetting a finished match, reopening buy-backs. Every override writes an `admin_actions` row naming the organiser.
- **Prefer boring and obvious.** This runs one night a week on a club phone. Fewer moving parts beats clever.

## Testing

Bracket logic is where the bugs will be, so it is where the tests go. Cover at minimum:

- Round-one fill with 16 and 32, with empty slots reserved for buy-backs.
- Placement order (O-13): a random empty match first, even while a first-draw player waits alone; then beside a random lone player; three buy-backs take three different empty matches and the fourth joins one.
- Buy-back capacity capped by open slots, first come first served (O-3).
- Close with 3, 2, 1 and 0 buy-backs on a 13-of-16 bracket → 0, 1, **2** and 1 free passes (O-4). The two-free-pass case is the one that regresses to the old §11 rule.
- The fixed tree (O-14): positional numbering (16: M9 = M1/M2 winners, M15 final; 32: M17…M31); a round-two match forms while round one is still going; no skip while buy-backs are open; after close an empty half gives an immediate pass and cascades (9 players: slot 9 reaches the final unplayed); 13 players + 3 buy-backs is a perfect eight with no pass.
- Force Pair: no-op under two waiting players, never breaks an existing match, refused once buy-backs close (§10).
- Handicap start calculation and rounding: the §6 example (45 vs 20 → 17, to the player on **45**) and negative ratings on both sides of zero.
- Result correction pulling a player back out of the next round, the other player waiting in the box until the new winner arrives; rejection when the loser's buy-back match has started (O-6).
- Overrides: delete refused from round two, pair needs the same box, add climbs from an open place, grow renumbers M9 → M17, reopen takes the close's passes back.
- Cancel start clears the clock and leaves the pairing intact (O-5).
- Rating adjustment: finishing order, the configurable top/bottom groups, a handicap crossing zero into negative, clamping, and idempotence on a second save (O-1).

UI can be checked by hand; the logic cannot.

## Deployment

1. Push to GitHub; connect the repo to Netlify.
2. Set env vars in Netlify: `ADMIN_CODES`, `CRON_SECRET` and `DATABASE_URL` (the Supabase transaction-pooler connection string). `DATABASE_URL` carries the database password and is **server-only** — never expose it to the browser or prefix it with `NEXT_PUBLIC_`. Apply the schema with `npm run db:migrate` against the **session**-pooler URL (port 5432); it applies every file in `supabase/migrations/` not yet recorded, so run it again whenever a migration is added (`0003_late_arrivals.sql`, which adds the `late` entry source, is pending on production until then). Set the **Netlify functions region to Sydney** in Site configuration — the database is in Sydney and the default region is in the US.
3. `main` deploys to production; branches get deploy previews. Rotate one organiser's code by updating `ADMIN_CODES` and redeploying — it logs out only that person.
4. A daily Netlify scheduled function pings the database so the free Supabase project doesn't pause.
5. Never commit `.env*` files or real credentials.

## Working agreements

- Ask before adding a dependency, a hosting service, or a paid tier — cheap and self-contained is a hard requirement of the plan.
- Reference rules sections (e.g. "per §10") and organiser rulings (e.g. "per O-4") when implementing or changing behaviour.
- Keep this file short. Details belong in the three source documents or in the code.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
