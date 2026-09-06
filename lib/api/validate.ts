// Hand-rolled input checks. Each returns the typed value or throws a 400 naming the field.
import { badRequest } from "@/lib/logic/errors";

type Body = Record<string, unknown>;

export function optionalString(body: Body, key: string, max = 200): string | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw badRequest(`${key} must be a string`);
  const t = v.trim();
  if (t.length > max) throw badRequest(`${key} must be at most ${max} characters`);
  return t;
}

export function requiredString(body: Body, key: string, max = 200): string {
  const v = optionalString(body, key, max);
  if (!v) throw badRequest(`${key} is required`);
  return v;
}

export function optionalInt(body: Body, key: string, min: number, max: number): number | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v)) throw badRequest(`${key} must be a whole number`);
  if (v < min || v > max) throw badRequest(`${key} must be between ${min} and ${max}`);
  return v;
}

export function requiredInt(body: Body, key: string, min: number, max: number): number {
  const v = optionalInt(body, key, min, max);
  if (v === undefined) throw badRequest(`${key} is required`);
  return v;
}

export function optionalBool(body: Body, key: string): boolean | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw badRequest(`${key} must be true or false`);
  return v;
}

export function optionalEnum<T extends string>(body: Body, key: string, values: readonly T[]): T | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || !values.includes(v as T)) {
    throw badRequest(`${key} must be one of ${values.join(", ")}`);
  }
  return v as T;
}

export function requiredEnum<T extends string>(body: Body, key: string, values: readonly T[]): T {
  const v = optionalEnum(body, key, values);
  if (v === undefined) throw badRequest(`${key} is required`);
  return v;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function requiredUuid(body: Body, key: string): string {
  const v = body[key];
  if (!isUuid(v)) throw badRequest(`${key} must be an id`);
  return v;
}

export function optionalUuid(body: Body, key: string): string | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (!isUuid(v)) throw badRequest(`${key} must be an id`);
  return v;
}

/** Rating: integer in -100..200, negatives allowed (spec 5.6). */
export const RATING_MIN = -100;
export const RATING_MAX = 200;
export const requiredRating = (body: Body, key = "rating") => requiredInt(body, key, RATING_MIN, RATING_MAX);
export const optionalRating = (body: Body, key = "rating") => optionalInt(body, key, RATING_MIN, RATING_MAX);
