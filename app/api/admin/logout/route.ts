// POST /api/admin/logout (spec 7.1).
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { sessionClearCookie } from "@/lib/auth/session";
import { handle, json } from "@/lib/api/respond";

export const POST = handle(async (request) => {
  requireAdmin(request);
  return json({ ok: true }, { headers: { "Set-Cookie": sessionClearCookie() } });
});
