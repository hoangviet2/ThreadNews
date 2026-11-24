/** Request guards + quotas (docs/architecture/04-auth-and-quotas.md → Enforcement). */
import { timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { FieldValue } from "firebase-admin/firestore";
import type { z } from "zod";
import type { Feature, Tier, Usage } from "@threadnews/shared/schemas";
import { sha } from "@threadnews/graph";
import { ApiError } from "./errors";
import { env } from "./env";
import { appCheck, auth, db } from "./firebase";
import { rc, type Rc } from "./rc";

export type AppEnv = { Variables: { uid: string; tier: Tier; requestId: string } };
export type Ctx = Context<AppEnv>;

export const log = createMiddleware<AppEnv>(async (c, next) => {
  const t = Date.now();
  await next();
  const uid = c.get("uid");
  // No bodies, claims or questions in logs.
  console.log(JSON.stringify({ id: c.get("requestId"), uid: uid && sha(uid).slice(0, 12), method: c.req.method, route: c.req.routePath, status: c.res.status, ms: Date.now() - t }));
});

export const maintenance = createMiddleware<AppEnv>(async (_c, next) => {
  if ((await rc()).maintenance_mode) throw new ApiError("maintenance");
  await next();
});

export const verifyAppCheck = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header("X-Firebase-AppCheck");
  if (!token) {
    if (env().APP_CHECK_ENFORCE) throw new ApiError("app_check_failed");
  } else {
    await appCheck().verifyToken(token).catch(() => {
      throw new ApiError("app_check_failed");
    });
  }
  await next();
});

export const verifyIdToken = createMiddleware<AppEnv>(async (c, next) => {
  const token = /^Bearer (.+)$/.exec(c.req.header("Authorization") ?? "")?.[1];
  if (!token) throw new ApiError("unauthenticated");
  const decoded = await auth()
    .verifyIdToken(token)
    .catch(() => {
      throw new ApiError("unauthenticated");
    });
  c.set("uid", decoded.uid);
  // Tier comes from the verified token, never from Firestore.
  c.set("tier", decoded.firebase.sign_in_provider === "anonymous" ? "guest" : "member");
  await next();
});

// ponytail: in-memory, per instance; a shared store (Firestore/Redis) if instances multiply.
const hits = new Map<string, { start: number; n: number }>();
export const rateLimit = createMiddleware<AppEnv>(async (c, next) => {
  const now = Date.now();
  if (hits.size > 10_000) hits.clear();
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  for (const key of [`u:${c.get("uid")}`, ...(ip ? [`ip:${ip}`] : [])]) {
    const h = hits.get(key);
    if (!h || now - h.start > 60_000) hits.set(key, { start: now, n: 1 });
    else if (++h.n > 30) throw new ApiError("rate_limited");
  }
  await next();
});

export const cronSecret = createMiddleware<AppEnv>(async (c, next) => {
  const want = Buffer.from(env().CRON_SECRET);
  const got = Buffer.from(c.req.header("X-Cron-Secret") ?? "");
  if (!want.length || want.length !== got.length || !timingSafeEqual(want, got)) throw new ApiError("unauthenticated");
  await next();
});

export function requireMember(c: Ctx) {
  if (c.get("tier") !== "member") throw new ApiError("tier_required", { upgrade: true });
}

/** Parse a JSON body with a shared Zod schema → 400 invalid_argument. */
export async function body<T>(c: Ctx, schema: z.ZodType<T>): Promise<T> {
  // Only bad JSON becomes invalid_argument; body-limit errors (thrown while streaming) must reach the 413 handler.
  const json = await c.req.json().catch((e: unknown) => {
    if (e instanceof SyntaxError) return undefined;
    throw e;
  });
  const r = schema.safeParse(json);
  if (!r.success) throw new ApiError("invalid_argument", { issues: r.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })) });
  return r.data;
}

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
export const resetAt = () => {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
};
export const limitsFor = (cfg: Rc, tier: Tier) => (tier === "member" ? cfg.limits_member : cfg.limits_guest);

type AiCost = { calls: number; grounded?: number };
const globalRef = () => db().doc(`usage/_global/days/${utcDay()}`);

/**
 * Per-user daily quota + global AI budget in one transaction. Call after the cache check (cache hits are free).
 * Returns the usage echo and a refund for upstream failures.
 */
export async function charge(c: Ctx, feature: Exclude<Feature, "follows">, ai?: AiCost): Promise<{ usage: Usage; refund: () => Promise<void> }> {
  const cfg = await rc();
  const tier = c.get("tier");
  const limit = limitsFor(cfg, tier)[feature];
  const userRef = db().doc(`usage/${c.get("uid")}/days/${utcDay()}`);
  const used = await db().runTransaction(async (tx) => {
    const [u, g] = await tx.getAll(userRef, globalRef());
    const used = (u!.get(feature) as number | undefined) ?? 0;
    if (used >= limit) throw new ApiError("quota_exceeded", { limit, used, resetAt: resetAt(), upgrade: tier === "guest" });
    if (ai && ((g!.get("aiCalls") as number | undefined) ?? 0) + ai.calls > cfg.global_daily_ai_budget) throw new ApiError("budget_exhausted");
    tx.set(userRef, { [feature]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (ai) tx.set(globalRef(), { aiCalls: FieldValue.increment(ai.calls), groundedCalls: FieldValue.increment(ai.grounded ?? 0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return used + 1;
  });
  return {
    usage: { feature, used, limit, resetAt: resetAt() },
    refund: async () => {
      const b = db().batch();
      b.set(userRef, { [feature]: FieldValue.increment(-1) }, { merge: true });
      if (ai) b.set(globalRef(), { aiCalls: FieldValue.increment(-ai.calls), groundedCalls: FieldValue.increment(-(ai.grounded ?? 0)) }, { merge: true });
      await b.commit();
    },
  };
}

/** Global budget only (cron jobs have no user). Returns false when the day's budget is spent. */
export async function chargeGlobal(ai: AiCost): Promise<boolean> {
  const cfg = await rc();
  return db().runTransaction(async (tx) => {
    const g = await tx.get(globalRef());
    if (((g.get("aiCalls") as number | undefined) ?? 0) + ai.calls > cfg.global_daily_ai_budget) return false;
    tx.set(globalRef(), { aiCalls: FieldValue.increment(ai.calls), groundedCalls: FieldValue.increment(ai.grounded ?? 0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}
