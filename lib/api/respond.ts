import { AppError } from "@/lib/logic/errors";

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) return Response.json({ error: err.message }, { status: err.status });
  console.error(err);
  return Response.json({ error: "Internal error" }, { status: 500 });
}

/** Parses a JSON body; an empty body is {}. Anything else that is not a JSON object is a 400. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError(400, "Body must be JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AppError(400, "Body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

type Ctx = { params: Promise<Record<string, string>> };
type Handler = (request: Request, ctx: Ctx) => Promise<Response>;

/** Wraps a route handler so thrown AppErrors become {error} responses with their status. */
export function handle(fn: Handler): Handler {
  return async (request, ctx) => {
    try {
      return await fn(request, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
