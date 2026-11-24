/** Explainer (GET/POST /v1/explainer) and cloud Ask (POST /v1/ask). */
import { Hono } from "hono";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { z } from "zod";
import { AskAnswer, AskRequest, type AskCitation, type AskResponse, type Explainer } from "@threadnews/shared/schemas";
import { ASK_LOCAL_V1 } from "@threadnews/shared/prompts";
import { communityContext, iso, selectCommunities, storyContext } from "@threadnews/graph";
import { ApiError } from "../errors";
import { db } from "../firebase";
import { embedder, grounded, json } from "../gemini";
import { body, charge, requireMember, type AppEnv } from "../middleware";
import { EXPLAINER_V2, ExplainerOutput, GLOBAL_MAP_V1, GLOBAL_REDUCE_V1, MapAnswer, STRUCTURE_EXPLAINER_V1 } from "../prompts";
import { rc } from "../rc";

const latestEventId = async (storyId: string) =>
  (await db().collection("kg_events").where("storyId", "==", storyId).orderBy("date", "desc").limit(1).get()).docs[0]?.id;

const toExplainer = (d: DocumentSnapshot, latest?: string): Explainer => ({
  storyId: d.id,
  generatedAt: iso(d.get("generatedAt"))!,
  basedOnEventId: d.get("basedOnEventId") ?? "",
  stale: !!latest && latest !== d.get("basedOnEventId"),
  sections: d.get("sections"),
  grounding: d.get("grounding") ?? null,
});

const storyVec = (d: DocumentSnapshot) => (d.get("embedding") as { toArray(): number[] } | undefined)?.toArray() ?? [];

export const story = new Hono<AppEnv>()
  .get("/explainer/:storyId", async (c) => {
    const id = c.req.param("storyId");
    const [ex, latest] = await Promise.all([db().doc(`kg_explainers/${id}`).get(), latestEventId(id)]);
    if (!ex.exists) throw new ApiError("not_generated", { canGenerate: c.get("tier") === "member" });
    return c.json(toExplainer(ex, latest));
  })

  .post("/explainer", async (c) => {
    requireMember(c);
    const { storyId } = await body(c, z.object({ storyId: z.string().min(1).max(128) }));
    const [s, ex, latest] = await Promise.all([db().doc(`kg_stories/${storyId}`).get(), db().doc(`kg_explainers/${storyId}`).get(), latestEventId(storyId)]);
    if (!s.exists) throw new ApiError("not_found");
    if (ex.exists && !toExplainer(ex, latest).stale) return c.json(toExplainer(ex, latest)); // cached: free

    const { usage, refund } = await charge(c, "explainer", { calls: 2, grounded: 1 });
    try {
      const cfg = await rc();
      const qv = storyVec(s);
      const [ctx, bigger] = await Promise.all([
        storyContext(db(), storyId, qv, [], cfg.context_tokens_cloud),
        cfg.enable_global_search && qv.length ? selectCommunities(db(), qv).then(communityContext) : Promise.resolve(""),
      ]);
      const research = await grounded(cfg.model_cloud, EXPLAINER_V2.build({ context: ctx?.context ?? "", bigger }), 0.4);
      const { sections } = await json(ExplainerOutput, cfg.model_fallback, STRUCTURE_EXPLAINER_V1.build({ notes: research.text, found: research.found }), 0.3);
      const generatedAt = new Date();
      const basedOnEventId = ctx?.latestEventId ?? "";
      await db().doc(`kg_explainers/${storyId}`).set({ sections, grounding: research.grounding, generatedAt, model: cfg.model_cloud, basedOnEventId });
      return c.json({ storyId, generatedAt: generatedAt.toISOString(), basedOnEventId, stale: false, sections, grounding: research.grounding, usage } satisfies Explainer);
    } catch (e) {
      await refund();
      throw e;
    }
  })

  .post("/ask", async (c) => {
    requireMember(c);
    const req = await body(c, AskRequest);
    const cfg = await rc();
    const mode = req.mode === "local" || !cfg.enable_global_search ? "local" : "global";
    const { usage, refund } = await charge(c, "ask", { calls: mode === "local" ? 1 : 7 });
    try {
      const [qv] = await embedder(cfg)([req.question]);
      const ctx = await storyContext(db(), req.storyId, qv!, [], mode === "local" ? cfg.context_tokens_cloud : cfg.context_tokens_device);
      if (!ctx) throw new ApiError("not_found");
      let a: AskAnswer;
      const labels = new Map<string, string>();
      if (mode === "local") {
        a = await json(AskAnswer, cfg.model_fallback, ASK_LOCAL_V1.build({ question: req.question, context: ctx.context ?? "" }), 0.2);
      } else {
        const hits = await selectCommunities(db(), qv!);
        for (const h of hits) labels.set(h.id, `${h.title} (community)`);
        const partials = (await Promise.all(hits.map(async (h) => ({ id: h.id, ...(await json(MapAnswer, cfg.model_fallback, GLOBAL_MAP_V1.build({ summary: h.summary, question: req.question }), 0.2)) }))))
          .filter((p) => p.answer.trim().toUpperCase() !== "NONE");
        a = await json(AskAnswer, cfg.model_cloud, GLOBAL_REDUCE_V1.build({ partials, context: ctx.context ?? "", question: req.question }), 0.3);
      }
      const citations: AskCitation[] = a.citations.map((id) => (/^https?:\/\//.test(id) ? { sourceUrl: id } : { nodeId: id, label: labels.get(id) ?? id }));
      return c.json({ answer: a.answer, mode, citations, grounding: null, usage } satisfies AskResponse);
    } catch (e) {
      await refund();
      throw e;
    }
  });
