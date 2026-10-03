"use client";

/** A refused request, carrying the server's whole reply: some refusals are a question (`code`, O-20). */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---- Two organisers at once (spec 7.8, O-22) ----
// Every write says which open tab sent it and which version of the night's bracket that tab is showing.
// The server refuses a write from a screen that is behind another device's change, and sends the fresh
// bracket with the refusal; it goes to the screen through the "fresh-bracket" event.

/** This open tab: a fresh id per page load. randomUUID needs https or localhost, hence the fallback. */
const clientId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let shown: { competition: string; version: string } | null = null;

interface Versioned {
  version: string;
  competition: { id: string } | null;
}

/** The bracket on screen now (useBracketScreen calls this); a write's own reply moves it forward too. */
export function showingBracket(b: Versioned) {
  if (!b.competition) return;
  if (shown && shown.competition === b.competition.id && b.version < shown.version) return;
  shown = { competition: b.competition.id, version: b.version };
}

export const FRESH_BRACKET = "fresh-bracket";

/** fetch wrapper for the admin API: JSON (or a Blob, sent as-is: a photo) in, JSON out, throws the server's error message. */
export async function call<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  const blob = body instanceof Blob;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = blob ? body.type : "application/json";
  if (method !== "GET") {
    headers["x-client-id"] = clientId;
    if (shown) headers["x-bracket-version"] = `${shown.competition}@${shown.version}`;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? (blob ? body : JSON.stringify(body)) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) {
    // Not a component, so no router: a full navigation to the login page is the honest fallback.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/admin/login";
    throw new Error("Not signed in");
  }
  const fresh = (data as { bracket?: Versioned }).bracket;
  if (fresh?.version !== undefined) showingBracket(fresh);
  if (!res.ok) {
    if ((data as { code?: string }).code === "stale" && fresh) window.dispatchEvent(new CustomEvent(FRESH_BRACKET, { detail: fresh }));
    throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data);
  }
  return data;
}

export const post = <T = Record<string, unknown>>(path: string, body?: unknown) => call<T>("POST", path, body ?? {});
export const patch = <T = Record<string, unknown>>(path: string, body?: unknown) => call<T>("PATCH", path, body ?? {});
export const del = <T = Record<string, unknown>>(path: string, body?: unknown) => call<T>("DELETE", path, body ?? {});
export const put = <T = Record<string, unknown>>(path: string, body: unknown) => call<T>("PUT", path, body);
export const get = <T = Record<string, unknown>>(path: string) => call<T>("GET", path);
