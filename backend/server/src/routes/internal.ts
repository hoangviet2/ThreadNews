/** /internal/* — cron jobs + seeding, X-Cron-Secret only, not in the public OpenAPI (docs/API.md → Internal). */
import { Hono } from "hono";
import { z } from "zod";
import { CheckRequest } from "@threadnews/shared/schemas";
import { buildCommunities, CommunitySummary, ingest, isFresh, iso, sha, storyContext } from "@threadnews/graph";
import { db } from "../firebase";
import { embedder, json } from "../gemini";
import { body, chargeGlobal, cronSecret, type AppEnv } from "../middleware";
import { COMMUNITY_SUMMARY_V1 } from "../prompts";
import { rc } from "../rc";
import { CHECK_COST, cloudCheck, ingestOptions } from "./check";

const TIME_BUDGET_MS = 50_000; // Vercel maxDuration is 60 s; stop early and let the next run continue.

async function job(fn: () => Promise<{ processed: number; skipped: number }>) {
  const t = Date.now();
  return { ok: true, ...(await fn()), ms: Date.now() - t };
}

export const internal = new Hono<AppEnv>()
  .use(cronSecret)

  .post("/cron/communities", async (c) => {
    const cfg = await rc();
    return c.json(await job(() => buildCommunities(db(), embedder(cfg), (input) => json(CommunitySummary, cfg.model_fallback, COMMUNITY_SUMMARY_V1.build(input), 0.3))));
  })

  .post("/cron/recheck", async (c) => {
    const cfg = await rc();
    const embed = embedder(cfg);
    return c.json(
      await job(async () => {
        const start = Date.now();
        // ponytail: loads all followed stories and sorts in memory; fine for hundreds of followed stories.
        const followed = (await db().collection("kg_stories").where("followerCount", ">", 0).limit(500).get()).docs
          .filter((s) => !isFresh(iso(s.get("lastCheckedAt")), cfg.graph_freshness_hours))
          .sort((a, b) => (iso(a.get("lastCheckedAt")) ?? "").localeCompare(iso(b.get("lastCheckedAt")) ?? ""))
          .slice(0, 25);
        let processed = 0;
        for (const s of followed) {
          if (Date.now() - start > TIME_BUDGET_MS || !(await chargeGlobal(CHECK_COST))) break;
          const current = await db().collection("kg_claims").where("storyId", "==", s.id).where("status", "==", "current").limit(8).get();
          const claims = current.docs.map((d) => ({ subject: d.get("subject"), predicate: d.get("predicate"), value: d.get("value"), asOf: d.get("asOf") }));
          const vec = (s.get("embedding") as { toArray(): number[] } | undefined)?.toArray() ?? [];
          const ctx = await storyContext(db(), s.id, vec, claims, cfg.context_tokens_cloud);
          const req = { articleUrl: "", headline: s.get("title"), publishedAt: iso(s.get("lastUpdatedAt")), claims, entities: [] };
          const out = await cloudCheck(cfg, req, ctx);
          await ingest(db(), embed, out.extraction, { ...ingestOptions(cfg), checkId: `recheck_${s.id}_${Date.now()}`, storyId: s.id, grounding: out.grounding });
          processed++;
        }
        return { processed, skipped: followed.length - processed };
      }),
    );
  })

  .post("/cron/cleanup", async (c) =>
    c.json(
      await job(async () => {
        const w = db().bulkWriter();
        const cutoff = new Date(Date.now() - 14 * 86_400_000);
        const old = await db().collectionGroup("days").where("updatedAt", "<", cutoff).limit(2000).get();
        old.docs.forEach((d) => w.delete(d.ref));
        // ponytail: walks every user; move to a "has > 100 checks" flag when users reach the thousands.
        let trimmed = 0;
        for (const u of await db().collection("users").listDocuments()) {
          const extra = await u.collection("checks").orderBy("createdAt", "desc").offset(100).limit(200).get();
          extra.docs.forEach((d) => w.delete(d.ref));
          trimmed += extra.size;
        }
        await w.close();
        return { processed: old.size + trimmed, skipped: 0 };
      }),
    ),
  )

  /** One seed story per call (scripts/seed.mjs loops), then call /cron/communities once. */
  .post("/admin/seed", async (c) => {
    const { item } = await body(c, z.object({ item: CheckRequest }));
    const cfg = await rc();
    return c.json(
      await job(async () => {
        const out = await cloudCheck(cfg, item, null);
        await ingest(db(), embedder(cfg), out.extraction, { ...ingestOptions(cfg), checkId: `seed_${sha(item.articleUrl)}`, grounding: out.grounding });
        return { processed: 1, skipped: 0 };
      }),
    );
  });
