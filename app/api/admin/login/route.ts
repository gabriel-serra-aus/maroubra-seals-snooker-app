// POST /api/admin/login { code } (spec 7.1). The code identifies the organiser (O-8).
import { parseAdminCodes } from "@/lib/auth/codes";
import { createSessionValue, findOrganiserByCode, sessionSetCookie } from "@/lib/auth/session";
import { handle, json, readJson } from "@/lib/api/respond";
import { requiredString } from "@/lib/api/validate";

export const POST = handle(async (request) => {
  const body = await readJson(request);
  const code = requiredString(body, "code", 200);
  const organiser = findOrganiserByCode(code, parseAdminCodes());
  if (!organiser) {
    // A one-second delay on a wrong code (spec 7.1); skipped under test.
    if (process.env.NODE_ENV !== "test") await new Promise((r) => setTimeout(r, 1000));
    return json({ error: "Code not accepted" }, { status: 401 });
  }
  const secure = process.env.NODE_ENV === "production";
  return json(
    { name: organiser.name },
    { headers: { "Set-Cookie": sessionSetCookie(createSessionValue(organiser), { secure }) } },
  );
});
