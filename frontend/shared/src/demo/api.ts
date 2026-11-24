/**
 * In-browser stand-in for apps/api, used until the real API is deployed (VITE_/WXT_API_BASE_URL unset).
 * Same contract, quotas, tiers and error codes as docs/API.md, over the fictional seed stories.
 * Unknown stories return `demo_unavailable` instead of inventing a result.
 */
import type { ApiResult, ThreadNewsApi } from "../api/client";
import { diffClaims, parseContext } from "../graph/context";
import { nextUtcMidnight, utcDay } from "../format";
import type { ApiError, CheckResponse, Feature, Me, Tier, Usage } from "../schemas";
import { buildContext } from "./context";
import { demoStories, demoStory, type DemoStory } from "./data";

export type KeyValueStore = { get(key: string): string | null; set(key: string, value: string): void };

export const memoryStore = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};

export const localStore = (): KeyValueStore =>
  typeof localStorage === "undefined" ? memoryStore() : { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v) };

const LIMITS: Record<Tier, Me["limits"]> = {
  guest: { retrieve: 20, check: 3, explainer: 0, ask: 0, follows: 0 },
  member: { retrieve: 200, check: 50, explainer: 20, ask: 30, follows: 50 },
};
const FRESH_MS = 6 * 3_600_000;

export type DemoApiOptions = {
  getUser: () => { uid: string; tier: Tier };
  store?: KeyValueStore;
  latencyMs?: number;
};

