/** GET /v1/me and follows (members). */
import { Hono } from "hono";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import type { FollowItem, Me } from "@threadnews/shared/schemas";
import { iso } from "@threadnews/graph";
import { ApiError } from "../errors";
import { db } from "../firebase";
import { body, limitsFor, requireMember, resetAt, utcDay, type AppEnv } from "../middleware";
import { rc } from "../rc";

const FollowRequest = z.object({ storyId: z.string().min(1).max(128), articleUrl: z.string().max(2048) });

export const user = new Hono<AppEnv>()
  .get("/me", async (c) => {
    const cfg = await rc();
    const uid = c.get("uid");
    const tier = c.get("tier");
    const u = await db().doc(`usage/${uid}/days/${utcDay()}`).get();
    const n = (k: string) => (u.get(k) as number | undefined) ?? 0;
    return c.json({
      uid,
      tier,
      limits: limitsFor(cfg, tier),
      usage: { retrieve: n("retrieve"), check: n("check"), explainer: n("explainer"), ask: n("ask") },
      resetAt: resetAt(),
      features: { globalSearch: cfg.enable_global_search, graphView: cfg.enable_graph_view },
    } satisfies Me);
  })

  .post("/follows", async (c) => {
    requireMember(c);
    const { storyId, articleUrl } = await body(c, FollowRequest);
    const limit = limitsFor(await rc(), c.get("tier")).follows;
    const col = db().collection(`users/${c.get("uid")}/follows`);
    const followRef = col.doc(storyId);
    const storyRef = db().doc(`kg_stories/${storyId}`);
    const count = await db().runTransaction(async (tx) => {
      const [f, s] = await tx.getAll(followRef, storyRef);
      if (!s!.exists) throw new ApiError("not_found");
      if (f!.exists) throw new ApiError("conflict");
      const used = (await tx.get(col.count())).data().count;
      if (used >= limit) throw new ApiError("quota_exceeded", { limit, used, upgrade: false });
      tx.create(followRef, { storyId, articleUrl, followedAt: new Date(), lastSeenEventId: null, lastNotifiedAt: null });
      tx.update(storyRef, { followerCount: FieldValue.increment(1) });
      return used + 1;
    });
    return c.json({ following: true, count }, 201);
  })

  .delete("/follows/:storyId", async (c) => {
    requireMember(c);
    const storyId = c.req.param("storyId");
    const followRef = db().doc(`users/${c.get("uid")}/follows/${storyId}`);
    await db().runTransaction(async (tx) => {
      if (!(await tx.get(followRef)).exists) return;
      tx.delete(followRef);
      tx.set(db().doc(`kg_stories/${storyId}`), { followerCount: FieldValue.increment(-1) }, { merge: true });
    });
    return c.json({ following: false });
  })

  .get("/follows", async (c) => {
    requireMember(c);
    const follows = await db().collection(`users/${c.get("uid")}/follows`).limit(50).get();
    if (follows.empty) return c.json({ items: [] });
    const stories = await db().getAll(...follows.docs.map((f) => db().doc(`kg_stories/${f.id}`)));
    const items: FollowItem[] = follows.docs.flatMap((f, i) => {
      const s = stories[i]!;
      if (!s.exists) return [];
      const updated = iso(s.get("lastUpdatedAt")) ?? "";
      const seen = iso(f.get("lastNotifiedAt")) ?? iso(f.get("followedAt")) ?? "";
      return [{ storyId: f.id, title: s.get("title"), status: s.get("status"), lastUpdatedAt: updated, unread: updated > seen }];
    });
    return c.json({ items });
  });
