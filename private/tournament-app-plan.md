# Tournament Bracket App — Setup Plan

## Goal

- **Public page** — anyone can view brackets, players, handicaps.
- **Admin page** — protected by a simple code, used to update matches and scores.
- Cheap, self-contained, minimal maintenance.

---

## Hosting

**Recommended: Vercel** (or Netlify)

- Free tier is plenty for this.
- Deploys automatically from a GitHub repo.
- Handles both the public site and the small backend needed for admin updates.

---

## Framework

**Next.js**

- Public pages and admin backend live in one project.
- Works out of the box on Vercel.
- Node.js under the hood, so it's all JavaScript.

---

## Database

**Supabase** or **Turso** — both have free tiers that comfortably cover a tournament app.

- Supabase: Postgres, with a web UI for viewing/editing rows directly.
- Turso: SQLite-based, very lightweight and simple.

---

## Admin Access

Keep it minimal:

1. Store one password as an environment variable in Vercel (e.g. `ADMIN_CODE`).
2. Admin page has a single input box for the code.
3. If it matches, set a session cookie so the admin stays logged in.
4. To change the code, update the environment variable and redeploy.

No user accounts, no password resets, no email.

---

## Data Model (rough)

TBC

---

## Rough Cost

| Item                     | Cost          |
| ------------------------ | ------------- |
| Vercel hosting           | Free          |
| Supabase / Turso         | Free          |
| Custom domain (optional) | ~$10–15/year |
