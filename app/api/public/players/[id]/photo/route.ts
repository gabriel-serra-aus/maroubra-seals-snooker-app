// GET /api/public/players/{id}/photo?v=… (spec 7.2, 6.6, O-18). The URL carries the photo's version, so
// the answer never changes and is cached for a year by the browser and Netlify's CDN: each photo reaches a
// function about once, which keeps the free-tier invocation budget intact (CLAUDE.md, Cost).
import { getDb } from "@/lib/db/client";
import { getPlayerPhoto } from "@/lib/db/players";
import { handle } from "@/lib/api/respond";
import { isUuid } from "@/lib/api/validate";
import { notFound } from "@/lib/logic/errors";

export const dynamic = "force-dynamic";

export const GET = handle(async (_request, { params }) => {
  const { id } = await params;
  if (!isUuid(id)) throw notFound("Photo not found");
  const db = await getDb();
  const photo = await getPlayerPhoto(db, id);
  if (!photo) throw notFound("Photo not found");
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
