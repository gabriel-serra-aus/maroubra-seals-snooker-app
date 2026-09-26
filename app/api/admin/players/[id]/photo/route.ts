// PUT /api/admin/players/{id}/photo (raw image body) and DELETE (spec 7.3, 6.6, O-18).
// The phone shrinks the photo before it is sent; this checks the type, the size and that the bytes are
// really that type of image, then stores it.
import { getDb } from "@/lib/db/client";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, clearPlayerPhoto, setPlayerPhoto, type PhotoType } from "@/lib/db/players";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { handle, json } from "@/lib/api/respond";
import { photoUrl } from "@/lib/bracket/payload";
import { badRequest } from "@/lib/logic/errors";

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** True when the bytes carry the signature of the image type they claim to be. */
function looksLike(mime: PhotoType, b: Uint8Array): boolean {
  if (mime === "image/jpeg") return startsWith(b, [0xff, 0xd8, 0xff]);
  if (mime === "image/png") return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return startsWith(b, ascii("RIFF")) && startsWith(b, ascii("WEBP"), 8);
}

export const PUT = handle(async (request, { params }) => {
  requireAdmin(request);
  const { id } = await params;
  const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!(PHOTO_TYPES as readonly string[]).includes(mime)) throw badRequest("The photo must be a JPEG, PNG or WebP image");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) throw badRequest("The photo is empty");
  if (bytes.length > PHOTO_MAX_BYTES) throw badRequest(`The photo is too big (${Math.round(bytes.length / 1000)} KB; the limit is ${PHOTO_MAX_BYTES / 1000} KB)`);
  if (!looksLike(mime as PhotoType, bytes)) throw badRequest("That file is not the image it says it is");
  const db = await getDb();
  const player = await db.transaction((tx) => setPlayerPhoto(tx, id, mime as PhotoType, bytes));
  return json({ player: { ...player, photo: photoUrl(player) } });
});

export const DELETE = handle(async (request, { params }) => {
  requireAdmin(request);
  const { id } = await params;
  const db = await getDb();
  const player = await db.transaction((tx) => clearPlayerPhoto(tx, id));
  return json({ player: { ...player, photo: null } });
});
