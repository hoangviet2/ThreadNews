/** POST /v1/graph/retrieve — GraphRAG local (one story's subgraph) or global (community summaries). */
import { Hono } from "hono";
import { RetrieveRequest, SearchRequest, type RetrieveResponse, type SearchResponse } from "@threadnews/shared/schemas";
import { communityContext, localSearch, queryText, searchStories, selectCommunities, tokens } from "@threadnews/graph";
import { db } from "../firebase";
import { embedder } from "../gemini";
import { body, charge, type AppEnv } from "../middleware";
import { rc } from "../rc";

// ponytail: per-instance memory cache, 10 min, keyed as docs/API.md says (storyId, mode, budget).
const cache = new Map<string, { at: number; res: RetrieveResponse }>();

export const graph = new Hono<AppEnv>().post("/retrieve", async (c) => {
  const req = await body(c, RetrieveRequest);
  const key = req.storyId && !req.question ? `${req.storyId}|${req.mode}|${req.budget}` : null;
  const hit = key && cache.get(key);
  if (hit && Date.now() - hit.at < 600_000) return c.json(hit.res);

  await charge(c, "retrieve");
  const cfg = await rc();
  const embed = embedder(cfg);
  let res: RetrieveResponse;
  if (req.mode === "global" && cfg.enable_global_search) {
    const [qv] = await embed([queryText(req)]);
    const hits = await selectCommunities(db(), qv!);
    const context = communityContext(hits);
    res = { storyId: req.storyId, context, nodeIds: hits.map((h) => h.id), tokenEstimate: tokens(context) };
  } else {
    const r = await localSearch(db(), embed, req, {
      freshnessHours: cfg.graph_freshness_hours,
      tokensDevice: cfg.context_tokens_device,
      tokensCloud: cfg.context_tokens_cloud,
      storyMatchThreshold: cfg.story_match_threshold,
      storyMatchCosine: cfg.story_match_cosine,
    });
    res = r.storyId === null ? { storyId: null } : { storyId: r.storyId, matchScore: r.matchScore, fresh: r.fresh, lastUpdatedAt: r.lastUpdatedAt, context: r.context, nodeIds: r.nodeIds, tokenEstimate: r.tokenEstimate };
  }
  if (key && res.storyId) cache.set(key, { at: Date.now(), res });
  return c.json(res);
})
  /** Explore by keywords: known stories closest to the query (quota: retrieve). Nothing found → the client offers a cloud check. */
  .post("/search", async (c) => {
    const { query } = await body(c, SearchRequest);
    await charge(c, "retrieve");
    const cfg = await rc();
    const [qv] = await embedder(cfg)([query]);
    const items = (await searchStories(db(), qv!, query)) as SearchResponse["items"];
    return c.json({ items } satisfies SearchResponse);
  });
