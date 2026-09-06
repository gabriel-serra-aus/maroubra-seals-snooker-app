import { AppError } from "@/lib/logic/errors";
import { parseAdminCodes } from "./codes";
import { sessionCookieFromHeader, verifySessionValue, type Session } from "./session";

/** Session for a route handler request, or null. */
export function sessionFromRequest(request: Request): Session | null {
  const value = sessionCookieFromHeader(request.headers.get("cookie"));
  return verifySessionValue(value, parseAdminCodes());
}

/** Every write route (and every /api/admin read) calls this first (spec 7). */
export function requireAdmin(request: Request): Session {
  const session = sessionFromRequest(request);
  if (!session) throw new AppError(401, "Not signed in");
  return session;
}
