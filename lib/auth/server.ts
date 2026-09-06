// Server-component side of the session: reads the cookie via next/headers.
// Kept apart from requireAdmin.ts so route handlers (and their tests) never import next/headers.
import { cookies } from "next/headers";
import { parseAdminCodes } from "./codes";
import { SESSION_COOKIE, verifySessionValue, type Session } from "./session";

export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifySessionValue(jar.get(SESSION_COOKIE)?.value, parseAdminCodes());
}
