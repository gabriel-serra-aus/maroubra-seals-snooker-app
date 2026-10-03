import { AppError } from "@/lib/logic/errors";
import { parseAdminCodes } from "./codes";
import { sessionCookieFromHeader, verifySessionValue, type ScreenView, type Session } from "./session";

/** Session for a route handler request, or null. */
export function sessionFromRequest(request: Request): Session | null {
  const value = sessionCookieFromHeader(request.headers.get("cookie"));
  return verifySessionValue(value, parseAdminCodes());
}

/** The device id and the bracket version a screen sends with every write (spec 7.8, O-22). */
function screenView(request: Request): ScreenView {
  const client = request.headers.get("x-client-id")?.slice(0, 64) || null;
  const raw = request.headers.get("x-bracket-version") ?? "";
  const at = raw.indexOf("@");
  return { client, saw: at > 0 ? { competition: raw.slice(0, at), version: raw.slice(at + 1) } : null };
}

/** Every write route (and every /api/admin read) calls this first (spec 7). */
export function requireAdmin(request: Request): Session {
  const session = sessionFromRequest(request);
  if (!session) throw new AppError(401, "Not signed in");
  return { ...session, view: screenView(request) };
}
