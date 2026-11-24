/** Retrieval (docs/GRAPHRAG.md §4 local, §6 global). Context format must stay parseable by @threadnews/shared/graph. */
import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import type { Claim, RetrieveRequest, RetrieveResponse } from "@threadnews/shared/schemas";
import { matchStory, type Embed } from "./ingest";
import { cosine, factKey, iso, normName, tokens } from "./text";

export type PackNode = { id: string; kind: "event" | "claim" | "entity" | "source"; line: string; score: number; group?: string };
const KIND_ORDER = { event: 0, claim: 1, entity: 2, source: 3 } as const;

/** Pick nodes by score until the budget is full, never splitting a group (supersede chain). Pure. */
export function rankAndPack(header: string, nodes: PackNode[], budgetTokens: number) {
  const groups = new Map<string, PackNode[]>();
  for (const n of nodes) groups.set(n.group ?? n.id, [...(groups.get(n.group ?? n.id) ?? []), n]);
  const ranked = [...groups.values()].sort((a, b) => Math.max(...b.map((n) => n.score)) - Math.max(...a.map((n) => n.score)));
  let used = tokens(header);
  const chosen: PackNode[] = [];
  for (const g of ranked) {
    const t = g.reduce((s, n) => s + tokens(n.line) + 1, 0);
    if (used + t > budgetTokens) continue;
    chosen.push(...g);
    used += t;
  }
  chosen.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || nodes.indexOf(a) - nodes.indexOf(b));
  return { context: [header, ...chosen.map((n) => n.line)].join("\n"), nodeIds: chosen.map((n) => n.id), tokenEstimate: used };
}

