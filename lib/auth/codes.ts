// ADMIN_CODES: "Name:code,Name:code" — one code per organiser, the code identifies who (O-8, spec 8.2).
// ADMIN_CODE: optional single unnamed fallback, treated as "Organiser:{value}".

export interface Organiser {
  name: string;
  code: string;
}

export function parseAdminCodes(env: Record<string, string | undefined> = process.env): Organiser[] {
  const raw = env.ADMIN_CODES?.trim();
  if (raw) {
    const organisers = raw
      .split(",")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const i = pair.indexOf(":");
        if (i <= 0) throw new Error(`ADMIN_CODES entry "${pair}" must be Name:code`);
        const name = pair.slice(0, i).trim();
        const code = pair.slice(i + 1).trim();
        if (name.length < 1 || name.length > 40) throw new Error(`ADMIN_CODES name "${name}" must be 1-40 characters`);
        if (!code) throw new Error(`ADMIN_CODES entry for "${name}" has an empty code`);
        return { name, code };
      });
    const names = new Set<string>();
    for (const o of organisers) {
      if (names.has(o.name)) throw new Error(`ADMIN_CODES has "${o.name}" twice`);
      names.add(o.name);
    }
    return organisers;
  }
  if (env.ADMIN_CODE?.trim()) return [{ name: "Organiser", code: env.ADMIN_CODE.trim() }];
  return [];
}
