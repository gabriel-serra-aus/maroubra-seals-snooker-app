// GET /api/admin/competitions/{id}/admin-actions — the audit log for 3.9 (spec 7.6).
import { getDb } from "@/lib/db/client";
import { listAdminActions } from "@/lib/db/adminActions";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

export const GET = handle(async (request, { params }) => {
  requireAdmin(request);
  const { id } = await params;
  const db = await getDb();
  return json({ actions: await listAdminActions(db, id) });
});
