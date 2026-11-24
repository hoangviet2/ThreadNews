/** POST /v1/check — cloud check with Google Search + GraphRAG context, ingested into the graph before responding (docs/API.md). */
import { Hono } from "hono";
import { contextSources, diffClaims, parseContext } from "@threadnews/shared/graph";
import { CheckRequest, type CheckResponse, type Grounding } from "@threadnews/shared/schemas";
import { ingest, isFresh, matchStory, normName, queryText, storyContext, urlHash, type StoryContext } from "@threadnews/graph";
import { db } from "../firebase";
import { embedder, grounded, json } from "../gemini";
import { body, charge, type AppEnv } from "../middleware";
import { CHECK_RESEARCH_V3, CheckAndExtract, STRUCTURE_CHECK_V2 } from "../prompts";
import { rc, type Rc } from "../rc";

export const CHECK_COST = { calls: 2, grounded: 1 };

/** Research (grounded) → structure (JSON). Shared by /v1/check, the recheck cron and seeding. */
export async function cloudCheck(cfg: Rc, req: CheckRequest, ctx: StoryContext | null): Promise<CheckAndExtract & { grounding: Grounding | null }> {
  const research = await grounded(
    cfg.model_cloud,
    CHECK_RESEARCH_V3.build({ ...req, context: ctx?.context ?? "", lastUpdatedAt: ctx?.lastUpdatedAt }),
  );
  const out = await json(CheckAndExtract, cfg.model_fallback, STRUCTURE_CHECK_V2.build({ notes: research.text, claims: req.claims, found: research.found }));
  // The reader's own article is a source of the story ("You are here" on the timeline).
  const own = articleSource(req);
  if (own && !out.extraction.sources.some((s) => urlHash(s.url) === urlHash(own.url))) out.extraction.sources.push(own);
  return { ...out, grounding: research.grounding };
}

/** The article as a graph source, only when `articleUrl` is a real http(s) URL (pasted text sends "pasted-text"). */
export function articleSource(req: Pick<CheckRequest, "articleUrl" | "publisher" | "headline" | "publishedAt">) {
  let u: URL;
  try {
    u = new URL(req.articleUrl);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  return { url: req.articleUrl, publisher: req.publisher ?? u.hostname.replace(/^www\./, ""), title: req.headline, publishedAt: req.publishedAt };
}

export const ingestOptions = (cfg: Rc) => ({ storyMatchThreshold: cfg.story_match_threshold, storyMatchCosine: cfg.story_match_cosine, entityMergeThreshold: cfg.entity_merge_threshold });

export const check = new Hono<AppEnv>().post("/", async (c) => {
  const req = await body(c, CheckRequest);
  const cfg = await rc();
  const embed = embedder(cfg);
  const [qv] = await embed([queryText({ ...req, question: null })]);
  const storyId = req.storyId ?? (await matchStory(db(), qv!, req.entities.map(normName), ingestOptions(cfg)))?.id;
  const ctx = storyId ? await storyContext(db(), storyId, qv!, req.claims, cfg.context_tokens_cloud) : null;

  // Cache: the graph was checked recently → deterministic diff against it, no quota.
  if (ctx && isFresh(ctx.lastCheckedAt, cfg.graph_freshness_hours)) {
    const parsed = parseContext(ctx.context ?? "");
    const { changes, disputed } = diffClaims(req.claims, parsed);
    return c.json({
      storyId: ctx.storyId,
      status: changes.length ? "moved_on" : disputed.length ? "disputed" : "current",
      summary: ctx.summary,
      changes,
      sources: contextSources(parsed),
      grounding: (ctx.lastGrounding as Grounding | undefined) ?? null,
      cached: true,
      checkedAt: ctx.lastCheckedAt!,
    } satisfies CheckResponse);
  }

  const { usage, refund } = await charge(c, "check", CHECK_COST);
  const out = await cloudCheck(cfg, req, ctx).catch(async (e) => {
    await refund();
    throw e;
  });
  const checkId = db().collection("users").doc().id;
  const checkedAt = new Date();

  // Pre-match missed? Ingest matches again on the structured result (title, summary, extracted entities), a far
  // richer signal than the request, and only then creates a story. Runs before responding (Cloud Run throttles
  // CPU after the response; the story page reads the graph right away). A failed ingest never fails the check.
  let sid = ctx?.storyId;
  try {
    sid = (await ingest(db(), embed, out.extraction, { ...ingestOptions(cfg), checkId, storyId: ctx?.storyId, grounding: out.grounding })).storyId;
  } catch (e) {
    console.error(JSON.stringify({ msg: "ingest failed", checkId, err: String(e) }));
  }
  sid ??= db().collection("kg_stories").doc().id;

  const res: CheckResponse = {
    storyId: sid,
    ...out.check,
    sources: out.extraction.sources.map(({ url, publisher, title, publishedAt }) => ({ url, publisher, title, publishedAt })),
    grounding: out.grounding,
    cached: false,
    checkedAt: checkedAt.toISOString(),
    checkId,
    usage,
  };
  await db()
    .doc(`users/${c.get("uid")}/checks/${checkId}`)
    .set({
      createdAt: checkedAt,
      articleUrl: req.articleUrl,
      urlHash: urlHash(req.articleUrl),
      headline: req.headline,
      publisher: req.publisher,
      publishedAt: req.publishedAt,
      claims: req.claims,
      entities: req.entities,
      storyId: sid,
      result: out.check,
      inference: "cloud",
      source: "cloud_check",
    })
    .catch((e) => console.error(JSON.stringify({ msg: "check history write failed", checkId, err: String(e) })));
  return c.json(res);
});
