"use client";

/** fetch wrapper for the admin API: JSON in, JSON out, throws the server's error message. */
export async function call<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export const post = <T = Record<string, unknown>>(path: string, body?: unknown) => call<T>("POST", path, body ?? {});
export const patch = <T = Record<string, unknown>>(path: string, body?: unknown) => call<T>("PATCH", path, body ?? {});
export const del = <T = Record<string, unknown>>(path: string, body?: unknown) => call<T>("DELETE", path, body ?? {});
export const get = <T = Record<string, unknown>>(path: string) => call<T>("GET", path);
