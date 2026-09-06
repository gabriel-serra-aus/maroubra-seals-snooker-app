// Session cookie (spec 7.1): seal_admin = {name}.{HMAC-SHA256(name, key = that organiser's code)}.
// Verifying recomputes the HMAC with the code currently configured for that name, so changing one
// organiser's code logs out only that organiser and removing a name invalidates their sessions (8.3).

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Organiser } from "./codes";

export const SESSION_COOKIE = "seal_admin";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface Session {
  name: string;
}

function signature(name: string, code: string): string {
  return createHmac("sha256", code).update(name).digest("hex");
}

/** Compares the typed code with every configured code in constant time; no early exit. */
export function findOrganiserByCode(code: string, organisers: Organiser[]): Organiser | null {
  const probe = createHash("sha256").update(code).digest();
  let found: Organiser | null = null;
  for (const o of organisers) {
    const digest = createHash("sha256").update(o.code).digest();
    if (timingSafeEqual(probe, digest) && found === null) found = o;
  }
  return found;
}

export function createSessionValue(organiser: Organiser): string {
  return `${encodeURIComponent(organiser.name)}.${signature(organiser.name, organiser.code)}`;
}

export function verifySessionValue(value: string | undefined | null, organisers: Organiser[]): Session | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  let name: string;
  try {
    name = decodeURIComponent(value.slice(0, dot));
  } catch {
    return null;
  }
  const given = value.slice(dot + 1);
  const organiser = organisers.find((o) => o.name === name);
  if (!organiser) return null;
  const expected = signature(name, organiser.code);
  if (given.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected)) ? { name } : null;
}

/** Reads the session cookie out of a raw Cookie header. */
export function sessionCookieFromHeader(header: string | null | undefined): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=");
  }
  return undefined;
}

export function sessionSetCookie(value: string, opts: { secure: boolean }): string {
  const attrs = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (opts.secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
