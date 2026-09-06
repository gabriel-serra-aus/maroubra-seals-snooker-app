# Tournament Bracket App — Setup Plan

## Goal

- **Public page** — anyone can view brackets, players, handicaps.
- **Admin page** — protected by a simple code, used to update matches and scores.
- Cheap, self-contained, minimal maintenance.

---

## Hosting

**Netlify**, free tier.

- Free tier is plenty for this, and it **permits club use**. Vercel's Hobby tier is licensed for personal, non-commercial use only, which a club competition with an entry fee does not clearly fit — so Vercel is out (see functional spec, O-10).
- Deploys automatically from a GitHub repo, the same as Vercel would.
- Handles both the public site and the small backend needed for admin updates.
- Daily scheduled function keeps the database awake (see below).

---

## Framework

**Next.js**

- Public pages and admin backend live in one project.
- Netlify detects it and installs its Next.js runtime; no build settings to change.
- Node.js under the hood, so it's all JavaScript.

---

## Database

**Supabase** (Postgres), free tier.

- Chosen over Turso for the web UI that edits rows directly — the thing that saves the night when something needs fixing by hand at the club.
- Free tier permits club use.
- One catch: a free project pauses after 7 days with no activity, and this app runs one night a week. A daily scheduled ping from Netlify keeps it awake; if it pauses anyway, the organiser restores it from the dashboard in about a minute.

---

## Admin Access

Keep it minimal — no user accounts, no password resets, no email:

1. Store the organisers and their codes in one environment variable, `ADMIN_CODES`, as `Name:code` pairs — e.g. `Gabriel:kf83hs2b,Steve:pw9dk21m`.
2. Admin page has a single input box for the code.
3. If it matches one of them, set a session cookie carrying that organiser's name, so the admin stays logged in and the app knows who made each change (the rules ask for this at §13).
4. To change or remove a code, update the environment variable and redeploy. Because each cookie is signed with the code that made it, only the organiser whose code changed is logged out.

---

## Data Model

Settled. See [functional-spec.md](functional-spec.md) section 6 for the tables, and `supabase/migrations/` for the record.

In one paragraph: `players` is the permanent club list (deactivated, never deleted); `competitions` is one night; `entries` is one player in one bracket slot, with a second row when they buy back; `matches` joins two entries and only exists once both slots of a pair are filled; `free_passes` records advancing without playing; `rating_changes` and `admin_actions` are the audit trails.

---

## Rough Cost

| Item                     | Cost          |
| ------------------------ | ------------- |
| Netlify hosting          | Free          |
| Supabase                 | Free          |
| Custom domain (optional) | ~$10–15/year |
