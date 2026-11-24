/** API errors: `{ error: { code, message, details? } }` (docs/API.md → Errors). */
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorCode } from "@threadnews/shared/schemas";

type ServerCode = Exclude<ErrorCode, "network" | "demo_unavailable">;
const CODES: Record<ServerCode, [ContentfulStatusCode, string]> = {
  invalid_argument: [400, "The request is invalid."],
  unauthenticated: [401, "Sign-in required."],
  app_check_failed: [401, "App verification failed."],
  tier_required: [403, "Sign in with Google to use this."],
  not_found: [404, "Not found."],
  not_generated: [404, "The explainer hasn't been generated yet."],
  conflict: [409, "Already exists."],
  quota_exceeded: [429, "Daily limit reached."],
  rate_limited: [429, "Too many requests. Try again in a minute."],
  upstream_error: [502, "The AI service failed. Try again."],
  budget_exhausted: [503, "High demand. On-device features still work."],
  maintenance: [503, "ThreadNews is being updated."],
};

export class ApiError extends Error {
  constructor(public code: ServerCode, public details?: Record<string, unknown>, message?: string) {
    super(message ?? CODES[code][1]);
  }
  get status() {
    return CODES[this.code][0];
  }
}

export function onError(err: Error, c: Context) {
  if (err instanceof ApiError) return c.json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } }, err.status);
  if (err instanceof HTTPException && err.status === 413) return c.json({ error: { code: "invalid_argument", message: "Request body too large." } }, 413);
  // Never echo stacks or upstream messages (docs/architecture/06-security-privacy.md).
  console.error(JSON.stringify({ id: c.get("requestId"), msg: "unhandled", err: String(err) }));
  return c.json({ error: { code: "internal", message: "Something on our side failed. Try again." } }, 500);
}
