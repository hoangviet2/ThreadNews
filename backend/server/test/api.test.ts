/** API guards + quotas (docs/TESTING.md → apps/api/middleware). Firebase + Gemini are faked; no emulator needed. */
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.CRON_SECRET = "s".repeat(32);
process.env.APP_CHECK_ENFORCE = "true";

// Minimal in-memory Firestore: enough for transactions, batches and FieldValue.increment.
const store = new Map<string, Record<string, unknown>>();
const apply = (prev: Record<string, unknown> = {}, data: Record<string, unknown>) => {
  const out = { ...prev };
  for (const [k, v] of Object.entries(data)) {
    const op = (v as { operand?: number } | null)?.operand;
    out[k] = typeof op === "number" ? ((out[k] as number) ?? 0) + op : v;
  }
  return out;
};
const snap = (path: string) => ({ exists: store.has(path), id: path.split("/").pop(), get: (k: string) => store.get(path)?.[k], data: () => store.get(path) });
const ref = (path: string) => ({ path, id: path.split("/").pop()!, get: async () => snap(path), set: async (d: Record<string, unknown>) => void store.set(path, apply(store.get(path), d)) });
const fakeDb = {
  doc: ref,
  collection: (p: string) => ({ doc: (id?: string) => ref(`${p}/${id ?? Math.random().toString(36).slice(2)}`) }),
  runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) =>
    fn({
      getAll: async (...rs: { path: string }[]) => rs.map((r) => snap(r.path)),
      get: async (r: { path: string }) => snap(r.path),
      set: (r: { path: string }, d: Record<string, unknown>) => store.set(r.path, apply(store.get(r.path), d)),
    }),
  batch: () => {
    const ops: [string, Record<string, unknown>][] = [];
    return {
      set(r: { path: string }, d: Record<string, unknown>) {
        ops.push([r.path, d]);
        return this;
      },
      commit: async () => ops.forEach(([p, d]) => store.set(p, apply(store.get(p), d))),
    };
  },
};

vi.mock("../src/firebase", () => ({
  db: () => fakeDb,
  auth: () => ({
    verifyIdToken: async (t: string) => {
      const [kind, uid] = t.split(":");
      if (kind === "guest") return { uid, firebase: { sign_in_provider: "anonymous" } };
      if (kind === "member") return { uid, firebase: { sign_in_provider: "google.com" } };
      throw new Error("bad token");
    },
  }),
  appCheck: () => ({ verifyToken: async (t: string) => (t === "ok" ? {} : Promise.reject(new Error("bad"))) }),
  remoteConfig: () => ({}),
}));
vi.mock("../src/gemini", async () => {
  const { ApiError } = await import("../src/errors");
  return {
    embedder: () => async (texts: string[]) => texts.map(() => [1, 0]),
    grounded: async () => {
      throw new ApiError("upstream_error");
    },
    json: async () => {
      throw new ApiError("upstream_error");
    },
  };
});
vi.mock("@threadnews/graph", async (orig) => ({
  ...(await orig<typeof import("@threadnews/graph")>()),
  localSearch: async () => ({ storyId: null }),
  matchStory: async () => null,
}));

const { app } = await import("../src/app");

const call = (path: string, token?: string, init: { method?: string; body?: unknown; appCheck?: string | null } = {}) =>
  app.request(path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.appCheck === null ? {} : { "X-Firebase-AppCheck": init.appCheck ?? "ok" }),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
const err = async (r: Response) => ((await r.json()) as { error: { code: string; details?: Record<string, unknown> } }).error;
const retrieveBody = { mode: "local", headline: "Quake", claims: [], entities: [], question: null, storyId: null, budget: "device" };
const checkBody = { articleUrl: "https://news.example.com/q", headline: "Quake death toll rises", claims: [{ subject: "quake", predicate: "death toll", value: "12" }], entities: [] };

beforeEach(() => store.clear());

describe("guards", () => {
  it("health is public", async () => expect((await call("/v1/health", undefined, { appCheck: null })).status).toBe(200));
  it("missing App Check → 401 app_check_failed", async () => {
    const r = await call("/v1/me", "guest:a", { appCheck: null });
    expect([r.status, (await err(r)).code]).toEqual([401, "app_check_failed"]);
  });
  it("invalid App Check → 401 app_check_failed", async () => expect((await err(await call("/v1/me", "guest:a", { appCheck: "nope" }))).code).toBe("app_check_failed"));
  it("missing / bad ID token → 401 unauthenticated", async () => {
    expect((await err(await call("/v1/me"))).code).toBe("unauthenticated");
    expect((await err(await call("/v1/me", "forged:x"))).code).toBe("unauthenticated");
  });
  it("tier comes from the token", async () => {
    expect(await (await call("/v1/me", "guest:a")).json()).toMatchObject({ tier: "guest", limits: { check: 3 } });
    expect(await (await call("/v1/me", "member:b")).json()).toMatchObject({ tier: "member", limits: { check: 50 } });
  });
  it("guest → 403 tier_required on member features", async () => {
    const r = await call("/v1/explainer", "guest:a", { body: { storyId: "s1" } });
    expect([r.status, await err(r)]).toMatchObject([403, { code: "tier_required", details: { upgrade: true } }]);
  });
  it("bad body → 400 invalid_argument", async () => expect((await call("/v1/check", "guest:a", { body: { headline: 1 } })).status).toBe(400));
  it("internal needs the cron secret", async () => {
    expect((await call("/internal/cron/cleanup", undefined, { body: {} })).status).toBe(401);
  });
});

describe("quota", () => {
  it("guest retrieve: 20 ok, 21st → 429 with details", async () => {
    for (let i = 0; i < 20; i++) expect((await call("/v1/graph/retrieve", "guest:q", { body: retrieveBody })).status).toBe(200);
    const r = await call("/v1/graph/retrieve", "guest:q", { body: retrieveBody });
    expect(r.status).toBe(429);
    expect(await err(r)).toMatchObject({ code: "quota_exceeded", details: { limit: 20, used: 20, upgrade: true } });
  });
  it("upstream failure → 502 and the check is refunded", async () => {
    const r = await call("/v1/check", "guest:f", { body: checkBody });
    expect([r.status, (await err(r)).code]).toEqual([502, "upstream_error"]);
    const day = new Date().toISOString().slice(0, 10);
    expect(store.get(`usage/f/days/${day}`)?.check).toBe(0);
    expect(store.get(`usage/_global/days/${day}`)?.aiCalls).toBe(0);
  });
  it("global budget exhausted → 503", async () => {
    store.set(`usage/_global/days/${new Date().toISOString().slice(0, 10)}`, { aiCalls: 999 });
    const r = await call("/v1/check", "guest:b", { body: checkBody });
    expect([r.status, (await err(r)).code]).toEqual([503, "budget_exhausted"]);
  });
});

describe("articleSource", async () => {
  const { articleSource } = await import("../src/routes/check");
  it("pasted text is not a source; real URLs are", () => {
    expect(articleSource({ articleUrl: "pasted-text", headline: "h" })).toBeNull();
    expect(articleSource({ articleUrl: "javascript:alert(1)", headline: "h" })).toBeNull();
    expect(articleSource({ articleUrl: "https://www.bbc.co.uk/news/x", headline: "h" })).toMatchObject({ publisher: "bbc.co.uk" });
  });
});
