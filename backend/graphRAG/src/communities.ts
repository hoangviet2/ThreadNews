/** Community build — the GraphRAG global index (docs/GRAPHRAG.md §5). Run by /internal/cron/communities. */
import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { batchWriter, type Embed } from "./ingest";
import type { CommunitySummary } from "./schemas";
import { jaccard } from "./text";

export type SummaryInput = {
  entities: { name: string; type: string; description: string }[];
  stories: { title: string; status: string; lastUpdatedAt?: string }[];
  changes: string[];
};
export type Summarize = (input: SummaryInput) => Promise<CommunitySummary>;

/** Reuse an old id when member Jaccard ≥ 0.5; `changed` when membership moved > 20%. Pure. */
export function stableIds(groups: string[][], old: { id: string; members: string[] }[], newId: () => string) {
  const taken = new Set<string>();
  return groups.map((g) => {
    let best: { id: string; j: number } | null = null;
    for (const o of old) {
      if (taken.has(o.id)) continue;
      const j = jaccard(g, o.members);
      if (j >= 0.5 && (!best || j > best.j)) best = { id: o.id, j };
    }
    if (!best) return { id: newId(), changed: true };
    taken.add(best.id);
    return { id: best.id, changed: best.j < 0.8 };
  });
}

/** Louvain on a weighted undirected graph → groups of node ids. */
function clusters(nodes: string[], edges: [string, string, number][]): string[][] {
  const g = new Graph({ type: "undirected" });
  for (const n of nodes) g.addNode(n);
  for (const [a, b, w] of edges) {
    if (a === b || !g.hasNode(a) || !g.hasNode(b)) continue;
    if (g.hasEdge(a, b)) g.updateEdgeAttribute(a, b, "weight", (x: number) => x + w);
    else g.addEdge(a, b, { weight: w });
  }
  const map = g.size ? louvain(g, { getEdgeWeight: "weight", resolution: 1 }) : Object.fromEntries(nodes.map((n, i) => [n, i]));
  const out = new Map<number, string[]>();
  for (const [n, c] of Object.entries(map)) out.set(c, [...(out.get(c) ?? []), n]);
  return [...out.values()];
}

export async function buildCommunities(db: Firestore, embed: Embed, summarize: Summarize) {
  const stateRef = db.doc("kg_meta/state");
  const dirty = ((await stateRef.get()).get("dirtyCommunityIds") as string[] | undefined) ?? [];
  if (!dirty.length) return { processed: 0, skipped: 0 };

  const snap = await db.doc("kg_meta/entityGraph_0").get();
  const degree = (snap.get("nodes") as Record<string, number>) ?? {};
  const edges = Object.entries((snap.get("edges") as Record<string, number>) ?? {}).map(([k, w]) => [...k.split("|"), w] as [string, string, number]);

  // Level 0 over entities (skip noise < 3), level 1 over the collapsed level-0 graph.
  const l0 = clusters(Object.keys(degree), edges).filter((g) => g.length >= 3);
  const commOf = new Map(l0.flatMap((g, i) => g.map((e) => [e, String(i)] as const)));
  const l1 = clusters(
    l0.map((_, i) => String(i)),
    edges.flatMap(([a, b, w]) => (commOf.has(a) && commOf.has(b) && commOf.get(a) !== commOf.get(b) ? [[commOf.get(a)!, commOf.get(b)!, w] as [string, string, number]] : [])),
  ).map((idx) => idx.flatMap((i) => l0[Number(i)]!));

  // ponytail: reads every community each run; fine for hundreds, page it past a few thousand.
  const old = (await db.collection("kg_communities").get()).docs.map((d) => ({ id: d.id, level: d.get("level") as number, members: (d.get("memberIds") as string[]) ?? [] }));
  const newId = () => db.collection("kg_communities").doc().id;
  const ids0 = stableIds(l0, old.filter((o) => o.level === 0), newId);
  const ids1 = stableIds(l1, old.filter((o) => o.level === 1), newId);
  const parentOf = new Map<number, string>();
  l1.forEach((members, j) => l0.forEach((g, i) => g.every((e) => members.includes(e)) && parentOf.set(i, ids1[j]!.id)));

  const all = [
    ...l0.map((members, i) => ({ level: 0, members, ...ids0[i]!, parentId: parentOf.get(i) })),
    ...l1.map((members, j) => ({ level: 1, members, ...ids1[j]!, parentId: undefined as string | undefined })),
  ];
  const w = batchWriter(db);
  const now = new Date();
  const todo = all.filter((c) => c.changed || dirty.includes(c.id) || (dirty.includes("new") && !old.some((o) => o.id === c.id)));
  const summaries: { id: string; level: number; members: string[]; parentId?: string; s: CommunitySummary; keyEntityIds: string[]; storyIds: string[] }[] = [];

  for (const c of todo) {
    const keyEntityIds = [...c.members].sort((a, b) => (degree[b] ?? 0) - (degree[a] ?? 0)).slice(0, 15);
    const [ents, stories] = await Promise.all([
      db.getAll(...keyEntityIds.map((id) => db.doc(`kg_entities/${id}`))),
      db.collection("kg_stories").where("entityIds", "array-contains-any", keyEntityIds.slice(0, 10)).limit(10).get(),
    ]);
    const storyIds = stories.docs.map((d) => d.id);
    const changes = storyIds.length
      ? (await db.collection("kg_claims").where("storyId", "in", storyIds).where("status", "==", "superseded").limit(10).get()).docs.map(
          (d) => `${d.get("subject")} — ${d.get("predicate")}: was ${d.get("value")}`,
        )
      : [];
    const s = await summarize({
      entities: ents.filter((d) => d.exists).map((d) => ({ name: d.get("name"), type: d.get("type"), description: d.get("description") ?? "" })),
      stories: stories.docs.map((d) => ({ title: d.get("title"), status: d.get("status"), lastUpdatedAt: d.get("lastUpdatedAt")?.toDate?.().toISOString() })),
      changes,
    });
    summaries.push({ ...c, s, keyEntityIds, storyIds });
  }

  const vecs = summaries.length ? await embed(summaries.map((x) => `${x.s.title}\n${x.s.summary}`)) : [];
  summaries.forEach((x, i) => {
    w.set(db.doc(`kg_communities/${x.id}`), {
      level: x.level, parentId: x.parentId, title: x.s.title, summary: x.s.summary, keyEntityIds: x.keyEntityIds, storyIds: x.storyIds,
      memberIds: x.members, size: x.members.length, updatedAt: now, embedding: FieldValue.vector(vecs[i]!),
    });
    if (x.level === 0) {
      for (const e of x.members) w.update(db.doc(`kg_entities/${e}`), { communityId: x.id });
      // ponytail: a story takes the last level-0 community it was found in, not a strict entity majority.
      for (const sId of x.storyIds) w.update(db.doc(`kg_stories/${sId}`), { communityId: x.id });
    }
  });
  // Unchanged communities: keep membership + hierarchy current without a new summary.
  for (const c of all.filter((c) => !todo.includes(c)))
    w.set(db.doc(`kg_communities/${c.id}`), { parentId: c.parentId ?? FieldValue.delete(), memberIds: c.members, size: c.members.length }, { merge: true });
  const live = new Set(all.map((c) => c.id));
  for (const o of old) if (!live.has(o.id)) w.delete(db.doc(`kg_communities/${o.id}`));
  w.set(stateRef, { dirtyCommunityIds: FieldValue.arrayRemove(...dirty), lastCommunityBuildAt: now }, { merge: true });
  await w.close();
  return { processed: summaries.length, skipped: all.length - summaries.length };
}
