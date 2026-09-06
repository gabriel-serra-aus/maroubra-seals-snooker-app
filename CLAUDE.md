# Maroubra Seals Snooker — Tournament App

A single-night, single-elimination snooker competition manager for the Maroubra Seals club.
One organiser runs the night from an admin page; everyone else watches a public bracket.

## Source of truth

Three documents define this project. **Read them before changing behaviour — do not restate or fork their contents here.**

- [snooker-comp-rules.md](snooker-comp-rules.md) — the competition rules.
  - **Part A** = player-facing rules (format, fees, buy-backs, time limit, handicaps, conduct).
  - **Part B** = the app specification (setup/start, buy-back modes, Force Pair, closing buy-backs, timer and match states, handicap ratings). Part B section numbers 8–13 are the functional requirements; cite them in code comments and PRs.
- [functional-spec.md](functional-spec.md) — screens, state machines, bracket logic, data model, routes. It carries the organiser's rulings on everything the other two left open, numbered O-1 … O-12; cite those the same way (e.g. "per O-4").
- [tournament-app-plan.md](tournament-app-plan.md) — hosting, framework, database, admin access, cost.

If they conflict, the rules file wins on behaviour and the plan file wins on infrastructure — **except** where the functional spec records an organiser ruling, which supersedes both. All three files have been synced to the O-1 … O-12 rulings (spec 10.2 lists what changed in the rules file), so a disagreement between them now means one of them is stale — fix it rather than picking a side. If a requirement is genuinely absent from all three, ask the organiser rather than inventing one.

## The domain in one paragraph

16 or 32 players are drawn at random into a round-one bracket. Every match is one frame with a 25-minute clock. **A rating is a golf-style handicap: lower is better, and it can be negative.** The weaker player — the one with the *higher* number — starts with two thirds of the difference, rounded (§6 says "lower-rated player", meaning lower in ability; spec 5.6). Round-one losers may buy back once, optionally, and fill the empty bracket slots — empty matches first, so buy-backs meet buy-backs; round-two losers are out. Buy-backs are capped by the open slots, first come first served. When the window closes, everyone still without an opponent goes to round two, so round one can give several free passes (O-4). The organiser starts and completes each match in the app; winners advance automatically.

Vocabulary used throughout code and UI (keep it consistent with the rules doc): **waiting player**, **buy-back**, **free pass**, **Force Pair**, **Close Buy-Backs**, **bracket size**, **slot**, **rating**, **start** (the handicap head start), **master override**.

## Stack

| Layer    | Choice | Notes |
| -------- | ------ | ----- |
| Framework | Next.js (App Router, TypeScript) | Public pages + admin API in one project |
| Hosting   | Netlify free tier | Auto-deploy from GitHub `main`. Not Vercel: Hobby is licensed for personal, non-commercial use (O-10) |
| Database  | Supabase (Postgres) | Chosen over Turso for the row-editing web UI — useful for on-the-night manual fixes (O-11) |
| Auth      | `ADMIN_CODES` env var (`Name:code` pairs) + session cookie | One code per organiser; the code identifies who, so "changed by" is never typed (O-8). No accounts, no resets, no email |
| Ratings   | Integer, `-100..200`, **lower is better** | Golf-style handicap; negatives are normal for strong players (§6, spec 5.6) |

Local tooling present: Node 25, npm 11, git. Netlify CLI and `gh` are **not** installed — install them before attempting a CLI deploy, or use the Netlify/GitHub web UI.

## Architecture rules

- **All bracket logic is server-side and pure.** Draw, pairing, Force Pair, free-pass allocation, advancement and handicap calculation live in plain testable functions (`lib/`), not in components or route handlers. Route handlers validate input, call the logic, persist, and return.
- **The database is the source of truth for match state**, not client state. The public page reads; only admin routes write.
- **Every write route checks the admin session cookie.** No exceptions, including "harmless" ones.
- **The timer is computed from a stored `started_at` timestamp**, never from a client-side counter — the countdown must survive navigation, refresh and a locked phone (rules §12).
- **Advancement is automatic on completion**, and reversible while the winner's next match has not started (rules §12). A mistaken Start is reversible too (O-5). Model corrections explicitly; don't rely on manual DB edits.
- **Nothing is only fixable in the database.** The master override screen (spec 3.9, O-5) is the escape hatch for everything the normal guards refuse — adding and removing players, resetting a finished match, reopening buy-backs. Every override writes an `admin_actions` row naming the organiser.
- **Prefer boring and obvious.** This runs one night a week on a club phone. Fewer moving parts beats clever.

## Testing

Bracket logic is where the bugs will be, so it is where the tests go. Cover at minimum:

- Round-one fill with 16 and 32, with empty slots reserved for buy-backs.
- The free-slot order: empty matches before the slot beside a waiting first-draw player (O-4, and §3's rule that buy-backs meet each other).
- Buy-back capacity capped by open slots, first come first served (O-3).
- Close with 3, 2, 1 and 0 buy-backs on a 13-of-16 bracket → 0, 1, **2** and 1 free passes (O-4). The two-free-pass case is the one that regresses to the old §11 rule.
- Rounds two onwards never give more than one free pass.
- Both buy-back modes (§9) and the mode switch mid-round-one.
- Force Pair: no-op under two waiting players, never breaks an existing match, hidden from round two (§10).
- Handicap start calculation and rounding: the §6 example (45 vs 20 → 17, to the player on **45**) and negative ratings on both sides of zero.
- Result correction pulling a player back out of the next round; rejection when the loser's buy-back match has started (O-6).
- Cancel start clears the clock and leaves the pairing intact (O-5).
- Rating adjustment: finishing order, the configurable top/bottom groups, a handicap crossing zero into negative, clamping, and idempotence on a second save (O-1).

UI can be checked by hand; the logic cannot.

## Deployment

1. Push to GitHub; connect the repo to Netlify.
2. Set env vars in Netlify: `ADMIN_CODES`, `CRON_SECRET`, plus the Supabase URL and keys. The Supabase service key is **server-only** — never expose it to the browser or prefix it with `NEXT_PUBLIC_`.
3. `main` deploys to production; branches get deploy previews. Rotate one organiser's code by updating `ADMIN_CODES` and redeploying — it logs out only that person.
4. A daily Netlify scheduled function pings the database so the free Supabase project doesn't pause.
5. Never commit `.env*` files or real credentials.

## Working agreements

- Ask before adding a dependency, a hosting service, or a paid tier — cheap and self-contained is a hard requirement of the plan.
- Reference rules sections (e.g. "per §10") and organiser rulings (e.g. "per O-4") when implementing or changing behaviour.
- Keep this file short. Details belong in the three source documents or in the code.