export function createDemoApi(o: DemoApiOptions): ThreadNewsApi {
  const store = o.store ?? localStore();
  const wait = () => new Promise((r) => setTimeout(r, o.latencyMs ?? 450));
  const err = (code: ApiError["code"], status: number, message: string, details?: Record<string, unknown>): { ok: false; error: ApiError } => ({
    ok: false,
    error: { code, status, message, details },
  });
  const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data });

  const read = <T>(key: string, fallback: T): T => {
    try {
      return (JSON.parse(store.get(key) ?? "null") as T) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key: string, v: unknown) => store.set(key, JSON.stringify(v));

  const usageKey = () => `tn.demo.usage.${o.getUser().uid}.${utcDay()}`;
  const usage = () => read<Me["usage"]>(usageKey(), { retrieve: 0, check: 0, explainer: 0, ask: 0 });
  const followsKey = () => `tn.demo.follows.${o.getUser().uid}`;
  const generatedKey = "tn.demo.explainers";

  /** quota middleware: limit reached → 429; else +1 (docs/architecture/04-auth-and-quotas.md). */
  function take(feature: Exclude<Feature, "follows">): { ok: true; usage: Usage; refund: () => void } | { ok: false; error: ApiError } {
    const { tier } = o.getUser();
    const limit = LIMITS[tier][feature];
    const u = usage();
    const resetAt = nextUtcMidnight();
    if (u[feature] >= limit) {
      const e = err("quota_exceeded", 429, "Daily limit reached.", { limit, used: u[feature], resetAt, upgrade: tier === "guest" });
      return e;
    }
    u[feature] += 1;
    write(usageKey(), u);
    return {
      ok: true,
      usage: { feature, used: u[feature], limit, resetAt },
      refund: () => {
        const v = usage();
        v[feature] = Math.max(0, v[feature] - 1);
        write(usageKey(), v);
      },
    };
  }

  function match(text: string): { story: DemoStory; score: number } | undefined {
    const words = new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
    let best: { story: DemoStory; score: number } | undefined;
    for (const d of demoStories()) {
      const hits = d.keywords.filter((k) => words.has(k)).length;
      const score = hits / Math.min(d.keywords.length, 5);
      if (hits >= 2 && score > (best?.score ?? 0)) best = { story: d, score: Math.min(0.99, score) };
    }
    return best;
  }

  const requireMember = () => (o.getUser().tier === "member" ? null : err("tier_required", 403, "Sign in to use this feature.", { upgrade: true }));
  const isFresh = (d: DemoStory) => Date.now() - new Date(d.story.lastCheckedAt ?? 0).getTime() < FRESH_MS;

  return {
    mode: "demo",

    async me() {
      await wait();
      const { uid, tier } = o.getUser();
      return ok({ uid, tier, limits: LIMITS[tier], usage: usage(), resetAt: nextUtcMidnight(), features: { globalSearch: true, graphView: true } });
    },

    async retrieve(req) {
      await wait();
      const q = take("retrieve");
      if (!q.ok) return q;
      const found = req.storyId ? demoStory(req.storyId) : match([req.headline, req.question ?? "", ...req.entities, ...req.claims.map((c) => `${c.subject} ${c.predicate} ${c.value}`)].join(" "))?.story;
      if (!found) return ok({ storyId: null });
      return ok({ storyId: found.story.id, matchScore: 0.9, fresh: isFresh(found), lastUpdatedAt: found.story.lastUpdatedAt, ...buildContext(found, req.budget) });
    },

    async search(query) {
      await wait();
      const q = take("retrieve");
      if (!q.ok) return q;
      const words = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
      const items = demoStories()
        .map((d) => {
          const text = `${d.story.title} ${d.story.summary ?? ""} ${d.entities.map((e) => e.name).join(" ")}`.toLowerCase();
          const score = words.length ? words.filter((w) => text.includes(w)).length / words.length : 0;
          return { storyId: d.story.id, title: d.story.title, summary: d.story.summary ?? "", status: d.story.status, lastUpdatedAt: d.story.lastUpdatedAt, score };
        })
        .filter((h) => h.score > 0)
        .sort((a, b) => b.score - a.score);
      return ok({ items });
    },

    async check(req) {
      await wait();
      const found = req.storyId ? demoStory(req.storyId) : match(`${req.headline} ${req.articleUrl.replace(/[-/_.]/g, " ")} ${req.entities.join(" ")}`)?.story;
      const respond = (d: DemoStory, cached: boolean, u?: Usage): ApiResult<CheckResponse> => {
        const ctx = parseContext(buildContext(d, "cloud").context);
        const claims = req.claims.length ? req.claims : d.article.claims;
        const { changes } = diffClaims(claims, ctx);
        const status = d.story.status === "not_news" ? "current" : changes.length ? "moved_on" : d.story.status;
        return ok({
          storyId: d.story.id,
          status,
          summary: d.checkSummary,
          changes,
          sources: d.sources.map((s) => ({ url: s.url, publisher: s.publisher, title: s.title, publishedAt: s.publishedAt })),
          grounding: d.grounding,
          cached,
          checkedAt: cached ? (d.story.lastCheckedAt ?? new Date().toISOString()) : new Date().toISOString(),
          checkId: `demo-${Date.now()}`,
          usage: u,
        });
      };
      // cache before quota (middleware order): fresh stories are free.
      if (found && isFresh(found)) return respond(found, true);
      const q = take("check");
      if (!q.ok) return q;
      if (!found) {
        q.refund();
        return err("demo_unavailable", 503, "Demo mode can only check the sample stories online.");
      }
      // ponytail: demo never marks stale stories fresh, so the quota flow stays demonstrable.
      return respond(found, false, q.usage);
    },

    async getExplainer(storyId) {
      await wait();
      const d = demoStory(storyId);
      if (!d) return err("not_found", 404, "Unknown story.");
      const generated = read<string[]>(generatedKey, []);
      if (!d.explainerReadyByDefault && !generated.includes(storyId)) return err("not_generated", 404, "Explainer not generated yet.", { canGenerate: o.getUser().tier === "member" });
      return ok(d.explainer);
    },

    async generateExplainer(storyId) {
      await wait();
      const d = demoStory(storyId);
      if (!d) return err("not_found", 404, "Unknown story.");
      const denied = requireMember();
      if (denied) return denied;
      const generated = read<string[]>(generatedKey, []);
      if (d.explainerReadyByDefault || generated.includes(storyId)) return ok(d.explainer);
      const q = take("explainer");
      if (!q.ok) return q;
      write(generatedKey, [...generated, storyId]);
      return ok({ ...d.explainer, generatedAt: new Date().toISOString(), usage: q.usage });
    },

    async ask(req) {
      await wait();
      const d = demoStory(req.storyId);
      if (!d) return err("not_found", 404, "Unknown story.");
      const denied = requireMember();
      if (denied) return denied;
      const q = take("ask");
      if (!q.ok) return q;
      return ok({
        answer: `${d.community.summary} ${d.story.summary ?? ""}`.trim(),
        mode: "global",
        citations: [{ nodeId: d.community.id, label: `${d.community.title} (related stories)` }, ...d.sources.slice(0, 2).map((s) => ({ sourceUrl: s.url }))],
        grounding: null,
        usage: q.usage,
      });
    },

    async follow({ storyId }) {
      await wait();
      const denied = requireMember();
      if (denied) return denied;
      if (!demoStory(storyId)) return err("not_found", 404, "Unknown story.");
      const list = read<string[]>(followsKey(), []);
      if (list.includes(storyId)) return err("conflict", 409, "Already following.");
      if (list.length >= LIMITS.member.follows) return err("quota_exceeded", 429, "You can follow up to 50 stories.", { limit: 50, used: list.length });
      write(followsKey(), [...list, storyId]);
      return ok({ following: true, count: list.length + 1 });
    },

    async unfollow(storyId) {
      await wait();
      const denied = requireMember();
      if (denied) return denied;
      write(followsKey(), read<string[]>(followsKey(), []).filter((s) => s !== storyId));
      return ok({ following: false });
    },

    async follows() {
      await wait();
      const denied = requireMember();
      if (denied) return denied;
      const items = read<string[]>(followsKey(), [])
        .map((id) => demoStory(id))
        .filter((d): d is DemoStory => !!d)
        .map((d) => ({ storyId: d.story.id, title: d.story.title, status: d.story.status, lastUpdatedAt: d.story.lastUpdatedAt, unread: false }));
      return ok({ items });
    },
  };
}