const q = (s: unknown) => String(s ?? "").replace(/["\r\n]+/g, " ").trim();
const minute = (v: unknown) => iso(v)?.slice(0, 16).concat("Z");
const vec = (v: unknown) => (v as { toArray?: () => number[] } | undefined)?.toArray?.();
const recency = (date?: string) => {
  const t = date ? Date.parse(date) : NaN;
  return Number.isNaN(t) ? 0.5 : Math.exp(-Math.max(0, Date.now() - t) / 86_400_000 / 7);
};

export type StoryContext = RetrieveResponse & { storyId: string; title: string; summary: string; status: string; lastCheckedAt?: string; lastGrounding?: unknown; latestEventId?: string };

/** Load one story's subgraph (≤ 2 hops, ~5 queries) and pack it for a model. */
export async function storyContext(db: Firestore, storyId: string, queryVec: number[], articleClaims: Claim[], budgetTokens: number): Promise<StoryContext | null> {
  const s = await db.doc(`kg_stories/${storyId}`).get();
  if (!s.exists) return null;
  const [events, claims] = await Promise.all([
    db.collection("kg_events").where("storyId", "==", storyId).orderBy("date", "desc").limit(12).get(),
    db.collection("kg_claims").where("storyId", "==", storyId).limit(60).get(),
  ]);
  const entityIds = ((s.get("entityIds") as string[]) ?? []).slice(0, 20);
  const entities = entityIds.length ? await db.getAll(...entityIds.map((id) => db.doc(`kg_entities/${id}`))) : [];

  const srcFreq = new Map<string, number>();
  for (const d of [...claims.docs, ...events.docs]) for (const id of (d.get("sourceIds") as string[]) ?? []) srcFreq.set(id, (srcFreq.get(id) ?? 0) + 1);
  const srcIds = [...srcFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
  const sources = srcIds.length ? await db.getAll(...srcIds.map((id) => db.doc(`kg_sources/${id}`))) : [];

  const articleKeys = new Set(articleClaims.map(factKey));
  const nodes: PackNode[] = [];
  events.docs.forEach((d, i) => {
    const src = ((d.get("sourceIds") as string[]) ?? []).join(",");
    nodes.push({
      id: d.id,
      kind: "event",
      line: `EVENT ${d.id} ${d.get("date")} "${q(d.get("headline"))}"${src ? ` src=${src}` : ""}`,
      score: cosine(queryVec, vec(d.get("embedding"))) * recency(d.get("date")) * (i < 3 ? 2 : 1),
    });
  });
  for (const d of claims.docs) {
    const c = d.data();
    const src = ((c.sourceIds as string[]) ?? []).join(",");
    const tag = c.status === "superseded" && c.supersededBy ? `superseded→${c.supersededBy}` : c.status;
    const priority = (articleKeys.has(c.claimKey) ? 3 : 1) * (c.status === "disputed" ? 2 : 1);
    nodes.push({
      id: d.id,
      kind: "claim",
      group: c.claimKey,
      line: `CLAIM ${d.id} [${tag}] ${q(c.subject)} :: ${q(c.predicate)} = ${q(c.value)}${c.asOf ? ` (asOf ${c.asOf})` : ""}${src ? ` src=${src}` : ""}${c.status === "superseded" && c.reason ? ` reason=${c.reason}` : ""}`,
      score: cosine(queryVec, vec(c.embedding)) * recency(c.asOf) * priority,
    });
  }
  for (const d of entities) {
    if (!d.exists) continue;
    nodes.push({ id: d.id, kind: "entity", line: `ENTITY ${d.id} ${d.get("type")} "${q(d.get("name"))}" — ${q(d.get("description"))}`, score: cosine(queryVec, vec(d.get("embedding"))) * 0.8 });
  }
  for (const d of sources) {
    if (!d.exists) continue;
    const day = (iso(d.get("publishedAt")) ?? "").slice(0, 10);
    nodes.push({ id: d.id, kind: "source", line: `SOURCE ${d.id} ${q(d.get("publisher"))}${day ? ` ${day}` : ""} "${q(d.get("title"))}" url=${d.get("url")}`, score: 0.3 });
  }

  const header = `STORY ${storyId} "${q(s.get("title"))}" status=${s.get("status")} updated=${minute(s.get("lastUpdatedAt"))} checked=${minute(s.get("lastCheckedAt"))}`;
  return {
    storyId,
    title: s.get("title"),
    summary: s.get("summary") ?? "",
    status: s.get("status"),
    lastUpdatedAt: iso(s.get("lastUpdatedAt")),
    lastCheckedAt: iso(s.get("lastCheckedAt")),
    lastGrounding: s.get("lastGrounding"),
    latestEventId: events.docs[0]?.id,
    ...rankAndPack(header, nodes, budgetTokens),
  };
}

export type LocalOptions = { freshnessHours: number; tokensDevice: number; tokensCloud: number; storyMatchThreshold: number; storyMatchCosine: number };

export const queryText = (r: Pick<RetrieveRequest, "headline" | "claims" | "question">) =>
  r.question ?? `${r.headline} | ${r.claims.map((c) => `${c.subject} ${c.predicate} ${c.value}`).join("; ")}`;

export const isFresh = (lastCheckedAt: string | undefined, hours: number) => !!lastCheckedAt && Date.now() - Date.parse(lastCheckedAt) < hours * 3_600_000;

/** POST /v1/graph/retrieve, mode=local. */
export async function localSearch(db: Firestore, embed: Embed, req: RetrieveRequest, o: LocalOptions): Promise<StoryContext | { storyId: null }> {
  const [qv] = await embed([queryText(req)]);
  let storyId = req.storyId;
  let matchScore = 1;
  if (!storyId) {
    const m = await matchStory(db, qv!, req.entities.map(normName), o);
    if (!m) return { storyId: null };
    ({ id: storyId, score: matchScore } = m);
  }
  const ctx = await storyContext(db, storyId, qv!, req.claims, req.budget === "device" ? o.tokensDevice : o.tokensCloud);
  if (!ctx) return { storyId: null };
  return { ...ctx, matchScore, fresh: isFresh(ctx.lastCheckedAt, o.freshnessHours) };
}

/** Keyword relevance: 0.7·cosine + 0.3·share of query words found in the story text. Pure. */
export function searchScore(query: string, cos: number, text: string) {
  const words = normName(query).split(" ").filter((w) => w.length > 2);
  const hay = normName(text);
  const kw = words.length ? words.filter((w) => hay.includes(w)).length / words.length : 0;
  return { score: 0.7 * cos + 0.3 * kw, kw };
}

/** POST /v1/graph/search: explore stories by keywords (embedding nearest + keyword overlap). */
export async function searchStories(db: Firestore, queryVec: number[], query: string, limit = 8) {
  const near = await db
    .collection("kg_stories")
    .findNearest({ vectorField: "embedding", queryVector: queryVec, limit: 12, distanceMeasure: "COSINE", distanceResultField: "_d" })
    .get();
  return near.docs
    .map((d) => {
      const cos = 1 - (d.get("_d") as number);
      const { score, kw } = searchScore(query, cos, `${d.get("title")} ${d.get("summary") ?? ""} ${((d.get("entityNorms") as string[]) ?? []).join(" ")}`);
      return { storyId: d.id, title: d.get("title") as string, summary: (d.get("summary") as string) ?? "", status: d.get("status") as string, lastUpdatedAt: iso(d.get("lastUpdatedAt")) ?? "", score, kw, cos };
    })
    // ponytail: fixed cut-offs, tune with real queries (a Remote Config knob if they need changing in prod).
    .filter((h) => h.kw > 0 || h.cos >= 0.62)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ kw: _k, cos: _c, ...h }) => h);
}

export type CommunityHit = { id: string; level: number; title: string; summary: string };

/** Global entry points: top-3 level-1 communities + their 2 nearest level-0 children (§6.2). */
export async function selectCommunities(db: Firestore, queryVec: number[]): Promise<CommunityHit[]> {
  const col = db.collection("kg_communities");
  const nearest = (level: number, limit: number) =>
    col.where("level", "==", level).findNearest({ vectorField: "embedding", queryVector: queryVec, limit, distanceMeasure: "COSINE" }).get();
  const hit = (d: DocumentSnapshot): CommunityHit => ({ id: d.id, level: d.get("level"), title: d.get("title"), summary: d.get("summary") });

  const top = await nearest(1, 3);
  if (top.empty) return (await nearest(0, 6)).docs.map(hit);
  const children = await col.where("parentId", "in", top.docs.map((d) => d.id)).get();
  const picked = top.docs.flatMap((p) =>
    children.docs
      .filter((c) => c.get("parentId") === p.id)
      .sort((a, b) => cosine(queryVec, vec(b.get("embedding"))) - cosine(queryVec, vec(a.get("embedding"))))
      .slice(0, 2),
  );
  return [...top.docs, ...picked].map(hit);
}

export const communityContext = (hits: CommunityHit[]) => hits.map((c) => `COMMUNITY ${c.id} "${q(c.title)}" — ${q(c.summary)}`).join("\n");
